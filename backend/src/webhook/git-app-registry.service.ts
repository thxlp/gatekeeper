import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GitApp } from '../common/types';
import { CONFIGS_DIR } from '../common/paths';
import { GitAppStore } from '../apps/git-app.store';

/**
 * รวม 2 แหล่งของ registered app เข้าด้วยกัน:
 *  1. configs/git-apps.json — static, ops-managed, ต้องแก้ไฟล์ + restart (เหมาะกับ app ที่ admin คุมเอง)
 *  2. GitAppStore (DATA_DIR) — dynamic, ลูกค้าลงทะเบียนเองผ่าน POST /apps/register (ดู apps/apps.service.ts)
 * เช็ค dynamic store ก่อนเสมอ เพราะเป็น path หลักที่ใช้งานจริงตอนนี้
 */
@Injectable()
export class GitAppRegistryService {
  private staticApps: GitApp[];

  constructor(private store: GitAppStore) {
    const configPath = path.join(CONFIGS_DIR, 'git-apps.json');
    this.staticApps = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : [];
  }

  findByRepo(repoFullName: string): GitApp | undefined {
    const dynamic = this.store.findByRepo(repoFullName);
    if (dynamic) return dynamic;
    return this.staticApps.find((a) => a.enabled && a.repoFullName === repoFullName);
  }

  getWebhookSecret(app: GitApp): string | undefined {
    if (app.webhookSecret) return app.webhookSecret;
    if (app.webhookSecretEnvVar) return process.env[app.webhookSecretEnvVar];
    return undefined;
  }
}
