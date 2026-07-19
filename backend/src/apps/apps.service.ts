import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Account, GitApp } from '../common/types';
import { GitAppStore } from './git-app.store';
import { RegisterGitAppDto } from './register-git-app.dto';
import { RegisterGithubAppDto } from './register-github-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';
import { ManualDeployDto } from './manual-deploy.dto';
import { AppConfigDto } from './app-config.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isSafeBranchName, parseGithubRepoUrl } from './git-url.util';
import { extractZipSafely } from './zip-extract.util';
import { buildLiveUrl, initialPipelineStages } from '../common/pipeline.util';
import { AuditService } from '../audit/audit.service';
import { DeployPipelineService } from '../deploy/deploy-pipeline.service';
import { GitAutomatorService } from '../webhook/git-automator.service';
import { GithubApiService } from '../github/github-api.service';
import { GithubTokenStore } from '../github/github-token.store';
import { QuotaService } from '../entitlement/quota.service';

const DEFAULT_BRANCH = 'main';

// URL สาธารณะของ webhook endpoint (ผ่าน nginx, มี /api prefix) — ตั้งผ่าน env ได้
// ค่า default อิงจากโดเมนจริงที่ตั้งไว้ใน deployments/nginx/gatekeeper.conf
const PUBLIC_WEBHOOK_URL =
  process.env.PUBLIC_WEBHOOK_URL || 'https://gatekeeper.studiodup.com/api/webhooks/github';

