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
import { Account, EnvVar, GitApp, GitProvider } from '../common/types';
import { GitAppStore } from './git-app.store';
import { RegisterGitAppDto } from './register-git-app.dto';
import { RegisterGithubAppDto } from './register-github-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';
import { ManualDeployDto } from './manual-deploy.dto';
import { AppConfigDto } from './app-config.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isSafeBranchName, parseGitRepoUrl, parseGithubRepoUrl } from './git-url.util';
import { extractZipSafely } from './zip-extract.util';
import { buildLiveUrl, initialPipelineStages } from '../common/pipeline.util';
import { AuditService } from '../audit/audit.service';
import { DeployPipelineService } from '../deploy/deploy-pipeline.service';
import { DockerRuntimeService } from '../deploy/docker-runtime.service';
import { CloneAuth, GitAutomatorService } from '../webhook/git-automator.service';
import { CloneAuthResolver } from '../git-credentials/clone-auth.resolver';
import { GithubApiService } from '../github/github-api.service';
import { GithubTokenStore } from '../github/github-token.store';
import { QuotaService } from '../entitlement/quota.service';

const DEFAULT_BRANCH = 'main';

// ชื่อ env var ต้องเป็นรูปแบบ POSIX (ขึ้นต้นตัวอักษร/_ ตามด้วย A-Z a-z 0-9 _) — กันชื่อแปลกๆ
// ที่ inject เข้า container แล้วพัง หรือ key ที่มี '=' / ช่องว่างทำ env string เพี้ยน
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_KEY_MAXLEN = 256;
const ENV_VALUE_MAXLEN = 8192;

/**
 * parse ข้อความ .env ที่ผู้ใช้วางมา (import ทีเดียวหลายตัว) — รองรับ comment (#), บรรทัดว่าง,
 * `export KEY=...`, และค่าที่ครอบด้วย single/double quote (ถอด quote ให้) บรรทัดที่ไม่มี '='
 * หรือ key ว่างถูกข้าม ไม่ throw เพื่อให้ import แบบ best-effort จากไฟล์จริงที่มักมี comment ปน
 */
function parseDotenv(raw: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.replace(/^export\s+/, '');
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out.push({ key, value });
  }
  return out;
}

