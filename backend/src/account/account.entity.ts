import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

// 'password' เหลือไว้แค่สำหรับ 3 demo rows แบบ static ที่ seed มาจาก configs/accounts.json เดิม
// (ใช้ api_key ตรงๆ ไม่มี login ผ่านหน้าเว็บ) — user จริงทุกคนสมัคร/login ผ่าน Supabase เท่านั้น
// (email+password, GitHub, Google ทั้งหมดจัดการโดย Supabase Auth ไม่ใช่เราเอง)
export type AuthProvider = 'password' | 'supabase';

@Entity('accounts')
@Index(['authProvider', 'supabaseUserId'], { unique: true, where: `auth_provider = 'supabase'` })
export class Account {
  // varchar แทน native uuid type — เพราะ seed demo rows ใช้ id แบบ "acc_demo_free" (ไม่ใช่ uuid
  // format) สอดคล้องกับสไตล์ id แบบ opaque string ทั่วทั้งโปรเจกต์ (เช่น "gitapp_" prefix ของ GitApp)
  @PrimaryColumn('varchar')
  id: string;

  @Column({ unique: true })
  email: string;

  // api_key ไม่อยู่ในตารางนี้แล้ว — ย้ายไปเก็บเป็น SHA-256 hash ในตาราง api_keys
  // (ดู api-key.entity.ts + migration HashApiKeys) plaintext แสดงครั้งเดียวตอนออก key

  @Column({ type: 'varchar', default: 'free' })
  plan: 'free' | 'pro';

  @Column({ type: 'varchar', default: 'active' })
  status: 'active' | 'suspended';

  @Column({ name: 'auth_provider', type: 'varchar' })
  authProvider: AuthProvider;

  // "sub" ของ user จาก Supabase (คงที่ ไม่เปลี่ยนแม้ user จะแก้ email หรือเปลี่ยนวิธี login
  // ระหว่าง email/password กับ GitHub/Google — Supabase merge ให้เป็น user เดียวกันอยู่แล้วถ้า
  // email ตรงกัน เราแค่เก็บ id นี้ไว้ map กลับมาที่ account/api_key ของเราเอง)
  @Column({ name: 'supabase_user_id', type: 'varchar', nullable: true })
  supabaseUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
