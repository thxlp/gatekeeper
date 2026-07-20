import { MigrationInterface, QueryRunner } from 'typeorm';

// ย้าย plugin store จาก in-memory Map + ไฟล์ JSON local (backend/data/plugins.json) มา Postgres
// สาเหตุ: backend รัน 2 instances หลัง nginx round-robin แบบไม่ sticky แต่ Map เดิมโหลดจากไฟล์
// ครั้งเดียวตอน boot ไม่เคย reload ข้าม instance ทำให้ lookup พลาด (plugin_not_found) และ
// เขียนทับกันเอง (instance ที่ save ทีหลังเขียน Map ของตัวเองทับไฟล์ ทำให้ plugin ของอีก
// instance หายจากดิสก์ถาวร) ไม่มีข้อมูลเก่าให้ backfill เพราะ plugins.json หายไปแล้วจากบั๊กนี้เอง
export class CreatePlugins1784200000000 implements MigrationInterface {
  name = 'CreatePlugins1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plugins" (
        "id" varchar PRIMARY KEY,
        "name" varchar NOT NULL,
        "description" text NULL,
        "base_url" text NOT NULL,
        "auth_type" varchar NOT NULL,
        "auth_header" varchar NULL,
        "endpoints" jsonb NOT NULL DEFAULT '[]',
        "owner_account_id" varchar NOT NULL,
        "project_id" varchar NULL,
        "status" varchar NOT NULL,
        "risk_score" int NULL,
        "findings" jsonb NULL,
        "signature" text NULL,
        "connection_file" jsonb NULL,
        "created_at" varchar NOT NULL,
        "updated_at" varchar NOT NULL,
        "last_verified_at" varchar NULL,
        "last_handshake_at" varchar NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_plugins_owner_account_id" ON "plugins" ("owner_account_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugins"`);
  }
}
