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

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private repo: Repository<Account>,
    @InjectRepository(ApiKey) private apiKeys: Repository<ApiKey>,
  ) {}

  /** lookup ด้วย hash ของ key ที่ client ส่งมา — DB ไม่เคยเห็น plaintext */
  async findByApiKey(apiKey: string): Promise<Account | null> {
    if (!apiKey) return null;
    const keyRow = await this.apiKeys.findOne({ where: { keyHash: sha256Hex(apiKey) } });
    if (!keyRow) return null;
    return this.repo.findOne({ where: { id: keyRow.accountId } });
  }

  findByEmail(email: string): Promise<Account | null> {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }

  /**
   * ออก api_key ใหม่ให้บัญชี — คืน plaintext กลับไป "ครั้งเดียวตรงนี้เท่านั้น" ใน DB เก็บแค่
   * SHA-256 hash เรียกทุกครั้งที่ /auth/session (เครื่องที่ยังไม่มี key ในมือ) key เก่ายังใช้ได้
   * จนกว่าจะหลุดโควตา MAX_KEYS_PER_ACCOUNT
   */
  async issueApiKey(account: Account): Promise<string> {
    const plainKey = crypto.randomBytes(32).toString('hex');

    await this.apiKeys.save(
      this.apiKeys.create({
        id: `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        accountId: account.id,
        keyHash: sha256Hex(plainKey),
        keyPrefix: plainKey.slice(0, 8),
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

    return plainKey;
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
