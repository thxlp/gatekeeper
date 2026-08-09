import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccountsService } from '../account/accounts.service';
import { Account } from '../account/account.entity';
import { SupabaseAuthService } from './supabase-auth.service';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AuthGuard, getAccount } from './auth.guard';
import { MailService } from '../mail/mail.service';
import { otpEmail } from '../mail/mail-templates';
import { NotificationsService } from '../notification/notifications.service';
import { OtpVerifyDto, TwoFaOtpRequestDto } from './otp.dto';
import { SESSION_COOKIE_NAME } from './session.constants';
import { isTwoFactorAvailable, TWO_FACTOR_MAINTENANCE_MSG } from './two-factor.flag';

// เก็บ api_key จริงใน httpOnly cookie เท่านั้น (ไม่ echo กลับใน JSON body) — JS บน dashboard
// origin อ่านไม่ได้แม้เกิด XSS ก็ตาม ใช้ maxAge ยาว (30 วัน) เพราะตัวบังคับอายุจริงคือ idle
// timeout ฝั่ง server (ดู AccountsService.findByApiKey) ไม่ใช่อายุของ cookie เอง
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
@UseGuards(CookieChallengeGuard)
export class AuthController {
  constructor(
    private accounts: AccountsService,
    private supabaseAuth: SupabaseAuthService,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {}

  /** แปลง Supabase access token (Authorization header) เป็น account ของเรา — first factor */
  private async accountFromSupabaseToken(authHeader: string | undefined): Promise<Account> {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const identity = await this.supabaseAuth.verifyAccessToken(token);
    if (!identity) throw new UnauthorizedException('invalid_supabase_session');

    const account = await this.accounts.findOrCreateFromSupabase(identity.id, identity.email);
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');
    return account;
  }

  /**
   * ส่ง OTP แบบ fail-closed: เมลไม่ออกจริง = ล้าง challenge ทิ้งแล้วตอบ 503
   *
   * ต้อง await (ไม่ใช่ void) เพราะเคสที่เจอจริง 2026-08-08 คือโฮสต์บล็อกพอร์ต SMTP ขาออก →
   * sendMail ล้มเงียบ แต่ challenge ถูกเขียนลง DB ไปแล้ว ผู้ใช้เลยค้างอยู่หน้ากรอกรหัสที่
   * ไม่มีวันมาถึง แถมกด "ส่งรหัสอีกครั้ง" ก็ยังติด cooldown 60s ที่ถูกกินไปตั้งแต่รอบแรก
   * ล้าง challenge ทิ้งด้วยเพื่อให้รอบถัดไปเริ่มใหม่ได้สะอาด ไม่ค้างเป็นขยะให้ hasActiveOtp
   * ไปเจอแล้วข้ามการส่งเมลรอบหน้าอีก
   */
  private async sendOtpOrFail(account: Account, code: string, purposeLabel: string): Promise<void> {
    const t = otpEmail(code, purposeLabel);
    const sent = await this.mail.send(account.email, t.subject, t.text);
    if (!sent) {
      await this.accounts.clearOtp(account.id);
      throw new ServiceUnavailableException(
        'mail_send_failed — ส่งอีเมลรหัสยืนยันไม่สำเร็จ ลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ',
      );
    }
  }

  /** ออก api_key + เซ็ต session cookie — จุดเดียวที่ session เกิดจริง (หลังผ่านครบทุก factor) */
  private async issueSessionCookie(account: Account, res: Response) {
    const { plainKey, keyPrefix } = await this.accounts.issueApiKey(account);
    res.cookie(SESSION_COOKIE_NAME, plainKey, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    });
    return { keyPrefix, email: account.email, plan: account.plan };
  }