// หน้า Pipeline Dashboard (GET เดียวกับ webhook endpoint แต่มี ?app= ระบุตัว) — public แต่
// ต้องรู้ id ที่สุ่มมา (unguessable) เท่านั้นถึงจะเห็นได้ ไม่ list ทุก app แบบไม่ auth
const dashboardUrl = (id: string) => `${PUBLIC_WEBHOOK_URL}?app=${id}`;

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);

  constructor(
    private store: GitAppStore,
    private audit: AuditService,
    private deployPipeline: DeployPipelineService,
    private automator: GitAutomatorService,
    private githubApi: GithubApiService,
    private githubTokens: GithubTokenStore,
    private quota: QuotaService,
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
      port: dto.port,
      liveUrl: buildLiveUrl(id),
      pipelineStatus: 'idle',
      pipelineStages: initialPipelineStages(),
      createdAt: now,
      updatedAt: now,
    };
    this.applyConfig(app, dto);
    this.quota.assertWithinQuota(app);

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
   * ลงทะเบียนจาก GitHub repo picker (Railway-style) — ต่างจาก registerGitApp ตรงที่ user เชื่อม
   * บัญชี GitHub ไว้แล้ว (GET /github/repos) เราจึงสร้าง push webhook ใน GitHub ให้อัตโนมัติผ่าน
   * API ได้เลย (ไม่ต้อง copy secret ไปตั้งเอง) แล้วยิง first deploy ทันทีแบบ async ให้ UI poll ดูสถานะ
   */
  async registerFromGithub(dto: RegisterGithubAppDto, account: Account) {
    const conn = this.githubTokens.get(account.id);
    if (!conn) throw new BadRequestException('github_not_connected — เชื่อมบัญชี GitHub ก่อน');

    // ตรวจรูปแบบ owner/repo ด้วย validator ชุดเดียวกับ flow paste-URL เดิม (กัน input แปลกๆ ก่อนถึง git)
    const parsed = parseGithubRepoUrl(`https://github.com/${(dto.repoFullName || '').trim()}`);
    if (!parsed) throw new BadRequestException('repoFullName ต้องอยู่ในรูปแบบ <owner>/<repo>');

    const existing = this.store.findByRepo(parsed.repoFullName);
    if (existing) {
      throw new BadRequestException(`repo นี้ถูกลงทะเบียนไว้แล้ว (app_id=${existing.id})`);
    }

    // ยืนยันว่า token เข้าถึง repo ได้จริง + ใช้ default branch เมื่อ user ไม่ได้เลือกเอง
    const repoInfo = await this.githubApi.getRepo(conn.token, parsed.owner, parsed.repo);
    const branch = dto.branch?.trim() || repoInfo.defaultBranch || DEFAULT_BRANCH;
    if (!isSafeBranchName(branch)) throw new BadRequestException('branch ไม่ถูกต้อง');

    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const id = `gitapp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const app: GitApp = {
      id,
      accountId: account.id,
      sourceType: 'git',
      projectName: dto.projectName?.trim() || undefined,
      repoFullName: parsed.repoFullName,
      cloneUrl: parsed.cloneUrl,
      branch,
      webhookSecret,
      enabled: true,
      runtime: dto.runtime,
      port: dto.port,
      liveUrl: buildLiveUrl(id),
      pipelineStatus: 'idle',
      pipelineStages: initialPipelineStages(),
      createdAt: now,
      updatedAt: now,
    };
    this.applyConfig(app, dto);
    // เช็คโควต้าก่อนสร้าง webhook ฝั่ง GitHub — เกินโควต้าแล้วไม่ควรมี webhook ค้างใน repo
    this.quota.assertWithinQuota(app);

    // สร้าง webhook ฝั่ง GitHub ให้สำเร็จก่อนค่อย save app — พังตรงนี้ = ไม่มี app ค้างครึ่งๆ กลางๆ
    app.githubHookId = await this.githubApi.createOrUpdatePushWebhook(
      conn.token,
      parsed.owner,
      parsed.repo,
      PUBLIC_WEBHOOK_URL,
      webhookSecret,
    );
    this.store.save(app);

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:register-github',
      decision: 'INFO',
      reason: `registered_auto_webhook:${app.repoFullName}#${app.githubHookId}`,
    });

    // first deploy ทันทีแบบ Railway — ไม่ await ให้ endpoint ตอบเร็ว UI poll GET /apps/:id เอง
    this.startGitDeploy(app, conn.token);

    return {
      id: app.id,
      repoFullName: app.repoFullName,
      branch: app.branch,
      runtime: app.runtime,
      webhookUrl: PUBLIC_WEBHOOK_URL,
      autoWebhook: true,
      dashboardUrl: dashboardUrl(app.id),
      // คำนวณสดทุกครั้งแทนอ่านค่าที่ persist ไว้ตอนสร้าง — กัน URL ค้างชี้โดเมนเก่าถ้า
      // PUBLIC_LIVE_URL เปลี่ยนหลังจาก app ถูกสร้างไปแล้ว (ดู buildLiveUrl ใน pipeline.util.ts)
      liveUrl: buildLiveUrl(app.id),
      pipelineStatus: 'deploying' as const,
    };
  }

  /**
   * สั่ง deploy git app ทันที (ปุ่ม "Deploy now" — ไม่ต้องรอ push ใหม่เข้า repo) ใช้ pipeline
   * เดียวกับ webhook ทุกตัวอักษร ต่างแค่จุด trigger — ตอบกลับทันทีแล้วให้ UI poll สถานะเอา
   */
  triggerGitDeploy(id: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    if ((app.sourceType ?? 'git') !== 'git') {
      throw new BadRequestException('app นี้เป็น manual app — ใช้ /apps/manual/deploy แทน');
    }
    if (app.pipelineStatus === 'deploying') {
      throw new ConflictException('deploy_already_in_progress');
    }

    const token = this.githubTokens.get(account.id)?.token;
    this.startGitDeploy(app, token);

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:manual-trigger',
      decision: 'INFO',
      reason: `deploy_triggered:${app.repoFullName}`,
    });

    return { ok: true, id: app.id, pipelineStatus: 'deploying' as const };
  }

  /** clone + pipeline แบบ fire-and-forget — สถานะทั้งหมดอ่านผ่าน pipelineStages ใน store */
  private startGitDeploy(app: GitApp, token?: string): void {
    const requestId = uuidv4();
    this.deployPipeline.resetStages(app);
    this.deployPipeline.persistStage(app, 'payload_verification', 'success');

    this.deployPipeline
      .runPipeline(app, requestId, 'git-manual-trigger', (stagingDir) =>
        this.automator.cloneShallow(app, stagingDir, token),
      )
      .catch((err) => this.logger.warn(`trigger deploy ${app.id} failed: ${err.message}`));
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
      if (dto.port !== undefined) app.port = dto.port;
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
        port: dto.port,
        liveUrl: buildLiveUrl(id),
        pipelineStatus: 'idle',
        pipelineStages: initialPipelineStages(),
        createdAt: now,
        updatedAt: now,
      };
    }

    // config เพิ่มเติม (env/addons/resources/spa) ส่งมาเป็น JSON string เพราะ multipart —
    // parse + validate เป็น AppConfigDto ก่อนใช้ (มาตรฐานเดียวกับ endpoint อื่นที่รับ JSON body)
    if (dto.config) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(dto.config);
      } catch {
        throw new BadRequestException('config ต้องเป็น JSON ที่ถูกต้อง');
      }
      const cfg = plainToInstance(AppConfigDto, parsed);
      const errors = await validate(cfg, { whitelist: true, forbidNonWhitelisted: false });
      if (errors.length) throw new BadRequestException('config ไม่ถูกต้อง');
      this.applyConfig(app, cfg);
    }
    // เช็คทุกรอบ (ทั้งสร้างใหม่และ redeploy) — config ที่แนบมาอาจเพิ่ม memoryMb/addons จนเกินโควต้า
    this.quota.assertWithinQuota(app);

    app.updatedAt = new Date().toISOString();
    this.store.save(app);

    const requestId = uuidv4();
    this.deployPipeline.resetStages(app);
    this.deployPipeline.persistStage(app, 'payload_verification', 'success');

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:manual-deploy',
      decision: 'INFO',
      reason: dto.appId ? `redeployed:${app.id}` : `created:${app.id}`,
    });

    // ตอบ id ทันทีแล้วปล่อย pipeline วิ่ง background ให้หน้า /apps/<id> poll สถานะ stage
    // สดๆ เอา — แพทเทิร์นเดียวกับ triggerGitDeploy (เดิม await ทั้ง pipeline ทำให้ผู้ใช้
    // จ้องปุ่มหมุนเป็นนาทีโดยไม่เห็นความคืบหน้าอะไรเลย ต่างจาก flow ฝั่ง git repo)
    const buffer = file.buffer;
    this.deployPipeline
      .runPipeline(app, requestId, 'manual-deploy', (stagingDir) => extractZipSafely(buffer, stagingDir))
      .catch((err) => this.logger.warn(`manual deploy ${app.id} failed: ${err.message}`));

    return { id: app.id, status: 'deploying' };
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
      // คำนวณสดทุกครั้งแทนอ่านค่าที่ persist ไว้ตอนสร้าง — กัน URL ค้างชี้โดเมนเก่าถ้า
      // PUBLIC_LIVE_URL เปลี่ยนหลังจาก app ถูกสร้างไปแล้ว (ดู buildLiveUrl ใน pipeline.util.ts)
      liveUrl: buildLiveUrl(app.id),
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
      // คำนวณสดทุกครั้งแทนอ่านค่าที่ persist ไว้ตอนสร้าง — กัน URL ค้างชี้โดเมนเก่าถ้า
      // PUBLIC_LIVE_URL เปลี่ยนหลังจาก app ถูกสร้างไปแล้ว (ดู buildLiveUrl ใน pipeline.util.ts)
      liveUrl: buildLiveUrl(app.id),
      pipelineStatus: app.pipelineStatus,
      pipelineStages: app.pipelineStages,
      ...this.configSummary(app),
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
    if (dto.port !== undefined) app.port = dto.port;
    if (dto.enabled !== undefined) app.enabled = dto.enabled;
    this.applyConfig(app, dto);
    this.quota.assertWithinQuota(app);
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
      // คำนวณสดทุกครั้งแทนอ่านค่าที่ persist ไว้ตอนสร้าง — กัน URL ค้างชี้โดเมนเก่าถ้า
      // PUBLIC_LIVE_URL เปลี่ยนหลังจาก app ถูกสร้างไปแล้ว (ดู buildLiveUrl ใน pipeline.util.ts)
      liveUrl: buildLiveUrl(app.id),
      pipelineStatus: app.pipelineStatus,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  removeGitApp(id: string, account: Account): { ok: boolean } {
    const app = this.getOwnedOrThrow(id, account.id);
    this.store.delete(app.id);

    // เก็บกวาด container ของแอป + addon (postgres/redis) — best-effort ไม่บล็อกการลบ
    void this.deployPipeline.cleanupContainers(app);

    // ถ้า webhook ฝั่ง GitHub เป็นของที่เราสร้างให้อัตโนมัติ ตามไปเก็บกวาดด้วย (best-effort —
    // token อาจถูก revoke หรือ repo ถูกลบไปแล้ว ไม่ต้อง fail การลบ app เพราะเรื่องนี้)
    const parsed = app.repoFullName ? parseGithubRepoUrl(`https://github.com/${app.repoFullName}`) : null;
    const token = this.githubTokens.get(account.id)?.token;
    if (app.githubHookId && parsed && token) {
      void this.githubApi.deleteWebhook(token, parsed.owner, parsed.repo, app.githubHookId);
    }

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

  /** เซ็ต config ต่อ app (env/build-arg/addons/resource/spa) จาก DTO — undefined = ไม่แตะค่าเดิม */
  private applyConfig(app: GitApp, dto: AppConfigDto): void {
    if (dto.envVars !== undefined) app.envVars = dto.envVars.filter((e) => e.key);
    if (dto.buildArgs !== undefined) app.buildArgs = dto.buildArgs.filter((e) => e.key);
    if (dto.addons !== undefined) app.addons = dto.addons;
    if (dto.memoryMb !== undefined) app.memoryMb = dto.memoryMb;
    if (dto.cpuMilli !== undefined) app.cpu = dto.cpuMilli / 1000;
    if (dto.spa !== undefined) app.spa = dto.spa;
  }

  /** สรุป config ที่ปลอดภัยส่งกลับ API — env/build-arg คืนแค่ "key" ไม่คืน value (เป็นความลับ) */
  private configSummary(app: GitApp) {
    return {
      port: app.port,
      envKeys: (app.envVars || []).map((e) => e.key),
      buildArgKeys: (app.buildArgs || []).map((e) => e.key),
      addons: app.addons || [],
      memoryMb: app.memoryMb,
      cpu: app.cpu,
      spa: app.spa ?? false,
    };
  }
}
