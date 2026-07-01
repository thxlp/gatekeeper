import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GitApp } from '../common/types';
import { DATA_DIR } from '../common/paths';

/**
 * Store สำหรับ GitApp ที่ลูกค้าลงทะเบียนเองผ่าน API (ต่างจาก configs/git-apps.json
 * ที่เป็น static list แบบ ops-managed) — เก็บใน DATA_DIR เพราะมี secret จริงอยู่ข้างใน
 * ต้องไม่ commit ลง git repo
 *
 * อ่านจากไฟล์สดทุกครั้ง (ไม่ cache เป็น in-memory Map เหมือน PluginStore) เพราะ backend
 * รันหลาย instance (backend-1/backend-2) แชร์ volume เดียวกัน — ถ้า cache ไว้ instance ที่ไม่ได้
 * รับ register request จะไม่เห็น app ใหม่จนกว่าจะ restart ซึ่งพังกับ webhook ที่ยิงมาสุ่ม instance ผ่าน LB
 */
@Injectable()
export class GitAppStore {
  private storePath = path.join(DATA_DIR, 'git-apps-store.json');

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, '[]\n', 'utf8');
    }
  }

  private readAll(): GitApp[] {
    try {
      return JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      return [];
    }
  }

  private writeAll(apps: GitApp[]): void {
    fs.writeFileSync(this.storePath, JSON.stringify(apps, null, 2) + '\n', 'utf8');
  }

  findAll(accountId?: string): GitApp[] {
    const all = this.readAll();
    return accountId ? all.filter((a) => a.accountId === accountId) : all;
  }

  findById(id: string): GitApp | undefined {
    return this.readAll().find((a) => a.id === id);
  }

  findByRepo(repoFullName: string): GitApp | undefined {
    return this.readAll().find((a) => a.enabled && a.repoFullName === repoFullName);
  }

  save(app: GitApp): GitApp {
    const all = this.readAll();
    const idx = all.findIndex((a) => a.id === app.id);
    if (idx >= 0) all[idx] = app;
    else all.push(app);
    this.writeAll(all);
    return app;
  }
}
