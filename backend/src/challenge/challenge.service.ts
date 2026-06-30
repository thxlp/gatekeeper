import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const COOKIE_NAME = 'gk_challenge';
const TTL_MS = 60 * 60 * 1000; // 1 ชั่วโมง

@Injectable()
export class ChallengeService {
  private get secret(): string {
    return process.env.COOKIE_CHALLENGE_SECRET || '';
  }

  issueToken(ip: string): string {
    const expires = Date.now() + TTL_MS;
    const payload = `${ip}|${expires}`;
    const sig = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
  }

  verifyToken(token: string | undefined, ip: string): boolean {
    if (!token || !this.secret) return false;
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split('|');
      if (parts.length !== 3) return false;
      const [tokenIp, expiresStr, sig] = parts;
      if (Date.now() > Number(expiresStr)) return false;
      if (tokenIp !== ip) return false;
      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(`${tokenIp}|${expiresStr}`)
        .digest('hex');
      return sig === expected;
    } catch {
      return false;
    }
  }

  cookieName(): string {
    return COOKIE_NAME;
  }
}
