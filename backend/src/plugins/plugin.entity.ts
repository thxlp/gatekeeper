import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { PluginEndpoint, PluginStatus, Finding } from '../common/types';

// Entity แยกจาก interface `Plugin` ใน common/types.ts โดยตั้งใจ (ไม่ implements) — column
// nullable ต้องเป็น `| null` ตอน runtime เพื่อให้ TypeORM เขียน SQL `SET col = NULL` ได้จริงตอน
// clear ค่า (เช่น revoke() เคลียร์ signature/connection_file) ถ้าปล่อยเป็น `undefined` เฉยๆ
// TypeORM จะข้าม column นั้นไปเลยไม่ใส่ใน UPDATE statement ค่าเก่าจะค้างอยู่ ดู PluginStore
// (toEntity/toPlugin) เป็นชั้นแปลงกลับไปมาระหว่าง entity นี้กับ Plugin interface ที่ service ใช้
@Entity('plugins')
export class PluginEntity {
  @PrimaryColumn('varchar')
  id: string;

  @Column('varchar')
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'base_url', type: 'text' })
  base_url: string;

  @Column({ name: 'auth_type', type: 'varchar' })
  auth_type: 'bearer' | 'api_key' | 'basic' | 'none';

  @Column({ name: 'auth_header', type: 'varchar', nullable: true })
  auth_header: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  endpoints: PluginEndpoint[];

  @Index()
  @Column({ name: 'owner_account_id', type: 'varchar' })
  owner_account_id: string;

  @Column({ name: 'project_id', type: 'varchar', nullable: true })
  project_id: string | null;

  @Column({ type: 'varchar' })
  status: PluginStatus;

  @Column({ name: 'risk_score', type: 'int', nullable: true })
  risk_score: number | null;

  @Column({ type: 'jsonb', nullable: true })
  findings: Finding[] | null;

  @Column({ type: 'text', nullable: true })
  signature: string | null;

  @Column({ name: 'connection_file', type: 'jsonb', nullable: true })
  connection_file: object | null;

  // เก็บเป็น varchar ของ ISO string เดิม (ไม่ใช่ timestamptz/Date) เพราะ plugins.service.ts
  // ทั้งไฟล์สร้าง/เทียบค่าด้วย new Date().toISOString() เป็น string อยู่แล้ว
  @Column({ name: 'created_at', type: 'varchar' })
  created_at: string;

  @Column({ name: 'updated_at', type: 'varchar' })
  updated_at: string;

  @Column({ name: 'last_verified_at', type: 'varchar', nullable: true })
  last_verified_at: string | null;

  @Column({ name: 'last_handshake_at', type: 'varchar', nullable: true })
  last_handshake_at: string | null;
}
