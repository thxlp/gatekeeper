import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ระบบแจ้งเตือน: ตาราง notifications (feed กระดิ่งบน TopBar) + ธง notify_email บน accounts
 * (opt-in, default false — SMTP อาจยังไม่ถูกตั้งค่า และไม่ควรมีเมลแปลกใจโดยผู้ใช้ไม่ได้เปิดเอง)
 */
export class CreateNotifications1785500000000 implements MigrationInterface {
  name = 'CreateNotifications1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" varchar PRIMARY KEY,
        "account_id" varchar NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "body" text NOT NULL DEFAULT '',
        "meta" jsonb,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_account_created" ON "notifications" ("account_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      ALTER TABLE "accounts" ADD COLUMN "notify_email" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "notify_email"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
