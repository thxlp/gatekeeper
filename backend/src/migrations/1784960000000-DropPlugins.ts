import { MigrationInterface, QueryRunner } from 'typeorm';

// ถอนฟีเจอร์ plugin registry ออกทั้งระบบ (โค้ด PluginsModule ถูกลบใน commit เดียวกัน) —
// drop ตารางที่ CreatePlugins1784200000000 สร้างไว้ด้วย ไฟล์ migration ตัวนั้นถูกลบตามไป
// (record ใน migrations table ค้างเป็น orphan ได้ ไม่มีผลอะไร) จึงใช้ IF EXISTS ให้เครื่อง
// ที่ไม่เคยรัน CreatePlugins ผ่านได้เหมือนกัน ไม่ทำ down: ข้อมูล plugin ถูกทิ้งถาวรโดยตั้งใจ
export class DropPlugins1784960000000 implements MigrationInterface {
  name = 'DropPlugins1784960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_plugins_owner_account_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugins"`);
  }

  public async down(): Promise<void> {
    // ตั้งใจไม่รองรับ revert — ฟีเจอร์ถูกถอนถาวร
  }
}
