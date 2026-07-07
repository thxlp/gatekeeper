import { Controller, Post, Headers, Res, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AccountsService } from '../account/accounts.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { CookieChallengeGuard } from '../challenge/challenge.guard';

// เก็บ api_key จริงใน httpOnly cookie เท่านั้น (ไม่ echo กลับใน JSON body) — JS บน dashboard
// origin อ่านไม่ได้แม้เกิด XSS ก็ตาม ใช้ maxAge ยาว (30 วัน) เพราะตัวบังคับอายุจริงคือ idle
// timeout ฝั่ง server (ดู AccountsService.findByApiKey) ไม่ใช่อายุของ cookie เอง
export const SESSION_COOKIE_NAME = 'gk_session';
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
@UseGuards(CookieChallengeGuard)
export class AuthController {
  constructor(
    private accounts: AccountsService,
    private supabaseAuth: SupabaseAuthService,
  ) {}

  /**
   * เรียกจาก frontend ทันทีหลัง Supabase auth สำเร็จ (email/password, GitHub, Google —
   * หน้าตาเหมือนกันหมดตรงนี้) พร้อม Supabase access token ใน Authorization header
   * ออก gatekeeper api_key "ตัวใหม่" ให้เสมอ (DB เก็บแค่ hash — ระบบไม่รู้ plaintext ของ key
   * เดิมอีกแล้ว) frontend เรียกเฉพาะตอนยังไม่มี key ในเครื่อง จึงไม่ churn โดยไม่จำเป็น
   * key เก่าของเครื่องอื่นยังใช้ได้ต่อจนหลุดโควตา (ดู AccountsService.issueApiKey)
   *
   * key จริงส่งผ่าน Set-Cookie เท่านั้น — response body มีแค่ keyPrefix (8 ตัวแรก) ไว้โชว์ผล
   * ที่ UI (เช่น "API Key: a1b2c3d4…") โดยไม่ต้องมี plaintext เต็มอยู่ที่ไหนที่ JS แตะถึงได้
   */
  @Post('session')
  async session(
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const identity = await this.supabaseAuth.verifyAccessToken(token);
    if (!identity) throw new UnauthorizedException('invalid_supabase_session');

    const account = await this.accounts.findOrCreateFromSupabase(identity.id, identity.email);
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');

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

  /** ล้าง session cookie ฝั่ง server — JS อ่าน/ลบ httpOnly cookie เองไม่ได้ ต้องมี endpoint นี้ */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}
