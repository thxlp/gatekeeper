import { DataSourceOptions } from 'typeorm';
import { Account } from '../account/account.entity';
import { ApiKey } from '../account/api-key.entity';
import { Notification } from '../notification/notification.entity';

/**
 * ใช้ DATABASE_URL ตรงๆ (ไม่ผ่าน @nestjs/config) ให้สอดคล้องกับสไตล์ทั้งโปรเจกต์ที่อ่าน
 * process.env.X ตรงๆ ทุกที่ (ดู COOKIE_CHALLENGE_SECRET, GATEKEEPER_TICKET_SECRET เป็นตัวอย่าง)
 */
export const databaseConfig: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Account, ApiKey, Notification],
  migrations: [__dirname + '/../migrations/*.js'],
  migrationsRun: true,
  synchronize: false,
  ssl: false,
};
