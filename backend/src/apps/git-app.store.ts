import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GitApp } from '../common/types';
import { DATA_DIR } from '../common/paths';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../common/crypto.util';

/**
 * แปลงทุก secret field ของ GitApp ด้วยฟังก์ชัน fn (encrypt หรือ decrypt) แบบ immutable
 * — webhookSecret, envVars[].value, buildArgs[].value, addonConnections[].url
 * รวม secret ทุกที่ไว้จุดเดียว เวลาเพิ่ม field ใหม่ที่เป็นความลับให้มาแก้ที่นี่ที่เดียว
 */
function transformSecrets(app: GitApp, fn: (v: string) => string): GitApp {
  const out: GitApp = { ...app };
  if (out.webhookSecret) out.webhookSecret = fn(out.webhookSecret);
  if (out.envVars) out.envVars = out.envVars.map((e) => ({ ...e, value: fn(e.value) }));
  if (out.buildArgs) out.buildArgs = out.buildArgs.map((e) => ({ ...e, value: fn(e.value) }));
  if (out.addonConnections) out.addonConnections = out.addonConnections.map((c) => ({ ...c, url: fn(c.url) }));
  return out;
}

/**
 * Store สำหรับ GitApp ที่ลูกค้าลงทะเบียนเองผ่าน API (ต่างจาก configs/git-apps.json
 * ที่เป็น static list แบบ ops-managed) — เก็บใน DATA_DIR เพราะมี secret จริงอยู่ข้างใน
 * ต้องไม่ commit ลง git repo
 *
 * อ่านจากไฟล์สดทุกครั้ง (ไม่ cache เป็น in-memory Map) เพราะ backend
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

    // migrate ครั้งเดียวตอน boot: entry เก่าที่ secret ยังเป็น plaintext ในไฟล์ ถูกเข้ารหัสทับทันที
    // (writeAll จัดการให้) ไม่ต้องรอ save รอบถัดไปของแต่ละ app
    try {
      const raw: GitApp[] = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
      if (raw.some((a) => this.hasPlaintextSecret(a))) {
        // writeAll เข้ารหัสค่าที่ยังเป็น plaintext ให้เอง (ค่าที่เข้ารหัสแล้วปล่อยผ่าน)
        this.writeAll(raw);
      }
    } catch {
      // ไฟล์ว่าง/เพิ่งสร้าง — ไม่มีอะไรต้อง migrate
    }
  }

  // secret ทุกตัวในไฟล์ (webhookSecret, envVars[].value, buildArgs[].value, addonConnections[].url)
  // ถูกเข้ารหัส AES-256-GCM (encrypt ตอนเขียน / decrypt ตอนอ่าน — โค้ดนอก store เห็น plaintext
  // อย่างเดียว) entry เก่าที่ยังเป็น plaintext อ่านผ่านได้ (decryptSecret ปล่อยค่าที่ไม่มี version
  // prefix ผ่านตรงๆ) และจะถูกเข้ารหัสทับตอน save ครั้งถัดไปเอง

  private hasPlaintextSecret(a: GitApp): boolean {
    let found = false;
    transformSecrets(a, (v) => {
      if (v && !isEncryptedSecret(v)) found = true;
      return v;
    });
    return found;
  }

  private readAll(): GitApp[] {
    let apps: GitApp[];
    try {
      apps = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      return [];
    }
    // ตั้งใจให้ decrypt อยู่นอก try — master key ผิดต้อง throw ดังๆ (fail-closed) ไม่ใช่เงียบๆ
    // คืน list ว่างแล้วระบบทำเหมือนไม่มี app ลงทะเบียนอยู่เลย
    return apps.map((a) => transformSecrets(a, (v) => decryptSecret(v)));
  }

  private writeAll(apps: GitApp[]): void {
    const stored = apps.map((a) => transformSecrets(a, (v) => (isEncryptedSecret(v) ? v : encryptSecret(v))));
    fs.writeFileSync(this.storePath, JSON.stringify(stored, null, 2) + '\n', 'utf8');
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

  // หาแอปจาก custom domain ที่ active แล้ว (ใช้ตอน proxy request จาก vhost ของโดเมนนั้น)
  findByCustomDomain(domain: string): GitApp | undefined {
    const d = domain.toLowerCase();
    return this.readAll().find(
      (a) => a.enabled && (a.customDomains || []).some((cd) => cd.status === 'active' && cd.domain === d),
    );
  }

  save(app: GitApp): GitApp {
    const all = this.readAll();
    const idx = all.findIndex((a) => a.id === app.id);
    if (idx >= 0) all[idx] = app;
    else all.push(app);
    this.writeAll(all);
    return app;
  }

  delete(id: string): boolean {
    const all = this.readAll();
    const next = all.filter((a) => a.id !== id);
    const existed = next.length !== all.length;
    if (existed) this.writeAll(next);
    return existed;
  }
}