  /**
   * เรียกจาก frontend ทันทีหลัง Supabase auth สำเร็จ (email/password, GitHub, Google —
   * หน้าตาเหมือนกันหมดตรงนี้) พร้อม Supabase access token ใน Authorization header
   * ออก gatekeeper api_key "ตัวใหม่" ให้เสมอ (DB เก็บแค่ hash — ระบบไม่รู้ plaintext ของ key
   * เดิมอีกแล้ว) frontend เรียกเฉพาะตอนยังไม่มี key ในเครื่อง จึงไม่ churn โดยไม่จำเป็น
   * key เก่าของเครื่องอื่นยังใช้ได้ต่อจนหลุดโควตา (ดู AccountsService.issueApiKey)
   *
   * บัญชีที่เปิด 2FA: ยังไม่ออก cookie — ส่งรหัส OTP ไปที่อีเมลแล้วตอบ { mfaRequired: true }
   * ให้ frontend พาไปกรอกรหัส แล้วค่อยแลก cookie ผ่าน POST /auth/session/verify
   * เมลไม่พร้อม (ไม่ได้ตั้งค่า) หรือส่งไม่ออกจริง = 503 fail-closed ทั้งคู่ ไม่พาไปหน้ากรอกรหัส
   * ที่ไม่มีวันมีรหัสมาถึง — ทางหนีไฟ ops: UPDATE accounts SET two_factor_enabled=false
   * ทั้งท่อนนี้ทำงานเฉพาะตอน FEATURE_2FA เปิดเท่านั้น ปิดปรับปรุงอยู่ = ออก cookie ให้เลย
   * ตั้งแต่ first factor (ดู two-factor.flag.ts)
   *
   * key จริงส่งผ่าน Set-Cookie เท่านั้น — response body มีแค่ keyPrefix (8 ตัวแรก) ไว้โชว์ผล
   * ที่ UI (เช่น "API Key: a1b2c3d4…") โดยไม่ต้องมี plaintext เต็มอยู่ที่ไหนที่ JS แตะถึงได้
   */
  @Post('session')
  async session(
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const account = await this.accountFromSupabaseToken(authHeader);

    // ฟีเจอร์ปิดปรับปรุงอยู่ = ข้าม second factor ไปเลย แม้บัญชีนี้จะเปิด 2FA ค้างไว้ก็ตาม
    // (ไม่แตะค่าใน DB — เปิดฟีเจอร์กลับมาเมื่อไหร่ก็กลับมาบังคับเหมือนเดิม) ถ้าไม่ทำแบบนี้
    // บัญชีที่เปิด 2FA ไว้จะค้างอยู่หน้ากรอกรหัสตลอดกาลระหว่างที่ฟีเจอร์ปิด
    if (account.twoFactorEnabled && isTwoFactorAvailable()) {
      if (!this.mail.isConfigured()) throw new ServiceUnavailableException('mail_unavailable');
      if (!this.accounts.hasActiveOtp(account, 'login')) {
        let code: string | null = null;
        try {
          code = await this.accounts.issueOtp(account, 'login');
        } catch {
          // ติด cooldown (เช่น endpoint ถูกเรียกซ้ำหลัง challenge เดิมพลาดครบ 5 ครั้ง) —
          // ไม่ส่งซ้ำ ให้ผู้ใช้กด "ส่งรหัสอีกครั้ง" เองเมื่อพ้น cooldown
        }
        // จับเฉพาะ cooldown ของ issueOtp — ปล่อยให้ 503 ของ sendOtpOrFail ทะลุขึ้นไปถึงผู้ใช้
        if (code) await this.sendOtpOrFail(account, code, 'เข้าสู่ระบบ');
      }
      return { mfaRequired: true as const };
    }

    return this.issueSessionCookie(account, res);
  }

  /** step 2 ของ login แบบเปิด 2FA — Supabase token เดิม + รหัสจากอีเมล ถูกแล้วค่อยได้ cookie */
  @Post('session/verify')
  async sessionVerify(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const account = await this.accountFromSupabaseToken(authHeader);
    // 2FA ถูกปิดไประหว่างทาง (ops แก้ DB ให้ หรือฟีเจอร์เพิ่งถูกปิดปรับปรุง) — first factor
    // ผ่านแล้วออก cookie ได้เลย ไม่ปล่อยให้ค้างคาอยู่หน้ากรอกรหัสที่ไม่มีทางผ่าน
    if (!account.twoFactorEnabled || !isTwoFactorAvailable()) {
      return this.issueSessionCookie(account, res);
    }

    const ok = await this.accounts.verifyOtp(account, dto.code, 'login');
    if (!ok) throw new UnauthorizedException('invalid_otp — รหัสผิด หมดอายุ หรือพลาดครบ 5 ครั้ง');
    return this.issueSessionCookie(account, res);
  }

  /** ขอรหัส login ใหม่ (ปุ่ม "ส่งรหัสอีกครั้ง") — cooldown 60s บังคับใน issueOtp (ตอบ 429) */
  @Post('session/resend')
  async sessionResend(@Headers('authorization') authHeader: string | undefined) {
    const account = await this.accountFromSupabaseToken(authHeader);
    if (!isTwoFactorAvailable()) throw new ServiceUnavailableException(TWO_FACTOR_MAINTENANCE_MSG);
    if (!account.twoFactorEnabled) throw new BadRequestException('two_factor_not_enabled');
    if (!this.mail.isConfigured()) throw new ServiceUnavailableException('mail_unavailable');

    const code = await this.accounts.issueOtp(account, 'login');
    await this.sendOtpOrFail(account, code, 'เข้าสู่ระบบ');
    return { ok: true };
  }

