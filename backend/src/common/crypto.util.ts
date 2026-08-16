import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

/**
 * Encryption-at-rest สำหรับ secret ของลูกค้า (webhookSecret, GitHub token) + hash ของ api_key
 *
 * รูปแบบ ciphertext ผูก version ไว้ข้างหน้า: "v1:<iv>:<tag>:<ciphertext>" (base64 ทั้งสามช่อง)
 * เผื่ออนาคต rotate master key / เปลี่ยนอัลกอริทึม แค่เพิ่ม v2 แล้ว decrypt แยกตาม prefix ได้
 * โดยไม่ต้อง migrate ข้อมูลเก่าทั้งก้อน — ค่าที่ไม่มี prefix ถือเป็น legacy plaintext (ข้อมูลก่อน
 * มีระบบเข้ารหัส) อ่านผ่านได้เลย และจะถูกเข้ารหัสทับตอน save ครั้งถัดไปเอง
 *
 * Master key: env GATEKEEPER_MASTER_KEY (hex 64 ตัว = 32 bytes) เป็นหลัก — ถ้าไม่ตั้ง
 * fallback เป็นไฟล์ DATA_DIR/master.key ที่ generate เองครั้งแรก (mode 0600, อยู่บน volume
 * ที่แชร์ระหว่าง backend instance อยู่แล้วเหมือน store อื่นๆ) เพื่อให้ dev/ติดตั้งใหม่ใช้ได้ทันที
 */
const VERSION_PREFIX = 'v1:';
const ALGO = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function loadMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = (process.env.GATEKEEPER_MASTER_KEY || '').trim();
  if (fromEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      throw new Error('GATEKEEPER_MASTER_KEY ต้องเป็น hex 64 ตัวอักษร (32 bytes)');
    }
    cachedKey = Buffer.from(fromEnv, 'hex');
    return cachedKey;
  }

  const keyPath = path.join(DATA_DIR, 'master.key');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // flag 'wx' = สร้างเฉพาะเมื่อยังไม่มีไฟล์ (atomic) — สอง instance boot พร้อมกัน ตัวที่แพ้
    // จะได้ EEXIST แล้วไปอ่านไฟล์ของตัวที่ชนะแทน ไม่มีทางได้ key คนละตัว
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  } catch (err: any) {
    if (err.code !== 'EEXIST') throw err;
  }

  const hex = fs.readFileSync(keyPath, 'utf8').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`ไฟล์ ${keyPath} เสียหาย — ต้องเป็น hex 64 ตัวอักษร`);
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(VERSION_PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12); // 96-bit nonce มาตรฐานของ GCM
  const cipher = crypto.createCipheriv(ALGO, loadMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** ค่า legacy ที่ยังไม่เข้ารหัส (ไม่มี version prefix) คืนตรงๆ — backward-compat กับ store เดิม */
export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value;

  const [iv, tag, ct] = value.slice(VERSION_PREFIX.length).split(':');
  // ct ว่างได้ — encryptSecret('') ให้ ciphertext ว่างเป็นเรื่องปกติ (secret ที่ค่าว่างจริงๆ)
  // ห้ามเช็ค !ct: เคยทำให้ decrypt ทั้ง store พัง -> readAll() throw -> backend crash-loop ทั้งคู่
  if (!iv || !tag || ct === undefined) throw new Error('รูปแบบ ciphertext ไม่ถูกต้อง');

  const decipher = crypto.createDecipheriv(ALGO, loadMasterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

/** hash ทางเดียวสำหรับ api_key — เทียบเท่า encode(sha256(...), 'hex') ฝั่ง Postgres ใน migration */
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
