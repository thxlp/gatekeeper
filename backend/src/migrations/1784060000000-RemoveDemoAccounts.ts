import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardening ตาม security audit 2026-07-10: ลบบัญชี demo ที่ seed ไว้ตั้งแต่
 * CreateAccounts (demo-free-key / demo-pro-key / demo-suspended-key) — key ทั้งหมด
 * expired จาก idle timeout ไปแล้ว แต่ rows ยังค้างใน DB เป็น attack surface ที่ไม่มี
 * ประโยชน์แล้ว (api_keys ลบตามอัตโนมัติผ่าน ON DELETE CASCADE)
 */
export class RemoveDemoAccounts1784060000000 implements MigrationInterface {
  name = 'RemoveDemoAccounts1784060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "accounts"
      WHERE "id" IN ('acc_demo_free', 'acc_demo_pro', 'acc_suspended')
        AND "auth_provider" = 'password'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // คืน rows ไม่ได้ (ไม่รู้ hash key เดิมและไม่ควรคืน) — ปล่อยว่างโดยตั้งใจ
    // ถ้าต้องการบัญชีทดสอบใหม่ให้สมัครผ่าน flow ปกติ
  }
}
