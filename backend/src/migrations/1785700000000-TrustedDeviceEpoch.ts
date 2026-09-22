import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "จดจำเครื่องนี้ 30 วัน" ของหน้า login 2FA — ตัว cookie เป็น stateless (เข้ารหัส AES-256-GCM
 * ดู auth/trusted-device.ts) จึงไม่ต้องมีตารางเก็บรายเครื่อง แค่ตัวนับรุ่นต่อบัญชีพอ:
 * cookie ฝังเลขรุ่นตอนออกไว้ เพิ่มเลขนี้ +1 = cookie ทุกใบที่ออกก่อนหน้าใช้ไม่ได้ทันที
 * (ปิด 2FA / กด "ลืมทุกเครื่อง" ใน Settings)
 */
export class TrustedDeviceEpoch1785700000000 implements MigrationInterface {
  name = 'TrustedDeviceEpoch1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD COLUMN "trusted_device_epoch" int NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "trusted_device_epoch"`);
  }
}
