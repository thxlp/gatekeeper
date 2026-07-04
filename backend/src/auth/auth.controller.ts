import { Controller, Post, Headers, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AccountsService } from '../account/accounts.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { Account } from '../account/account.entity';

function toAuthResult(account: Account) {
  return { apiKey: account.apiKey, email: account.email, plan: account.plan };
}

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
   * คืน gatekeeper api_key ของบัญชีนั้น (สร้างให้ใหม่ถ้ายังไม่เคยมี) ให้ frontend เก็บไว้ใช้
   * เรียก endpoint อื่นๆ ของ gatekeeper ต่อ (ระบบ Bearer api_key เดิมไม่เปลี่ยนแปลง)
   */
  @Post('session')
  async session(@Headers('authorization') authHeader: string | undefined) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    const identity = await this.supabaseAuth.verifyAccessToken(token);
    if (!identity) throw new UnauthorizedException('invalid_supabase_session');

    const account = await this.accounts.findOrCreateFromSupabase(identity.id, identity.email);
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');

    return toAuthResult(account);
  }
}
