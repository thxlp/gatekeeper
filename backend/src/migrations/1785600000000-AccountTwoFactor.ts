import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2FA แบบ Email OTP: ธง two_factor_enabled + ช่อง OTP challenge บน accounts (challenge เดียว
 * ต่อบัญชีพอ — ไม่แยกตารางให้มี join/GC เพิ่มสำหรับรหัส 6 หลักอายุ 10 นาที) เก็บใน Postgres
 * เพื่อให้ attempts/cooldown บังคับข้าม backend ทั้ง 2 instance ได้จริง
 * otp_purpose: 'login' | 'enable' | 'disable' — รหัสใช้ข้ามจุดประสงค์ไม่ได้
 */
export class AccountTwoFactor1785600000000 implements MigrationInterface {
  name = 'AccountTwoFactor1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounts"
        ADD COLUMN "two_factor_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "otp_hash" varchar,
        ADD COLUMN "otp_expires_at" timestamptz,
        ADD COLUMN "otp_attempts" int NOT NULL DEFAULT 0,
        ADD COLUMN "otp_sent_at" timestamptz,
        ADD COLUMN "otp_purpose" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounts"
        DROP COLUMN "two_factor_enabled",
        DROP COLUMN "otp_hash",
        DROP COLUMN "otp_expires_at",
        DROP COLUMN "otp_attempts",
        DROP COLUMN "otp_sent_at",
        DROP COLUMN "otp_purpose"
    `);
  }
}
