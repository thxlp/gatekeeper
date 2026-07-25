import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/paths';
import { ManagedDatabase } from '../common/types';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../common/crypto.util';

/**
 * เก็บ managed database ต่อบัญชีในไฟล์ JSON (เหมือน git-app.store) — เข้ารหัสเฉพาะ `password`
 * AES-256-GCM ตอนเขียน / ถอดตอนอ่าน (โค้ดนอก store เห็น plaintext อย่างเดียว). entry เก่าที่ยัง
 * เป็น plaintext อ่านผ่านได้ แล้วถูกเข้ารหัสทับตอน save ครั้งถัดไป (isEncryptedSecret guard)
 */
@Injectable()
export class ManagedDbStore {
  private storePath = path.join(DATA_DIR, 'managed-dbs-store.json');

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.storePath)) fs.writeFileSync(this.storePath, '[]\n', 'utf8');
  }

  private readAll(): ManagedDatabase[] {
    let rows: ManagedDatabase[];
    try {
      rows = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      return [];
    }
    // decrypt อยู่นอก try — master key ผิดต้อง throw ดังๆ (fail-closed) ไม่ใช่คืน list ว่างเงียบๆ
    return rows.map((d) => ({ ...d, password: decryptSecret(d.password) }));
  }

  private writeAll(rows: ManagedDatabase[]): void {
    const stored = rows.map((d) => ({
      ...d,
      password: isEncryptedSecret(d.password) ? d.password : encryptSecret(d.password),
    }));
    fs.writeFileSync(this.storePath, JSON.stringify(stored, null, 2) + '\n', 'utf8');
  }

  findAll(accountId?: string): ManagedDatabase[] {
    const all = this.readAll();
    return accountId ? all.filter((d) => d.accountId === accountId) : all;
  }

  findById(id: string): ManagedDatabase | undefined {
    return this.readAll().find((d) => d.id === id);
  }

  save(db: ManagedDatabase): void {
    const all = this.readAll();
    const idx = all.findIndex((d) => d.id === db.id);
    if (idx >= 0) all[idx] = db;
    else all.push(db);
    this.writeAll(all);
  }

  delete(id: string): void {
    this.writeAll(this.readAll().filter((d) => d.id !== id));
  }
}
