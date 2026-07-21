import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

// การแจ้งเตือนในแอป (กระดิ่งบน TopBar) — เก็บใน Postgres เพราะ backend รัน 2 instance
// (แถวเขียนโดย instance ไหนก็อ่านเจอเหมือนกัน ไม่ต้อง sync อะไรเพิ่ม) เก็บย้อนหลังจำกัด
// ต่อ account (ดู retention ใน notifications.service.ts)
@Entity('notifications')
@Index(['accountId', 'createdAt'])
export class Notification {
  // opaque string id สไตล์เดียวกับทั้งโปรเจกต์ ("ntf_" prefix)
  @PrimaryColumn('varchar')
  id: string;

  @Column({ name: 'account_id', type: 'varchar' })
  accountId: string;

  // ชนิดเหตุการณ์ เช่น deploy_success / deploy_failed / deploy_blocked / rollback_success /
  // rollback_failed / twofa_changed — frontend ใช้เลือกสี/ไอคอน
  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', default: '' })
  body: string;

  // ข้อมูลอ้างอิงเพิ่มเติม (เช่น appId, requestId) — ให้ UI ลิงก์ไปหน้า app ได้
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
