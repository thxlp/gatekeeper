import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AccountsService } from './accounts.service';
import { MailService } from '../mail/mail.service';
import { UpdatePrefsDto } from './prefs.dto';
import { isTwoFactorAvailable } from '../auth/two-factor.flag';

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

  @Patch('prefs')
  async updatePrefs(@Body() dto: UpdatePrefsDto, @Req() req: any) {
    await this.accounts.updatePrefs(getAccount(req).id, { notifyEmail: dto.notifyEmail });
    return { ok: true, notifyEmail: dto.notifyEmail };
  }
}
