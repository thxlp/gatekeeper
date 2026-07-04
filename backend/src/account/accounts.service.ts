import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Account } from './account.entity';

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private repo: Repository<Account>,
  ) {}

  findByApiKey(apiKey: string): Promise<Account | null> {
    return this.repo.findOne({ where: { apiKey } });
  }

  findByEmail(email: string): Promise<Account | null> {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }

  /**
   * เรียกทุกครั้งหลัง frontend login ผ่าน Supabase สำเร็จ (ไม่ว่าจะ email/password, GitHub,
   * หรือ Google) — เป็นทั้ง "register" และ "login" ในตัวเดียว (idempotent find-or-create)
   * เพราะฝั่งเราไม่สนใจแล้วว่าเป็นครั้งแรกหรือครั้งที่เท่าไหร่ Supabase คือ identity ของจริง
   * เราแค่ผูก api_key ของ gatekeeper เข้ากับ supabase_user_id ที่ verify มาแล้วเท่านั้น
   */
  async findOrCreateFromSupabase(supabaseUserId: string, email: string): Promise<Account> {
    const existing = await this.repo.findOne({
      where: { authProvider: 'supabase', supabaseUserId },
    });
    if (existing) return existing;

    const account = this.repo.create({
      id: uuidv4(),
      email: email.toLowerCase(),
      apiKey: generateApiKey(),
      plan: 'free',
      status: 'active',
      authProvider: 'supabase',
      supabaseUserId,
    });
    return this.repo.save(account);
  }
}
