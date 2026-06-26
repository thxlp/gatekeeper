import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Account } from '../common/types';
import { CONFIGS_DIR } from '../common/paths';

@Injectable()
export class AuthGuard implements CanActivate {
  private accounts: Account[];

  constructor() {
    const configPath = path.join(CONFIGS_DIR, 'accounts.json');
    this.accounts = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader: string = req.headers['authorization'] || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();

    const account = this.accounts.find((a) => a.api_key === apiKey);
    if (!account) throw new UnauthorizedException('invalid_api_key');
    if (account.status !== 'active') throw new UnauthorizedException('account_suspended');

    req.account = account;
    return true;
  }
}

// Helper สำหรับ extract account ออกจาก request (ใช้ใน controller)
export const getAccount = (req: any): Account => req.account as Account;
