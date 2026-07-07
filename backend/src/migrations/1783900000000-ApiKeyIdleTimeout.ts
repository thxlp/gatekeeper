import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idle session timeout: เพิ่ม last_used_at ให้ api_keys — AuthGuard ปฏิเสธ key ที่ไม่ถูกใช้
 * เกิน SESSION_IDLE_MINUTES (default 15 นาที) backfill เป็น now() เพื่อให้ key ที่มีอยู่
 * เริ่มนับ idle จากตอน migrate ไม่ใช่โดนเตะทันทีทั้งระบบ
 */
export class ApiKeyIdleTimeout1783900000000 implements MigrationInterface {
  name = 'ApiKeyIdleTimeout1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "api_keys" ADD COLUMN "last_used_at" timestamptz NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "last_used_at"`);
  }
}
