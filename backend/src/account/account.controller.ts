import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AccountsService } from './accounts.service';
import { MailService } from '../mail/mail.service';
import { mailTestEmail } from '../mail/mail-templates';
import { UpdatePrefsDto } from './prefs.dto';
import { isTwoFactorAvailable } from '../auth/two-factor.flag';

// cooldown ต่อบัญชี — in-memory ต่อ instance (backend มี 2 ตัวหลัง LB จึงกันได้หยาบๆ ~2 เท่า)
// พอสำหรับกันกดรัวเผาโควตา ไม่ใช่ security boundary จึงไม่ต้องแชร์ state ข้าม instance
const MAIL_TEST_COOLDOWN = new Map<string, number>();
const MAIL_TEST_COOLDOWN_MS = 60_000;

/**
 * ข้อมูล + preference ของบัญชีตัวเอง — หน้า Settings ใช้ผูก toggle "Email Notifications"
 * (mailConfigured ส่งไปด้วยให้ UI disable toggle ได้ตรงความจริงตอน SMTP ยังไม่ถูกตั้งค่า)
 */
@Controller('account')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class AccountController {
  constructor(
    private accounts: AccountsService,
    private mail: MailService,
  ) {}

  @Get('me')
  async me(@Req() req: any) {
    const account = await this.accounts.findById(getAccount(req).id);
    return {
      email: account?.email,
      plan: account?.plan,
      notifyEmail: account?.notifyEmail ?? false,
      twoFactorEnabled: account?.twoFactorEnabled ?? false,
      mailConfigured: this.mail.isConfigured(),
      // ฟีเจอร์ 2FA เปิดใช้ทั้งระบบอยู่ไหม (FEATURE_2FA) — UI ใช้โชว์สถานะ "ปิดปรับปรุง"
      twoFactorAvailable: isTwoFactorAvailable(),
    };
  }

  /**
   * ส่งเมลทดสอบถึงอีเมลของบัญชีตัวเอง — ทางเดียวที่จะรู้ว่า "ตั้งค่าแล้ว" กับ "ส่งออกได้จริง"
   * ต่างกันไหม ก่อนจะเปิด FEATURE_2FA (เปิดทั้งที่เมลส่งไม่ออก = ทุกคนที่เปิด 2FA เข้าไม่ได้
   * ทันที — ดู docs/INCIDENT-2026-08-08-2fa-mail.md)
   *
   * ส่งได้เฉพาะถึงอีเมลของบัญชีที่ login อยู่เท่านั้น (ไม่รับ to จาก body) + cooldown กันกดรัว
   * เผาโควตาของ provider
   */
  @Post('mail-test')
  async mailTest(@Req() req: any) {
    const account = await this.accounts.findById(getAccount(req).id);
    if (!account?.email) throw new BadRequestException('บัญชีนี้ไม่มีอีเมล');
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException('mail_not_configured — ยังไม่ได้ตั้งค่าช่องทางส่งอีเมลในระบบ');
    }

    const last = MAIL_TEST_COOLDOWN.get(account.id) ?? 0;
    const waitMs = MAIL_TEST_COOLDOWN_MS - (Date.now() - last);
    if (waitMs > 0) {
      throw new BadRequestException(`เพิ่งส่งไปเมื่อครู่ — รออีก ${Math.ceil(waitMs / 1000)} วินาที`);
    }
    MAIL_TEST_COOLDOWN.set(account.id, Date.now());

    const transport = this.mail.describeTransport();
    const t = mailTestEmail(transport);
    const { ok, error } = await this.mail.sendWithResult(account.email, t.subject, t.text);
    if (!ok) {
      // ปล่อยให้กดใหม่ได้ทันทีเมื่อส่งไม่ออก — cooldown มีไว้กันกดรัวตอนสำเร็จ ไม่ใช่ขวางการแก้ config
      MAIL_TEST_COOLDOWN.delete(account.id);
      throw new ServiceUnavailableException(`ส่งไม่สำเร็จ (${transport}): ${error ?? 'ไม่ทราบสาเหตุ'}`);
    }
    return { ok: true, to: account.email, transport };
  }

  @Patch('prefs')
  async updatePrefs(@Body() dto: UpdatePrefsDto, @Req() req: any) {
    await this.accounts.updatePrefs(getAccount(req).id, { notifyEmail: dto.notifyEmail });
    return { ok: true, notifyEmail: dto.notifyEmail };
  }
}