  /**
   * ขอรหัสสำหรับเปิด/ปิด 2FA (ต้อง login อยู่ — AuthGuard ทับ challenge guard ระดับ class)
   * ปิดก็ต้องยืนยันรหัสจากอีเมลเหมือนเปิด — กัน session cookie ที่ถูกขโมยแอบปิด 2FA เงียบๆ
   */
  @Post('2fa/otp')
  @UseGuards(AuthGuard)
  async request2faOtp(@Body() dto: TwoFaOtpRequestDto, @Req() req: any) {
    const account = await this.accounts.findById(getAccount(req).id);
    if (!account) throw new UnauthorizedException('invalid_api_key');
    if (!isTwoFactorAvailable()) throw new ServiceUnavailableException(TWO_FACTOR_MAINTENANCE_MSG);
    if (!this.mail.isConfigured()) {
      throw new BadRequestException('mail_not_configured — ต้องตั้งค่า SMTP บนเซิร์ฟเวอร์ก่อนใช้ 2FA');
    }
    if (dto.intent === 'enable' && account.twoFactorEnabled) throw new BadRequestException('already_enabled');
    if (dto.intent === 'disable' && !account.twoFactorEnabled) throw new BadRequestException('not_enabled');

    const code = await this.accounts.issueOtp(account, dto.intent);
    await this.sendOtpOrFail(
      account,
      code,
      dto.intent === 'enable' ? 'การเปิดใช้ 2FA' : 'การปิดใช้ 2FA',
    );
    return { ok: true };
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard)
  async enable2fa(@Body() dto: OtpVerifyDto, @Req() req: any) {
    const account = await this.accounts.findById(getAccount(req).id);
    if (!account) throw new UnauthorizedException('invalid_api_key');

    if (!isTwoFactorAvailable()) throw new ServiceUnavailableException(TWO_FACTOR_MAINTENANCE_MSG);
    const ok = await this.accounts.verifyOtp(account, dto.code, 'enable');
    if (!ok) throw new BadRequestException('invalid_otp — รหัสผิด หมดอายุ หรือพลาดครบ 5 ครั้ง');
    await this.accounts.setTwoFactor(account.id, true);
    void this.notifications.notify(account.id, {
      type: 'twofa_changed',
      title: 'เปิดใช้ Two-Factor Authentication แล้ว',
      body: 'การ login ครั้งถัดไปต้องกรอกรหัสจากอีเมลด้วย',
    });
    return { ok: true, twoFactorEnabled: true };
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard)
  async disable2fa(@Body() dto: OtpVerifyDto, @Req() req: any) {
    const account = await this.accounts.findById(getAccount(req).id);
    if (!account) throw new UnauthorizedException('invalid_api_key');

    // ปิดตอนฟีเจอร์ปิดปรับปรุงด้วย — ขอรหัสยังไม่ได้เลย (2fa/otp ตอบ 503) จะมายืนยันตรงนี้
    // ไม่ได้อยู่แล้ว และระหว่างปิดปรับปรุง flag ใน DB ก็ไม่มีผลกับการ login อยู่แล้ว
    if (!isTwoFactorAvailable()) throw new ServiceUnavailableException(TWO_FACTOR_MAINTENANCE_MSG);
    const ok = await this.accounts.verifyOtp(account, dto.code, 'disable');
    if (!ok) throw new BadRequestException('invalid_otp — รหัสผิด หมดอายุ หรือพลาดครบ 5 ครั้ง');
    await this.accounts.setTwoFactor(account.id, false);
    void this.notifications.notify(account.id, {
      type: 'twofa_changed',
      title: 'ปิดใช้ Two-Factor Authentication แล้ว',
      body: 'ถ้าคุณไม่ได้เป็นคนปิดเอง ให้เปลี่ยนรหัสผ่านทันที',
    });
    return { ok: true, twoFactorEnabled: false };
  }

  /** ล้าง session cookie ฝั่ง server — JS อ่าน/ลบ httpOnly cookie เองไม่ได้ ต้องมี endpoint นี้ */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}