// URL สาธารณะของ webhook endpoint (ผ่าน nginx, มี /api prefix) — ตั้งผ่าน env ได้
// ค่า default อิงจากโดเมนจริงที่ตั้งไว้ใน deployments/host/gatekeeper-host.conf
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
    private cloneAuth: CloneAuthResolver,
    private quota: QuotaService,
    private dockerRuntime: DockerRuntimeService,
  ) {}

  registerGitApp(dto: RegisterGitAppDto, account: Account) {
    const parsed = parseGitRepoUrl(dto.repoUrl);
    if (!parsed) {
      throw new BadRequestException(
        'repoUrl ต้องเป็นลิงก์ https ของ github.com / gitlab.com / bitbucket.org ในรูปแบบ <owner>/<repo>',
      );
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
      provider: parsed.provider,
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
    this.startGitDeploy(app, { username: 'x-access-token', token: conn.token });

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

    this.startGitDeploy(app, this.cloneAuth.resolve(app, account.id));

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:manual-trigger',
      decision: 'INFO',
      reason: `deploy_triggered:${app.repoFullName}`,
    });

    return { ok: true, id: app.id, pipelineStatus: 'deploying' as const };
  }

  /**
   * Rollback ไป release เดิม — safety net ตอน deploy ตัวใหม่พัง (โดยเฉพาะเคส degraded ที่
   * ถูก promote ทับตัวเก่าไปแล้ว) รัน image เดิมที่เก็บ tag ไว้ ไม่ rebuild/scan ซ้ำ
   * ตอบทันทีแล้วให้ UI poll GET /apps/:id ดู stage เอา — แพทเทิร์นเดียวกับ triggerGitDeploy
   */
  rollback(id: string, releaseId: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    if (app.pipelineStatus === 'deploying') {
      throw new ConflictException('deploy_already_in_progress');
    }
    const target = (app.releases ?? []).find((r) => r.id === releaseId);
    if (!target) throw new NotFoundException(`release_not_found:${releaseId}`);
    if (app.activeReleaseId === releaseId) {
      throw new BadRequestException('release_already_active');
    }

    const requestId = uuidv4();
    this.audit.append({
      requestId,
      accountId: account.id,
      stage: 'gitapp:rollback',
      decision: 'INFO',
      reason: `rollback_requested:${app.id}:${releaseId}`,
    });

    this.deployPipeline
      .runRollback(app, requestId, releaseId)
      .catch((err) => this.logger.warn(`rollback ${app.id} failed: ${err.message}`));

    return { ok: true, id: app.id, pipelineStatus: 'deploying' as const };
  }

  /** clone + pipeline แบบ fire-and-forget — สถานะทั้งหมดอ่านผ่าน pipelineStages ใน store */
  private startGitDeploy(app: GitApp, auth?: CloneAuth): void {
    const requestId = uuidv4();
    this.deployPipeline.resetStages(app);
    this.deployPipeline.persistStage(app, 'payload_verification', 'success');

    this.deployPipeline
      .runPipeline(app, requestId, 'git-manual-trigger', (stagingDir) =>
        this.automator.cloneShallow(app, stagingDir, auth),
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
      // ===== auto-deploy / webhook setup (เฉพาะ git app, owner-only) =====
      provider: (app.provider || 'github') as GitProvider,
      // webhook URL ตาม provider (เปลี่ยน suffix /github → /gitlab|/bitbucket)
      webhookUrl:
        (app.sourceType ?? 'git') === 'git'
          ? PUBLIC_WEBHOOK_URL.replace(/\/github$/, `/${app.provider || 'github'}`)
          : undefined,
      // secret สำหรับ setup webhook เอง (จำเป็นตอนตั้งค่าใน repo) — เฉพาะ self-service ที่ระบบสุ่มให้
      webhookSecret: app.webhookSecret,
      autoDeploy: app.autoDeploy !== false, // undefined = เปิด (default)
      lastAutoDeployAt: app.lastAutoDeployAt,
      customDomains: app.customDomains ?? [],
      dashboardUrl: dashboardUrl(app.id),
      // คำนวณสดทุกครั้งแทนอ่านค่าที่ persist ไว้ตอนสร้าง — กัน URL ค้างชี้โดเมนเก่าถ้า
      // PUBLIC_LIVE_URL เปลี่ยนหลังจาก app ถูกสร้างไปแล้ว (ดู buildLiveUrl ใน pipeline.util.ts)
      liveUrl: buildLiveUrl(app.id),
      pipelineStatus: app.pipelineStatus,
      pipelineStages: app.pipelineStages,
      // ประวัติ release สำหรับปุ่ม rollback — echo แค่ metadata ไม่ส่ง imageTag (internal)
      releases: (app.releases ?? []).map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        sourceType: r.sourceType,
        commitSha: r.commitSha,
        branch: r.branch,
        degraded: r.degraded ?? false,
        active: r.id === app.activeReleaseId,
      })),
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
    if (dto.autoDeploy !== undefined) app.autoDeploy = dto.autoDeploy;
    this.applyConfig(app, dto);
    this.quota.assertWithinQuota(app);
    app.updatedAt = new Date().toISOString();

    this.store.save(app);

    // ถ้า config รอบนี้แตะ addons ให้หยุด container ของตัวที่ถูกถอดทันที (เลิกกิน RAM ไม่รอ
    // deploy รอบหน้า) — fire-and-forget: docker ช้า/ล่มไม่ควรทำให้ PATCH ค้าง และ
    // provisionAddons กวาดซ้ำให้อีกชั้นตอน deploy ถัดไปอยู่ดี ส่วน volume ถูกเก็บไว้ตาม
    // retention (7 วัน default) แล้ว sweeper ใน pipeline ค่อยลบจริง
    if (dto.addons !== undefined) {
      void this.deployPipeline.cleanupUnwantedAddonContainers(app);
    }

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

    // ลบสำเนา source ล่าสุดที่เก็บไว้ audit/debug ด้วย — ไม่งั้น dir ค้างใน data/git-deployed
    // ตลอดไปหลังแอปถูกลบ (ส่วน image ของ release history ถูกกวาดใน cleanupContainers ข้างบน)
    this.deployPipeline.cleanupDeployedDir(app.id);

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

  // ===== Environment variables / secrets manager =====
  // ค่า env เป็นความลับ (เข้ารหัสใน store) — API คืนแค่ key + updatedAt ไม่เคย echo ค่าจริง
  // ทุก mutation แค่แก้ store; ค่าใหม่มีผลตอน "deploy รอบถัดไป" เท่านั้น (env ผูกตอนสร้าง
  // container) จึงตอบ needsRedeploy:true ให้ UI ขึ้นแบนเนอร์เตือน

  /** รายการ env var (มาสก์ค่า) เรียงตามชื่อ key */
  listEnv(id: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    return { vars: this.maskedEnv(app) };
  }

  /** เพิ่ม/แก้ค่า env ทีละตัว (upsert) — ตัวอื่นค่าเดิมคงอยู่ครบ */
  setEnvVar(id: string, key: string, value: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    const k = this.assertValidEnvKey(key);
    this.assertValidEnvValue(value);
    const list = (app.envVars || []).filter((e) => e.key);
    const entry: EnvVar = { key: k, value, updatedAt: new Date().toISOString() };
    const idx = list.findIndex((e) => e.key === k);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    app.envVars = list;
    this.persistEnvChange(app, account, `env:set:${k}`);
    return { vars: this.maskedEnv(app), needsRedeploy: true };
  }

  /** ลบ env var ทีละตัว */
  deleteEnvVar(id: string, key: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    const k = key.trim();
    const before = (app.envVars || []).length;
    app.envVars = (app.envVars || []).filter((e) => e.key !== k);
    if (app.envVars.length === before) throw new NotFoundException(`env_not_found:${k}`);
    this.persistEnvChange(app, account, `env:delete:${k}`);
    return { vars: this.maskedEnv(app), needsRedeploy: true };
  }

  /** import จากข้อความ .env ที่วางมา — upsert ทับของเดิม (merge) คืนจำนวนที่รับเข้า */
  importEnv(id: string, raw: string, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    const parsed = parseDotenv(raw || '');
    if (!parsed.length) throw new BadRequestException('ไม่พบตัวแปรใน .env ที่วางมา (บรรทัดต้องเป็น KEY=value)');
    const now = new Date().toISOString();
    const map = new Map<string, EnvVar>((app.envVars || []).filter((e) => e.key).map((e) => [e.key, e]));
    for (const { key, value } of parsed) {
      const k = this.assertValidEnvKey(key);
      this.assertValidEnvValue(value);
      map.set(k, { key: k, value, updatedAt: now });
    }
    app.envVars = [...map.values()];
    this.persistEnvChange(app, account, `env:import:${parsed.length}`);
    return { vars: this.maskedEnv(app), needsRedeploy: true, imported: parsed.length };
  }

  /** view ที่ปลอดภัยส่งออก API — key + เวลาแก้ล่าสุด ไม่มีค่าจริง เรียงตาม key */
  private maskedEnv(app: GitApp) {
    return (app.envVars || [])
      .filter((e) => e.key)
      .map((e) => ({ key: e.key, updatedAt: e.updatedAt }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  private assertValidEnvKey(key: string): string {
    const k = (key || '').trim();
    if (!k) throw new BadRequestException('env key ห้ามว่าง');
    if (k.length > ENV_KEY_MAXLEN) throw new BadRequestException(`env key ยาวเกิน ${ENV_KEY_MAXLEN} ตัวอักษร`);
    if (!ENV_KEY_RE.test(k)) {
      throw new BadRequestException(
        `env key ไม่ถูกต้อง: "${key}" — ต้องขึ้นต้นด้วยตัวอักษรหรือ _ แล้วตามด้วย A-Z a-z 0-9 _ เท่านั้น`,
      );
    }
    return k;
  }

  private assertValidEnvValue(value: string): void {
    if (typeof value !== 'string') throw new BadRequestException('env value ต้องเป็น string');
    if (value.length > ENV_VALUE_MAXLEN) throw new BadRequestException(`env value ยาวเกิน ${ENV_VALUE_MAXLEN} ตัวอักษร`);
  }

  private persistEnvChange(app: GitApp, account: Account, stage: string): void {
    app.updatedAt = new Date().toISOString();
    this.store.save(app);
    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'gitapp:env',
      decision: 'INFO',
      reason: `${stage} on ${app.repoFullName ?? app.projectName ?? app.id}`,
    });
  }

  // ===== Live logs (delegate ไป DockerRuntime หลังเช็ค ownership) =====

  /** snapshot log ล่าสุด — คืน { lines } หรือ { pending:true } ถ้ายังไม่มี container */
  async getLogs(id: string, tail: number, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    const lines = await this.dockerRuntime.getContainerLogs(app, tail);
    if (lines === null) return { pending: true, lines: [] as string[] };
    return { pending: false, lines };
  }

  /** เปิด live tail stream — คืน LogStream หรือ null ถ้ายังไม่มี container (owner-scoped) */
  async openLogStream(id: string, tail: number, account: Account) {
    const app = this.getOwnedOrThrow(id, account.id);
    return this.dockerRuntime.openLogStream(app, tail);
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
    if (dto.addons !== undefined) {
      app.addons = dto.addons;
      // ติดธง retired ให้ connection ของ addon ที่ถูกถอด (แทนการลบ entry — เก็บ password ไว้
      // เผื่อติ๊กกลับภายใน retention ได้ข้อมูลเดิมคืน) และล้างธงให้ตัวที่ถูกติ๊กกลับมา
      // ต้องเกิดก่อน save เสมอ ธงถึงจะลง store — ดู retireUnwantedAddons ใน docker-runtime
      this.deployPipeline.retireUnwantedAddons(app);
    }
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
