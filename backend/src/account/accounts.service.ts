import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Account } from './account.entity';
import { ApiKey } from './api-key.entity';
import { sha256Hex } from '../common/crypto.util';

// เก็บ key ล่าสุดต่อบัญชีได้กี่ตัว — login หลายเครื่องได้ key คนละตัวโดย key เก่ายังใช้ได้
// เกินโควตาแล้วตัวเก่าสุดถูกลบ (เครื่องที่ถือ key นั้นต้อง login ใหม่)
const MAX_KEYS_PER_ACCOUNT = 5;

// Idle timeout: key ที่ไม่ถูกใช้ยิง request เกินช่วงนี้ถือว่า session หมดอายุ ต้อง login ใหม่
// ใช้กับทุก key (รวม script ที่ยิง API ตรง) — ตัดสินใจร่วมกับ user 2026-07-07
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MINUTES || 15) * 60 * 1000;

export type ApiKeyLookup =
  | { status: 'ok'; account: Account }
  | { status: 'expired' }
  | { status: 'invalid' };

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private repo: Repository<Account>,
    @InjectRepository(ApiKey) private apiKeys: Repository<ApiKey>,
  ) {}

  /**
   * lookup ด้วย hash ของ key ที่ client ส่งมา — DB ไม่เคยเห็น plaintext
   * พร้อมบังคับ idle timeout: key ที่เงียบเกิน SESSION_IDLE_MS ตอบ expired (แถวยังอยู่
   * ให้ตอบ session_expired ได้ตรงๆ จนหลุดโควตา MAX_KEYS_PER_ACCOUNT เอง) key ที่ยังไม่หมด
   * อายุถูก touch last_used_at ทุกครั้ง = การใช้งานต่อเนื่องเลื่อนเวลาหมดอายุออกไปเรื่อยๆ
   */
  async findByApiKey(apiKey: string): Promise<ApiKeyLookup> {
    if (!apiKey) return { status: 'invalid' };
    const keyRow = await this.apiKeys.findOne({ where: { keyHash: sha256Hex(apiKey) } });
    if (!keyRow) return { status: 'invalid' };

    if (Date.now() - keyRow.lastUsedAt.getTime() > SESSION_IDLE_MS) {
      return { status: 'expired' };
    }
    await this.apiKeys.update(keyRow.id, { lastUsedAt: new Date() });

    const account = await this.repo.findOne({ where: { id: keyRow.accountId } });
    return account ? { status: 'ok', account } : { status: 'invalid' };
  }

  findByEmail(email: string): Promise<Account | null> {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }

  /**
   * ออก api_key ใหม่ให้บัญชี — คืน plaintext กลับไป "ครั้งเดียวตรงนี้เท่านั้น" ใน DB เก็บแค่
   * SHA-256 hash เรียกทุกครั้งที่ /auth/session (เครื่องที่ยังไม่มี key ในมือ) key เก่ายังใช้ได้
   * จนกว่าจะหลุดโควตา MAX_KEYS_PER_ACCOUNT
   *
   * คืน keyPrefix (8 ตัวแรก) มาด้วย — controller ใช้แสดงผลแทน plaintext เต็ม (key จริงเซ็ตผ่าน
   * httpOnly cookie เท่านั้น ไม่ echo ใน JSON body อีกแล้ว กัน XSS บน dashboard origin อ่านได้)
   */
  async issueApiKey(account: Account): Promise<{ plainKey: string; keyPrefix: string }> {
    const plainKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = plainKey.slice(0, 8);

    await this.apiKeys.save(
      this.apiKeys.create({
        id: `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        accountId: account.id,
        keyHash: sha256Hex(plainKey),
        keyPrefix,
      }),
    );

    // ตัด key เก่าสุดที่เกินโควตาทิ้ง
    const all = await this.apiKeys.find({
      where: { accountId: account.id },
      order: { createdAt: 'DESC' },
    });
    if (all.length > MAX_KEYS_PER_ACCOUNT) {
      await this.apiKeys.remove(all.slice(MAX_KEYS_PER_ACCOUNT));
    }

    return { plainKey, keyPrefix };
  }

  /**
   * เรียกทุกครั้งหลัง frontend login ผ่าน Supabase สำเร็จ (ไม่ว่าจะ email/password, GitHub,
   * หรือ Google) — เป็นทั้ง "register" และ "login" ในตัวเดียว (idempotent find-or-create)
   * เพราะฝั่งเราไม่สนใจแล้วว่าเป็นครั้งแรกหรือครั้งที่เท่าไหร่ Supabase คือ identity ของจริง
   * ส่วน api_key ออกแยกต่างหากผ่าน issueApiKey (controller เรียกต่อ) เพราะเก็บเป็น hash แล้ว
   * ระบบไม่มีทางรู้ plaintext ของ key เดิมอีก — ต้องออกใหม่ให้เครื่องที่ยังไม่มี key เสมอ
   */
  async findOrCreateFromSupabase(supabaseUserId: string, email: string): Promise<Account> {
    const existing = await this.repo.findOne({
      where: { authProvider: 'supabase', supabaseUserId },
    });
    if (existing) return existing;

    const account = this.repo.create({
      id: uuidv4(),
      email: email.toLowerCase(),
      plan: 'free',
      status: 'active',
      authProvider: 'supabase',
      supabaseUserId,
    });
    return this.repo.save(account);
  }
}
