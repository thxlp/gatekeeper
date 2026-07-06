import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/paths';

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
 */
@Injectable()
export class GithubTokenStore {
  private storePath = path.join(DATA_DIR, 'github-tokens.json');

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, '[]\n', 'utf8');
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
    return this.readAll().find((c) => c.accountId === accountId);
  }

  save(conn: GithubConnection): GithubConnection {
    const all = this.readAll();
    const idx = all.findIndex((c) => c.accountId === conn.accountId);
    if (idx >= 0) all[idx] = conn;
    else all.push(conn);
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
