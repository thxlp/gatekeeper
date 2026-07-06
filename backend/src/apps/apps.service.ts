import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Account, GitApp } from '../common/types';
import { GitAppStore } from './git-app.store';
import { RegisterGitAppDto } from './register-git-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';
import { ManualDeployDto } from './manual-deploy.dto';
import { isSafeBranchName, parseGithubRepoUrl } from './git-url.util';
import { extractZipSafely } from './zip-extract.util';
import { buildLiveUrl, initialPipelineStages } from '../common/pipeline.util';
import { AuditService } from '../audit/audit.service';
import { DeployPipelineService } from '../deploy/deploy-pipeline.service';

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
    private deployPipeline: DeployPipelineService,
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
      sourceType: 'git',
      repoFullName: parsed.repoFullName,
      cloneUrl: parsed.cloneUrl,
      branch,
      webhookSecret,
      enabled: true,
      runtime: dto.runtime,
      liveUrl: buildLiveUrl(id),
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

  /**
   * Manual zip-upload deploy — สร้าง app ใหม่ (ไม่ส่ง appId มา) หรือ redeploy app manual เดิม
   * (ส่ง appId มา) แล้ววิ่งผ่าน pipeline เดียวกับ git-webhook deploy ทุกตัวอักษร
   * (DeployPipelineService.runPipeline) ต่างกันแค่วิธีได้ source code มา (แตก zip แทน git clone)
   */
  async deployManual(dto: ManualDeployDto, file: Express.Multer.File | undefined, account: Account) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('ต้องแนบไฟล์ archive (.zip)');
    }

    let app: GitApp;
    if (dto.appId) {
      app = this.getOwnedOrThrow(dto.appId, account.id);
      if ((app.sourceType ?? 'git') !== 'manual') {
        throw new BadRequestException('appId นี้ไม่ใช่ manual app');
      }
      if (dto.runtime) app.runtime = dto.runtime;
      if (dto.projectName?.trim()) app.projectName = dto.projectName.trim();
    } else {
      if (!dto.runtime) {
        throw new BadRequestException('runtime จำเป็นตอนสร้าง app ใหม่');
      }
      const now = new Date().toISOString();
      const id = `gitapp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      app = {
        id,
        accountId: account.id,
        sourceType: 'manual',
        projectName: dto.projectName?.trim() || id,
        enabled: true,
        runtime: dto.runtime,
        liveUrl: buildLiveUrl(id),
        pipelineStatus: 'idle',
        pipelineStages: initialPipelineStages(),
        createdAt: now,
        updatedAt: now,
      };
    }

    app.updatedAt = new Date().toISOString();
    this.store.save(app);

    const requestId = uuidv4();
    this.deployPipeline.resetStages(app);
    this.deployPipeline.persistStage(app, 'payload_verification', 'success');

    const buffer = file.buffer;
    const result = await this.deployPipeline.runPipeline(app, requestId, 'manual-deploy', (stagingDir) =>
      extractZipSafely(buffer, stagingDir),
    );

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:manual-deploy',
      decision: 'INFO',
      reason: dto.appId ? `redeployed:${app.id}` : `created:${app.id}`,
    });

    return { id: app.id, ...result };
  }

  listMyApps(account: Account) {
    // map ทีละฟิลด์แทน spread ทั้งก้อน — กันเผลอ echo webhookSecret ออกทาง endpoint นี้ในอนาคต
    return this.store.findAll(account.id).map((app) => ({
      id: app.id,
      sourceType: app.sourceType ?? 'git',
      projectName: app.projectName,
      repoFullName: app.repoFullName,
      branch: app.branch,
      runtime: app.runtime,
      enabled: app.enabled,
      webhookUrl: (app.sourceType ?? 'git') === 'git' ? PUBLIC_WEBHOOK_URL : undefined,
      dashboardUrl: dashboardUrl(app.id),
      liveUrl: app.liveUrl,
      pipelineStatus: app.pipelineStatus,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }));
  }

  // ใช้เป็น endpoint ที่ frontend poll ระหว่าง deploy กำลังวิ่งอยู่ — ต่างจาก listMyApps ตรงที่
  // endpoint นี้ส่ง pipelineStages (รายละเอียดทั้ง 5 stage) กลับไปด้วย ของเดิม listMyApps ไม่ส่ง
  getAppDetail(id: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    return {
      id: app.id,
      sourceType: app.sourceType ?? 'git',
      projectName: app.projectName,
      repoFullName: app.repoFullName,
      branch: app.branch,
      runtime: app.runtime,
      enabled: app.enabled,
      webhookUrl: (app.sourceType ?? 'git') === 'git' ? PUBLIC_WEBHOOK_URL : undefined,
      dashboardUrl: dashboardUrl(app.id),
      liveUrl: app.liveUrl,
      pipelineStatus: app.pipelineStatus,
      pipelineStages: app.pipelineStages,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
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
      reason: `updated:${app.repoFullName ?? app.id}`,
    });

    return {
      id: app.id,
      sourceType: app.sourceType ?? 'git',
      repoFullName: app.repoFullName,
      branch: app.branch,
      runtime: app.runtime,
      enabled: app.enabled,
      webhookUrl: (app.sourceType ?? 'git') === 'git' ? PUBLIC_WEBHOOK_URL : undefined,
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
      reason: `deleted:${app.repoFullName ?? app.id}`,
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
