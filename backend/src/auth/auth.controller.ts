import { Controller, Post, Headers, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AccountsService } from '../account/accounts.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { CookieChallengeGuard } from '../challenge/challenge.guard';

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
   */
  @Post('session')
  async session(@Headers('authorization') authHeader: string | undefined) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const identity = await this.supabaseAuth.verifyAccessToken(token);
    if (!identity) throw new UnauthorizedException('invalid_supabase_session');

    const account = await this.accounts.findOrCreateFromSupabase(identity.id, identity.email);
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');

    const apiKey = await this.accounts.issueApiKey(account);
    return { apiKey, email: account.email, plan: account.plan };
  }
}
