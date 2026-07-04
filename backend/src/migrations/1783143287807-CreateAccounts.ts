import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccounts1783143287807 implements MigrationInterface {
  name = 'CreateAccounts1783143287807';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" varchar PRIMARY KEY,
        "email" varchar NOT NULL UNIQUE,
        "api_key" varchar NOT NULL UNIQUE,
        "plan" varchar NOT NULL DEFAULT 'free',
        "status" varchar NOT NULL DEFAULT 'active',
        "auth_provider" varchar NOT NULL,
        "supabase_user_id" varchar NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_accounts_supabase_identity"
      ON "accounts" ("auth_provider", "supabase_user_id")
      WHERE "auth_provider" = 'supabase'
    `);

    // seed บัญชี demo เดิมจาก configs/accounts.json (ยังใช้ key เดิมได้ ไม่พังของเก่า)
    await queryRunner.query(`
      INSERT INTO "accounts" ("id", "email", "api_key", "plan", "status", "auth_provider")
      VALUES
        ('acc_demo_free', 'demo-free@gatekeeper.local', 'demo-free-key', 'free', 'active', 'password'),
        ('acc_demo_pro', 'demo-pro@gatekeeper.local', 'demo-pro-key', 'pro', 'active', 'password'),
        ('acc_suspended', 'demo-suspended@gatekeeper.local', 'demo-suspended-key', 'free', 'suspended', 'password')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
