import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * API key ของ gatekeeper — เก็บเฉพาะ SHA-256 hash (ไม่มี plaintext ใน DB) key จริงแสดงให้
 * user เห็นครั้งเดียวตอนออก แยกเป็นตารางของตัวเอง (หลาย key ต่อ account) เพื่อให้ login
 * จากหลายเครื่องได้ key คนละตัวโดยไม่เตะกันเอง — ออกใหม่ทุกครั้งที่เรียก /auth/session
 * และเก็บย้อนหลังสูงสุด MAX_KEYS_PER_ACCOUNT ตัว (ดู AccountsService)
 */
@Entity('api_keys')
export class ApiKey {
  @PrimaryColumn('varchar')
  id: string;

  @Index()
  @Column({ name: 'account_id' })
  accountId: string;

  @Column({ name: 'key_hash', unique: true })
  keyHash: string;

  // 8 ตัวแรกของ key จริง — ไว้แสดงผล/ไล่หาว่า key ไหนเป็นของเครื่องไหน (สั้นพอไม่ช่วย brute force)
  @Column({ name: 'key_prefix' })
  keyPrefix: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
