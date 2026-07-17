import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const COOKIE_NAME = 'gk_challenge';
const TTL_MS = 60 * 60 * 1000; // 1 ชั่วโมง

@Injectable()
export class ChallengeService {
  private get secret(): string {
    return process.env.COOKIE_CHALLENGE_SECRET || '';
  }

  // ไม่ผูก IP โดยเจตนา: หลังถอด trust proxy req.ip = IP ของ nginx เสมอ (เหมือนกันทุก user)
  // การ bind IP จึงไม่ได้แยกผู้ใช้จริง แต่ทำให้ challenge cookie ทุกคนใช้ไม่ได้ทุกครั้งที่
  // recreate stack (nginx เปลี่ยน container IP) → login ล่มทั้งระบบ token เป็นแค่ signed +
  // มี expiry ก็พอเป็น bot speed-bump (bot ต้อง POST /challenge/verify ก่อนถึงได้ token)
  // ช่องแรกเป็น nonce (format 3 ส่วนเท่าเดิม) — token เก่าที่ฝัง IP ไว้จึงยัง verify ผ่าน (ไม่บังคับ
  // re-challenge ตอน deploy fix นี้) เพราะ HMAC เดิมครอบ `<ค่าช่องแรก>|expires` อยู่แล้ว
  issueToken(): string {
    const expires = Date.now() + TTL_MS;
    const nonce = crypto.randomBytes(8).toString('hex');
    const payload = `${nonce}|${expires}`;
    const sig = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
  }

  verifyToken(token: string | undefined): boolean {
    if (!token || !this.secret) return false;
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split('|');
      if (parts.length !== 3) return false;
      const [nonce, expiresStr, sig] = parts;
      if (Date.now() > Number(expiresStr)) return false;
      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(`${nonce}|${expiresStr}`)
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
