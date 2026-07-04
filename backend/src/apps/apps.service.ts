import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Account, GitApp } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { GitAppStore } from './git-app.store';
import { RegisterGitAppDto } from './register-git-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';
import { isSafeBranchName, parseGithubRepoUrl } from './git-url.util';
import { buildLiveUrl, initialPipelineStages } from '../common/pipeline.util';

const DEFAULT_BRANCH = 'main';

// URL สาธารณะของ webhook endpoint (ผ่าน nginx, มี /api/v2 prefix) — ตั้งผ่าน env ได้
// ค่า default อิงจากโดเมนจริงที่ตั้งไว้ใน deployments/nginx/gatekeeper.conf
const PUBLIC_WEBHOOK_URL =
  process.env.PUBLIC_WEBHOOK_URL || 'https://gatekeeper.studiodup.com/api/v2/webhooks/github';

// หน้า Pipeline Dashboard (GET เดียวกับ webhook endpoint แต่มี ?app= ระบุตัว) — public แต่
// ต้องรู้ id ที่สุ่มมา (unguessable) เท่านั้นถึงจะเห็นได้ ไม่ list ทุก app แบบไม่ auth
const dashboardUrl = (id: string) => `${PUBLIC_WEBHOOK_URL}?app=${id}`;

@Injectable()
export class AppsService {
  constructor(
    private store: GitAppStore,
    private audit: AuditService,
  ) {}

  registerGitApp(dto: RegisterGitAppDto, account: Account) {
    const parsed = parseGithubRepoUrl(dto.repoUrl);
    if (!parsed) {
      throw new BadRequestException('repoUrl ต้องเป็นลิงก์ในรูปแบบ https://github.com/<owner>/<repo> เท่านั้น');
    }

    const branch = dto.branch?.trim() || DEFAULT_BRANCH;
    if (!isSafeBranchName(branch)) {
      throw new BadRequestException('branch ไม่ถูกต้อง');
    }

    // กัน repo เดียวกันถูกลงทะเบียนซ้ำ (ไม่งั้น secret เดิมของเจ้าของแรกจะถูกทับโดยไม่ตั้งใจ)
    const existing = this.store.findByRepo(parsed.repoFullName);
    if (existing) {
      throw new BadRequestException(`repo นี้ถูกลงทะเบียนไว้แล้ว (account อื่น หรือ app_id=${existing.id})`);
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex'); // 256-bit — เพียงพอสำหรับ HMAC-SHA256
    const now = new Date().toISOString();
    const id = `gitapp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    const app: GitApp = {
      id,
      accountId: account.id,
      repoFullName: parsed.repoFullName,
      cloneUrl: parsed.cloneUrl,
      branch,
      webhookSecret,
      // Hardcoded ตัวอย่างคำสั่งคุม container ต่อแอปลูกค้า — ใช้ id ที่ server สร้างเอง (ไม่ใช่ input
      // ลูกค้า) เป็นส่วนเดียวที่แทรกเข้า argv จึงยังไม่มีช่อง injection แต่ต้อง mount
      // /var/run/docker.sock เข้า backend container ก่อนถึงจะรันได้จริง (เท่ากับให้สิทธิ์ระดับ root
      // บน host — ต้องตัดสินใจร่วมกับทีม infra ก่อน ยังไม่ได้ทำใน docker-compose ตอนนี้)
      restartCommand: ['docker', 'restart', `gatekeeper-app-${id}`],
      enabled: true,
      runtime: dto.runtime,
      liveUrl: buildLiveUrl(parsed.repoFullName),
      pipelineStatus: 'idle',
      pipelineStages: initialPipelineStages(),
      createdAt: now,
      updatedAt: now,
    };

    this.store.save(app);

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:register',
      decision: 'INFO',
      reason: `registered:${app.repoFullName}`,
    });

    return {
      id: app.id,
      repoFullName: app.repoFullName,
      branch: app.branch,
      webhookUrl: PUBLIC_WEBHOOK_URL,
      webhookSecret, // แสดงกลับแค่ครั้งนี้ครั้งเดียว — endpoint อื่นจะไม่ echo secret ตัวนี้ซ้ำอีก
      contentType: 'application/json',
      events: ['push'],
      dashboardUrl: dashboardUrl(app.id),
    };
  }

  listMyApps(account: Account) {
    // map ทีละฟิลด์แทน spread ทั้งก้อน — กันเผลอ echo webhookSecret ออกทาง endpoint นี้ในอนาคต
    return this.store.findAll(account.id).map((app) => ({
      id: app.id,
      repoFullName: app.repoFullName,
      branch: app.branch,
      runtime: app.runtime,
      enabled: app.enabled,
      webhookUrl: PUBLIC_WEBHOOK_URL,
      dashboardUrl: dashboardUrl(app.id),
      liveUrl: app.liveUrl,
      pipelineStatus: app.pipelineStatus,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }));
  }

  updateGitApp(id: string, dto: UpdateGitAppDto, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);

    if (dto.branch !== undefined) {
      const branch = dto.branch.trim();
      if (!isSafeBranchName(branch)) throw new BadRequestException('branch ไม่ถูกต้อง');
      app.branch = branch;
    }
    if (dto.runtime !== undefined) app.runtime = dto.runtime;
    if (dto.enabled !== undefined) app.enabled = dto.enabled;
    app.updatedAt = new Date().toISOString();

    this.store.save(app);
    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:update',
      decision: 'INFO',
      reason: `updated:${app.repoFullName}`,
    });

    return {
      id: app.id,
      repoFullName: app.repoFullName,
      branch: app.branch,
      runtime: app.runtime,
      enabled: app.enabled,
      webhookUrl: PUBLIC_WEBHOOK_URL,
      dashboardUrl: dashboardUrl(app.id),
      liveUrl: app.liveUrl,
      pipelineStatus: app.pipelineStatus,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  removeGitApp(id: string, account: Account): { ok: boolean } {
    const app = this.getOwnedOrThrow(id, account.id);
    this.store.delete(app.id);

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:delete',
      decision: 'INFO',
      reason: `deleted:${app.repoFullName}`,
    });

    return { ok: true };
  }

  private getOwnedOrThrow(id: string, accountId: string): GitApp {
    const app = this.store.findById(id);
    if (!app) throw new NotFoundException(`gitapp_not_found:${id}`);
    if (app.accountId !== accountId) throw new ForbiddenException('not_your_app');
    return app;
  }
}
