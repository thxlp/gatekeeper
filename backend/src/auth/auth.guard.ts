import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Account } from '../common/types';
import { AccountsService } from '../account/accounts.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private accounts: AccountsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader: string = req.headers['authorization'] || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();

    const lookup = await this.accounts.findByApiKey(apiKey);
    // แยก session_expired ออกจาก invalid_api_key ให้ frontend รู้ว่าควรพาไป login
    // พร้อมข้อความ "หมดเวลาเพราะไม่ได้ใช้งาน" ไม่ใช่ "key ผิด"
    if (lookup.status === 'expired') throw new UnauthorizedException('session_expired');
    if (lookup.status === 'invalid') throw new UnauthorizedException('invalid_api_key');
    const account = lookup.account;
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');

    req.account = {
      id: account.id,
      // plaintext key ไม่ถูกเก็บที่ไหนแล้ว (DB มีแค่ hash) — ไม่มี consumer ฝั่งเราอ่านค่านี้ต่อ
      api_key: '',
      plan: account.plan,
      status: account.status,
      email: account.email,
      auth_provider: account.authProvider,
    } as Account;
    return true;
  }
}

// Helper สำหรับ extract account ออกจาก request (ใช้ใน controller)
export const getAccount = (req: any): Account => req.account as Account;
