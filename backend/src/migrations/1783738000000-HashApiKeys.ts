import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เลิกเก็บ api_key เป็น plaintext ใน accounts — ย้ายไปตาราง api_keys ที่เก็บเฉพาะ SHA-256 hash
 * (หลาย key ต่อ account ได้) key เดิมของทุกบัญชียังใช้ได้ต่อเนื่อง เพราะ hash จาก plaintext
 * ที่มีอยู่ก่อนลบคอลัมน์ทิ้ง — sha256() เป็น builtin ของ Postgres 11+ ผลตรงกับ
 * crypto.createHash('sha256') ฝั่ง Node (ดู common/crypto.util.ts)
 */
export class HashApiKeys1783738000000 implements MigrationInterface {
  name = 'HashApiKeys1783738000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" varchar PRIMARY KEY,
        "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "key_hash" varchar NOT NULL UNIQUE,
        "key_prefix" varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_api_keys_account_id" ON "api_keys" ("account_id")
    `);

    // ย้าย key ที่มีอยู่ทุกบัญชี (รวม demo rows) มาเป็น hash — user เดิมไม่ต้อง login ใหม่
    await queryRunner.query(`
      INSERT INTO "api_keys" ("id", "account_id", "key_hash", "key_prefix")
      SELECT
        'key_' || substr(md5(random()::text || id), 1, 12),
        id,
        encode(sha256(api_key::bytea), 'hex'),
        left(api_key, 8)
      FROM "accounts"
    `);

    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "api_key"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ย้อน schema ได้ แต่คืน plaintext ไม่ได้ (hash ทางเดียว) — ใส่ค่า random ให้คอลัมน์กลับมา
    // ไม่ว่าง แล้วผู้ใช้ต้อง login ใหม่เพื่อออก key ใหม่เอง
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "api_key" varchar`);
    await queryRunner.query(`UPDATE "accounts" SET "api_key" = md5(random()::text || id)`);
    await queryRunner.query(`ALTER TABLE "accounts" ALTER COLUMN "api_key" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "UQ_accounts_api_key" UNIQUE ("api_key")`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
  }
}
