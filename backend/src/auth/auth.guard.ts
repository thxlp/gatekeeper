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

    const account = await this.accounts.findByApiKey(apiKey);
    if (!account) throw new UnauthorizedException('invalid_api_key');
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');

    req.account = {
      id: account.id,
      api_key: account.apiKey,
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
