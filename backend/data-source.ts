import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from './src/common/database.config';

/**
 * ใช้แค่ตอน dev รัน TypeORM CLI (migration:generate/migration:run) เอง — ไม่ถูก copy
 * เข้า Docker image (อยู่นอก src/ ซึ่ง tsconfig.json ของ nest build จำกัดแค่ src/**)
 * แอปจริงตอนรันใน container ใช้ TypeOrmModule.forRoot(databaseConfig) ใน app.module.ts แทน
 * และ migrationsRun: true จะรัน migration เองตอน boot อยู่แล้ว
 */
export default new DataSource({
  ...databaseConfig,
  migrations: ['src/migrations/*.ts'],
} as any);
