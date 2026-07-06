import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/paths';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../common/crypto.util';

export interface GithubConnection {
  accountId: string;
  token: string; // PAT หรือ OAuth provider token จาก Supabase — ใช้เรียก GitHub API แทน user
  username: string;
  scopes: string[];
  connectedAt: string;
}

/**
 * เก็บ GitHub token ต่อ account ใน DATA_DIR (นอก git repo เหมือน git-apps-store.json ที่มี
 * webhookSecret อยู่แล้ว) — อ่านจากไฟล์สดทุกครั้งไม่ cache เพราะ backend รันหลาย instance
 * แชร์ volume เดียวกัน (เหตุผลเดียวกับ GitAppStore)
 *
 * token ในไฟล์ถูกเข้ารหัส AES-256-GCM เสมอ (encrypt ตอน save / decrypt ตอน get — โค้ดนอก
 * store นี้เห็น plaintext อย่างเดียว) ไฟล์หลุดโดยไม่มี master key = อ่าน token ไม่ออก
 */
@Injectable()
export class GithubTokenStore {
  private storePath = path.join(DATA_DIR, 'github-tokens.json');

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, '[]\n', 'utf8');
    }

    // migrate ครั้งเดียวตอน boot: token เก่าที่ยังเป็น plaintext ถูกเข้ารหัสทับทันที
    const raw = this.readAll();
    if (raw.some((c) => !isEncryptedSecret(c.token))) {
      this.writeAll(raw.map((c) => (isEncryptedSecret(c.token) ? c : { ...c, token: encryptSecret(c.token) })));
    }
  }

  private readAll(): GithubConnection[] {
    try {
      return JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      return [];
    }
  }

  private writeAll(items: GithubConnection[]): void {
    fs.writeFileSync(this.storePath, JSON.stringify(items, null, 2) + '\n', 'utf8');
  }

  get(accountId: string): GithubConnection | undefined {
    const conn = this.readAll().find((c) => c.accountId === accountId);
    return conn ? { ...conn, token: decryptSecret(conn.token) } : undefined;
  }

  save(conn: GithubConnection): GithubConnection {
    const all = this.readAll();
    const stored = { ...conn, token: encryptSecret(conn.token) };
    const idx = all.findIndex((c) => c.accountId === conn.accountId);
    if (idx >= 0) all[idx] = stored;
    else all.push(stored);
    this.writeAll(all);
    return conn;
  }

  delete(accountId: string): boolean {
    const all = this.readAll();
    const next = all.filter((c) => c.accountId !== accountId);
    const existed = next.length !== all.length;
    if (existed) this.writeAll(next);
    return existed;
  }
}
