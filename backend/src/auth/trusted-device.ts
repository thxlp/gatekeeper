import type { Response } from 'express';
import { Account } from '../account/account.entity';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../common/crypto.util';

/**
 * "จดจำเครื่องนี้ 30 วัน" — ข้ามเฉพาะรหัส OTP ตอน login (POST /auth/session) เท่านั้น
 * รหัสผ่าน (Supabase) ยังต้องผ่านทุกครั้ง และการเปิด/ปิด 2FA ใน Settings ยังต้องใช้รหัสจากอีเมลเสมอ
 *
 * cookie เป็น stateless: payload {accountId, epoch, expiresAt} เข้ารหัส AES-256-GCM ด้วย master key
 * เดียวกับ secret อื่น (common/crypto.util.ts) — GCM ให้ทั้งความลับและกันแก้ไข ปลอม/ต่อเติมไม่ได้
 * ถ้าไม่มี key; ฝัง purpose ไว้ด้วย กันเอา ciphertext ของ secret ตัวอื่นมาสวมเป็น cookie นี้
 *
 * เพิกถอน: เทียบ epoch ใน cookie กับ accounts.trusted_device_epoch — เพิ่มเลขในDB = ทุกใบตายทันที
 * ไม่ผูก IP โดยจงใจ: prod อยู่หลัง Cloudflare IP เปลี่ยนทุก request (เหตุผลเดียวกับ challenge token)
 */
export const TRUSTED_DEVICE_COOKIE_NAME = 'gk_trusted_device';
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PURPOSE = 'trusted_device';

interface TrustedDevicePayload {
  p: typeof PURPOSE;
  a: string; // account id
  e: number; // trusted_device_epoch ตอนออก
  x: number; // หมดอายุ (epoch ms)
}

export function setTrustedDeviceCookie(res: Response, account: Account): void {
  const expiresAt = Date.now() + TRUSTED_DEVICE_TTL_MS;
  const payload: TrustedDevicePayload = {
    p: PURPOSE,
    a: account.id,
    e: account.trustedDeviceEpoch,
    x: expiresAt,
  };
  res.cookie(TRUSTED_DEVICE_COOKIE_NAME, encryptSecret(JSON.stringify(payload)), {
    httpOnly: true,
    secure: true,
    // ใช้แค่ fetch same-origin จากหน้า login — ไม่มีเหตุให้ติดไปกับ request ข้ามเว็บเลย
    sameSite: 'strict',
    path: '/',
    maxAge: TRUSTED_DEVICE_TTL_MS,
  });
}

export function clearTrustedDeviceCookie(res: Response): void {
  res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, { path: '/' });
}

/**
 * cookie ใบนี้ยังใช้ข้าม OTP ของบัญชีนี้ได้ไหม — ทุกกรณีที่ผิดปกติ (ไม่มี, ถอดรหัสไม่ได้, JSON เสีย,
 * คนละบัญชี, epoch เก่า, หมดอายุ) ตอบ false = กลับไปขอรหัสจากอีเมลตามปกติ ไม่มีทาง throw
 */
export function isTrustedDevice(cookieValue: string | undefined, account: Account): boolean {
  // ต้องเช็ค prefix เอง — decryptSecret คืนค่าที่ไม่มี "v1:" ออกมาตรงๆ (ถือเป็น legacy plaintext)
  // ถ้าไม่กันไว้ ใครพิมพ์ JSON payload ดิบใส่ cookie เองก็ข้าม 2FA ได้ทันที
  if (!cookieValue || !isEncryptedSecret(cookieValue)) return false;
  try {
    const p = JSON.parse(decryptSecret(cookieValue)) as Partial<TrustedDevicePayload>;
    return (
      p.p === PURPOSE &&
      p.a === account.id &&
      p.e === account.trustedDeviceEpoch &&
      typeof p.x === 'number' &&
      p.x > Date.now()
    );
  } catch {
    return false;
  }
}
