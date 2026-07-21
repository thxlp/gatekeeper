import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Finding, GitApp, PipelineStageKey, PipelineStageStatus, ReleaseRecord } from '../common/types';
import { DATA_DIR } from '../common/paths';
import { ScannerService } from '../scanner/scanner.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { UsageCollectorService } from '../entitlement/usage-collector.service';
import { GitAppStore } from '../apps/git-app.store';
import { ZipExtractionError } from '../apps/zip-extract.util';
import { GitAutomatorService } from '../webhook/git-automator.service';
import { DockerRuntimeService } from './docker-runtime.service';
import { initialPipelineStages } from '../common/pipeline.util';
import { NotificationsService } from '../notification/notifications.service';
import { deployFailedEmail, rollbackFailedEmail } from '../mail/mail-templates';

export interface PipelineOutcome {
  decision: 'ALLOW' | 'BLOCK' | 'QUARANTINE';
  requestId: string;
  score?: number;
  findings?: Finding[];
  reason?: string;
  message?: string;
  deployedPath?: string;
  restartOk?: boolean;
}

/**
 * Pipeline หลัก (clone/extract -> scan -> risk engine -> ticket -> build -> deploy) ที่ใช้ร่วมกัน
 * ทั้ง git-webhook deploy (github-webhook.service.ts) และ manual zip-upload deploy
 * (apps.service.ts deployManual) — สอง source ต่างกันแค่วิธีได้ source code มาลง stagingDir
 * (acquireSource callback: clone จาก git หรือแตก zip) ส่วนที่เหลือทั้งหมดใช้โค้ดเดียวกันทุกตัวอักษร
 * ย้ายมาจาก github-webhook.service.ts เดิม (ของเดิมทำ inline ทั้งหมดในที่เดียว เฉพาะ git เท่านั้น)
 */
// volume ของ addon ที่ถูกถอดถูกเก็บไว้ก่อนช่วงหนึ่ง (ติ๊กกลับ = ได้ข้อมูลเดิมคืน) แล้วค่อยลบจริง
const ADDON_VOLUME_RETENTION_MS = Number(process.env.ADDON_VOLUME_RETENTION_DAYS || 7) * 24 * 60 * 60 * 1000;
const ADDON_VOLUME_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // ชั่วโมงละครั้งพอ — งานมันหลัก "วัน"

// จำนวน release ล่าสุดที่เก็บไว้ต่อ app (image + history) สำหรับ rollback — เกินนี้ prune image ทิ้ง
// (ก่อนมีฟีเจอร์นี้ image เก่าไม่เคยถูกลบเลย สะสมไปเรื่อยๆ — retention นี้กันดิสก์โตไม่หยุด)
const RELEASE_KEEP = Math.max(1, Number(process.env.RELEASE_KEEP) || 5);

@Injectable()
export class DeployPipelineService implements OnModuleInit {
  private readonly logger = new Logger(DeployPipelineService.name);
  private stagingRoot = path.join(DATA_DIR, 'git-staging');
  private deployedRoot = path.join(DATA_DIR, 'git-deployed');
  private quarantineRoot = path.join(DATA_DIR, 'git-quarantine');

  onModuleInit(): void {
    // sweeper ลบ volume ของ addon ที่ retired พ้น retention — รันทั้ง backend-1/2 ได้พร้อมกัน
    // ไม่เป็นไร (ลบซ้ำ = 404 = ถือว่าสำเร็จ) unref กัน timer ค้างตอน shutdown ใน test/CLI
    const timer = setInterval(() => void this.sweepRetiredAddonVolumes(), ADDON_VOLUME_SWEEP_INTERVAL_MS);
    timer.unref?.();
    void this.sweepRetiredAddonVolumes(); // กวาดหนึ่งรอบตอน boot — ของที่ครบกำหนดระหว่าง backend down ไม่ต้องรออีกชั่วโมง
  }

  /**
   * ลบ volume ของ addon ที่ถูกถอดและพ้น retention แล้ว + ตัด entry ออกจาก store — ข้าม
   * ชนิดที่กลับมาอยู่ใน app.addons อีกรอบ (user ติ๊กกลับแต่ยังไม่ deploy จึงยังติดธง retired)
   */
  async sweepRetiredAddonVolumes(): Promise<void> {
    const cutoff = Date.now() - ADDON_VOLUME_RETENTION_MS;
    for (const app of this.gitAppStore.findAll()) {
      const wanted = new Set(app.addons || []);
      const due = (app.addonConnections || []).filter(
        (c) => c.retiredAt && !wanted.has(c.type) && Date.parse(c.retiredAt) <= cutoff,
      );
      if (!due.length) continue;
      const removedTypes = new Set<string>();
      for (const c of due) {
        if (await this.dockerRuntime.removeRetiredAddonVolume(app.id, c.type)) removedTypes.add(c.type);
      }
      if (removedTypes.size) {
        // อ่าน app สดจาก store ก่อนเขียน — ระหว่างรอ docker อาจมี PATCH/deploy เขียนทับไปแล้ว
        const fresh = this.gitAppStore.findById(app.id);
        if (!fresh) continue; // app ถูกลบไประหว่างกวาด — volume โดน removeAppContainers จัดการแล้ว
        fresh.addonConnections = (fresh.addonConnections || []).filter(
          (c) => !(c.retiredAt && removedTypes.has(c.type)),
        );
        this.gitAppStore.save(fresh);
        this.logger.log(`swept retired addon volumes of ${app.id}: ${[...removedTypes].join(',')}`);
      }
    }
  }

  constructor(
    private automator: GitAutomatorService,
    private scanner: ScannerService,
    private riskEngine: RiskEngineService,
    private ticket: TicketService,
    private audit: AuditService,
    private usageCollector: UsageCollectorService,
    private gitAppStore: GitAppStore,
    private dockerRuntime: DockerRuntimeService,
    private notifications: NotificationsService,
  ) {
    fs.mkdirSync(this.stagingRoot, { recursive: true });
    fs.mkdirSync(this.deployedRoot, { recursive: true });
    fs.mkdirSync(this.quarantineRoot, { recursive: true });
  }

  /**
   * บันทึกสถานะแต่ละ pipeline stage ลง GitAppStore ให้หน้า dashboard อ่านมาแสดงได้ — เขียนกลับ
   * เฉพาะ app ที่เป็น dynamic/self-service (มีอยู่จริงใน store) เท่านั้น เพราะ app แบบ
   * static/ops-managed (configs/git-apps.json) เป็น read-only ไม่มี record ให้เขียนกลับ
   */
  persistStage(app: GitApp, key: PipelineStageKey, status: PipelineStageStatus): void {
    if (!this.gitAppStore.findById(app.id)) return;

    const stages = (app.pipelineStages?.length ? app.pipelineStages : initialPipelineStages()).map((s) =>
      s.key === key ? { ...s, status, at: new Date().toISOString() } : s,
    );
    app.pipelineStages = stages;
    app.pipelineStatus =
      status === 'failed' ? 'failed' : stages.every((s) => s.status === 'success') ? 'success' : 'deploying';
    this.gitAppStore.save(app);
  }

  resetStages(app: GitApp): void {
    app.pipelineStages = initialPipelineStages();
  }

  /**
   * บันทึก release ของ deploy ที่สำเร็จ + prune image ที่หลุด retention (เก็บ RELEASE_KEEP ตัวล่าสุด)
   * ไม่ save เอง — caller (runPipeline) save ผ่าน persistStage ถัดไปในก้อนเดียวกัน
   * keep-set รวม activeReleaseId เดิมเสมอ กันขอบเคส rollback ไป release เก่าแล้ว entry นั้น
   * หลุด slice — image ที่เพิ่งรันอยู่ก่อนหน้าจะไม่ถูก prune ทันทีในรอบเดียวกัน
   */
  private recordRelease(app: GitApp, rec: ReleaseRecord): void {
    // app แบบ static/ops-managed ไม่มี record ใน store — ไม่มีที่เก็บ history ข้ามไปเลย
    const fresh = this.gitAppStore.findById(app.id);
    if (!fresh) return;

    // อ่าน releases จาก store สดๆ กัน lost-update — ระหว่าง pipeline วิ่ง instance อื่นอาจเขียน store ไปแล้ว
    const prevActiveId = fresh.activeReleaseId;
    const releases = [rec, ...(fresh.releases ?? []).filter((r) => r.id !== rec.id)];
    const keep = new Set(releases.slice(0, RELEASE_KEEP).map((r) => r.id));
    keep.add(rec.id);
    if (prevActiveId) keep.add(prevActiveId);

    const pruned = releases.filter((r) => !keep.has(r.id));
    app.releases = releases.filter((r) => keep.has(r.id));
    app.activeReleaseId = rec.id;
    for (const r of pruned) {
      void this.dockerRuntime.removeImage(r.imageTag);
    }
  }

  private appName(app: GitApp): string {
    return app.projectName || app.repoFullName || app.id;
  }

  /**
   * แจ้งผล deploy ที่ไม่สำเร็จ (in-app เสมอ + email ตาม preference) — fire-and-forget:
   * notify() fail-soft ในตัวอยู่แล้ว การแจ้งเตือนพังต้องไม่กระทบผล pipeline
   */
  private notifyDeployFailure(
    app: GitApp,
    requestId: string,
    type: 'deploy_failed' | 'deploy_blocked',
    reason: string,
  ): void {
    const name = this.appName(app);
    void this.notifications.notify(app.accountId, {
      type,
      title: type === 'deploy_blocked' ? `Deploy ถูกบล็อก — ${name}` : `Deploy ไม่สำเร็จ — ${name}`,
      body: reason,
      meta: { appId: app.id, requestId },
      email: true,
      emailText: deployFailedEmail(name, reason).text,
    });
  }

  private notifyRollbackFailure(app: GitApp, requestId: string, reason: string): void {
    const name = this.appName(app);
    void this.notifications.notify(app.accountId, {
      type: 'rollback_failed',
      title: `Rollback ไม่สำเร็จ — ${name}`,
      body: reason,
      meta: { appId: app.id, requestId },
      email: true,
      emailText: rollbackFailedEmail(name, reason).text,
    });
  }

  /**
   * Rollback = สั่ง runContainer ด้วย image ของ release เดิมที่เก็บ tag ไว้ (ไม่ rebuild/ไม่ scan ซ้ำ
   * เพราะ artifact ตัวนี้เคยผ่านทุก gate มาแล้วตอน deploy รอบนั้น) — ใช้ blue-green swap เดิม:
   * ตัวใหม่พังตอน start = container ปัจจุบันยังรันต่อเหมือนเดิม
   * เรียกแบบ fire-and-forget จาก AppsService.rollback ให้ UI poll pipelineStages เอาเหมือน deploy ปกติ
   */
  async runRollback(app: GitApp, requestId: string, releaseId: string): Promise<void> {
    try {
      this.automator.acquireLock(app.id);
    } catch {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'rollback', decision: 'BLOCK', reason: 'deploy_in_progress' });
      throw new ConflictException('deploy_already_in_progress');
    }

    try {
      // อ่านสดใต้ lock — releases อาจเพิ่งถูกเขียนโดย deploy รอบก่อนหน้า/instance อื่น
      const fresh = this.gitAppStore.findById(app.id);
      if (!fresh) return; // app ถูกลบไประหว่างทาง
      app = fresh;
      const release = (app.releases ?? []).find((r) => r.id === releaseId);

      // stages ของรอบ rollback: 4 stage แรก success ทันที (ความหมาย: ใช้ artifact ที่ผ่าน gate
      // พวกนี้มาแล้ว) เหลือ production_deploy วิ่งจริง — UI stepper + polling เดิมใช้ได้ไม่ต้องแก้
      const now = new Date().toISOString();
      app.pipelineStages = initialPipelineStages().map((s) =>
        s.key === 'production_deploy' ? { ...s, status: 'running' as const, at: now } : { ...s, status: 'success' as const, at: now },
      );
      app.pipelineStatus = 'deploying';
      this.gitAppStore.save(app);

      if (!release || !(await this.dockerRuntime.imageExists(release.imageTag))) {
        // image หาย (ถูกลบมือ/prune นอกระบบ) — ตัด entry ที่ชี้หาผีออกจาก history ด้วยเลย
        if (release) {
          app.releases = (app.releases ?? []).filter((r) => r.id !== releaseId);
        }
        this.persistStage(app, 'production_deploy', 'failed');
        this.audit.append({ requestId, accountId: app.accountId, stage: 'rollback', decision: 'BLOCK', reason: 'rollback_image_missing' });
        this.notifyRollbackFailure(app, requestId, 'rollback_image_missing — image ของ release นี้ไม่อยู่บนเครื่องแล้ว');
        return;
      }

      // addon อาจถูก stop อยู่ (เช่นเพิ่งติ๊กกลับ) — provision ให้พร้อมก่อนเหมือน deploy ปกติ
      if (app.addons?.length) {
        const addon = await this.dockerRuntime.provisionAddons(app);
        if (!addon.ok) {
          this.persistStage(app, 'production_deploy', 'failed');
          this.audit.append({ requestId, accountId: app.accountId, stage: 'rollback', decision: 'BLOCK', reason: addon.reason });
          this.notifyRollbackFailure(app, requestId, addon.reason || 'addon_failed');
          return;
        }
        this.gitAppStore.save(app); // persist connections (encrypted)
      }

      const runResult = await this.dockerRuntime.runContainer(app, release.imageTag, release.port);
      if (!runResult.ok) {
        this.persistStage(app, 'production_deploy', 'failed');
        this.audit.append({ requestId, accountId: app.accountId, stage: 'rollback', decision: 'BLOCK', reason: runResult.reason });
        this.notifyRollbackFailure(app, requestId, runResult.reason || 'container_failed');
        return;
      }

      if (runResult.port) app.port = runResult.port;
      app.activeReleaseId = release.id;
      this.persistStage(app, 'production_deploy', 'success');
      this.audit.append({
        requestId,
        accountId: app.accountId,
        stage: 'rollback',
        decision: 'INFO',
        reason: `rollback_to:${release.id}`,
        deployResult: { imageReused: true, port: runResult.port },
      });
      void this.notifications.notify(app.accountId, {
        type: 'rollback_success',
        title: `Rollback สำเร็จ — ${this.appName(app)}`,
        body: `กลับไป release ${release.commitSha?.slice(0, 7) ?? release.id.slice(0, 8)} แล้ว`,
        meta: { appId: app.id, requestId, releaseId: release.id },
      });
    } catch (err: any) {
      this.persistStage(app, 'production_deploy', 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'rollback', decision: 'BLOCK', reason: 'internal_error_fail_closed' });
      this.notifyRollbackFailure(app, requestId, 'internal_error_fail_closed');
      this.logger.error(`rollback ${app.id} -> ${releaseId} failed: ${err.message}`);
    } finally {
      this.automator.releaseLock(app.id);
    }
  }

  /** ลบ container ของแอป + addon + image ทุก release (เรียกตอนลบ app) — best-effort ทั้งหมด */
  async cleanupContainers(app: GitApp): Promise<void> {
    await this.dockerRuntime.removeAppContainers(app);
    // image ของ release history ไม่มีใครลบให้เอง — ลบตามหลัง container (ตอนนี้ไม่มีอะไรอ้างแล้ว)
    for (const r of app.releases ?? []) {
      await this.dockerRuntime.removeImage(r.imageTag);
    }
  }

  /**
   * ลบสำเนา source ที่ promote เก็บไว้ audit/debug (data/git-deployed/<id>) ตอนแอปถูกลบ —
   * เดิมไม่มีใครลบเลย dir orphan สะสมทุกครั้งที่ลบแอป (เจอค้าง 19 dirs ตอน 2026-07-21)
   */
  cleanupDeployedDir(appId: string): void {
    fs.rmSync(path.join(this.deployedRoot, appId), { recursive: true, force: true });
  }

  /** ติดธง retired ให้ addon ที่ถูกถอด (sync — เรียก "ก่อน" save ตอน PATCH เพื่อให้ธงลง store) */
  retireUnwantedAddons(app: GitApp): void {
    this.dockerRuntime.retireUnwantedAddons(app);
  }

  /** ลบ container ของ addon ที่ถูกถอด (volume คงไว้ตาม retention) — best-effort, เรียกหลัง save */
  async cleanupUnwantedAddonContainers(app: GitApp): Promise<void> {
    await this.dockerRuntime.removeUnwantedAddonContainers(app);
  }

  async runPipeline(
    app: GitApp,
    requestId: string,
    usageFeature: string,
    acquireSource: (stagingDir: string) => Promise<void> | void,
  ): Promise<PipelineOutcome> {
    try {
      this.automator.acquireLock(app.id);
    } catch {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'deploy', decision: 'BLOCK', reason: 'deploy_in_progress' });
      throw new ConflictException('deploy_already_in_progress');
    }

    const stagingDir = path.join(this.stagingRoot, `${app.id}-${requestId}`);
    let currentStage: PipelineStageKey = 'repo_cloning';

    try {
      this.persistStage(app, 'repo_cloning', 'running');
      await acquireSource(stagingDir);
      // เก็บ SHA ตรงนี้ (ก่อน staging ถูก promote/ลบ) ไว้ลง ReleaseRecord ถ้า deploy สำเร็จ
      const commitSha = await this.automator.revParseHead(stagingDir);
      this.persistStage(app, 'repo_cloning', 'success');

      currentStage = 'security_scan';
      this.persistStage(app, 'security_scan', 'running');
      const files = this.automator.listTextFiles(stagingDir);
      let findings: Finding[] = [];
      for (const f of files) {
        findings = findings.concat(this.scanner.scanText(f.relPath, f.content));
      }
      findings = findings.concat(this.scanner.scanDependencies(files.map((f) => ({ path: f.relPath }))));

      const result = this.riskEngine.evaluate(findings);

      this.usageCollector.recordUsage({
        requestId,
        accountId: app.accountId,
        appId: app.id, // ให้ /usage ตัดสถิติของ app ที่ถูกลบไปแล้วออกได้ (event เก่าที่ไม่มี appId ไม่ถูกนับ)
        feature: usageFeature,
        allowed: result.decision === 'ALLOW',
        stage: usageFeature,
      });

      if (result.decision === 'ALLOW') {
        this.persistStage(app, 'security_scan', 'success');

        currentStage = 'app_build';
        this.persistStage(app, 'app_build', 'running');

        // provision backing service (postgres/redis) ที่ผู้ใช้ขอ ก่อน build/run — แอปมักต่อ DB ตอน boot
        // อัปเดต app.addonConnections (inject เป็น env DATABASE_URL/REDIS_URL ตอน runContainer)
        if (app.addons?.length) {
          const addon = await this.dockerRuntime.provisionAddons(app);
          if (!addon.ok) {
            this.persistStage(app, 'app_build', 'failed');
            this.audit.append({ requestId, accountId: app.accountId, stage: 'app_build', decision: 'BLOCK', reason: addon.reason });
            this.notifyDeployFailure(app, requestId, 'deploy_failed', addon.reason || 'addon_failed');
            return { decision: 'BLOCK', requestId, reason: addon.reason, score: result.score, findings: result.findings };
          }
          if (this.gitAppStore.findById(app.id)) this.gitAppStore.save(app); // persist connections (encrypted)
        }
        const buildResult = await this.dockerRuntime.buildImage(stagingDir, app, requestId);
        if (!buildResult.ok) {
          this.persistStage(app, 'app_build', 'failed');
          this.audit.append({ requestId, accountId: app.accountId, stage: 'app_build', decision: 'BLOCK', reason: buildResult.reason });
          this.notifyDeployFailure(app, requestId, 'deploy_failed', buildResult.reason || 'build_failed');
          return { decision: 'BLOCK', requestId, reason: buildResult.reason, score: result.score, findings: result.findings };
        }
        this.persistStage(app, 'app_build', 'success');

        currentStage = 'production_deploy';
        this.persistStage(app, 'production_deploy', 'running');

        // Fail-closed boundary: ต้องมี signed ticket ที่ verify ผ่านก่อนถึงจะ deploy ได้จริง
        const signed = this.ticket.sign({ request_id: requestId, account_id: app.accountId });
        try {
          this.ticket.verify(signed);
        } catch (err: any) {
          this.persistStage(app, 'production_deploy', 'failed');
          this.audit.append({ requestId, accountId: app.accountId, stage: 'deploy', decision: 'BLOCK', reason: err.message });
          return { decision: 'BLOCK', requestId, reason: 'ticket_rejected' };
        }

        const runResult = await this.dockerRuntime.runContainer(app, buildResult.imageTag!, buildResult.port);
        if (!runResult.ok) {
          this.persistStage(app, 'production_deploy', 'failed');
          this.audit.append({ requestId, accountId: app.accountId, stage: 'deploy', decision: 'BLOCK', reason: runResult.reason });
          this.notifyDeployFailure(app, requestId, 'deploy_failed', runResult.reason || 'container_failed');
          return { decision: 'BLOCK', requestId, reason: runResult.reason, score: result.score, findings: result.findings };
        }

        // จำ port ที่ container listen จริงไว้ใน store เพื่อให้ /live/<id> proxy เข้า container ถูก port
        // (มาจาก app.port ที่ผู้ใช้ระบุ, EXPOSE ใน Dockerfile, หรือ default ตาม runtime)
        if (runResult.port) app.port = runResult.port;

        // บันทึก release + prune image ที่หลุด retention — ต้องมาก่อน persistStage success
        // ข้างล่าง เพื่อให้ทั้ง stages และ releases ลง store ในการ save เดียวกัน
        this.recordRelease(app, {
          id: requestId,
          imageTag: buildResult.imageTag!,
          createdAt: new Date().toISOString(),
          sourceType: app.sourceType ?? 'git',
          commitSha,
          branch: app.branch,
          port: runResult.port,
          degraded: runResult.degraded || undefined,
        });

        // เก็บสำเนา source ที่ deploy สำเร็จล่าสุดไว้บน disk เพื่อ audit/debug (ตัว serving จริง
        // มาจาก container ผ่าน DockerRuntimeService แล้ว ไม่ได้พึ่งไฟล์ในนี้โดยตรงอีกต่อไป)
        const deployedDir = path.join(this.deployedRoot, app.id);
        this.automator.promote(stagingDir, deployedDir);
        this.persistStage(app, 'production_deploy', 'success');

        this.audit.append({
          requestId,
          accountId: app.accountId,
          stage: 'decision',
          decision: 'ALLOW',
          score: result.score,
          findings: result.findings,
          deployResult: { deployedPath: deployedDir, port: runResult.port },
        });

        // แจ้งสำเร็จแบบ in-app อย่างเดียว (เมลเฉพาะตอนพัง — success mail เป็น spam)
        void this.notifications.notify(app.accountId, {
          type: 'deploy_success',
          title: `Deploy สำเร็จ — ${this.appName(app)}`,
          body: runResult.degraded
            ? 'ขึ้นระบบแล้วแบบเฝ้าระวัง: container รันอยู่แต่ยังไม่ตอบ healthcheck'
            : 'ขึ้นระบบแล้ว',
          meta: { appId: app.id, requestId },
        });

        return { decision: 'ALLOW', requestId, score: result.score, deployedPath: deployedDir, restartOk: true };
      }

      if (result.decision === 'QUARANTINE') {
        this.persistStage(app, 'security_scan', 'failed');
        const qDir = path.join(this.quarantineRoot, `${app.id}-${requestId}`);
        fs.renameSync(stagingDir, qDir);
        this.audit.append({ requestId, accountId: app.accountId, stage: 'decision', decision: 'QUARANTINE', score: result.score, findings: result.findings });
        this.notifyDeployFailure(app, requestId, 'deploy_blocked', 'quarantine — รอตรวจสอบจากทีม SecOps');
        return { decision: 'QUARANTINE', requestId, message: 'รอตรวจสอบจากทีม SecOps', score: result.score, findings: result.findings };
      }

      // BLOCK — ปล่อยให้ finally เก็บกวาด staging ทิ้ง ไม่แตะ deployedDir เดิม (แอปเวอร์ชันก่อนหน้ายังรันอยู่)
      this.persistStage(app, 'security_scan', 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'decision', decision: 'BLOCK', score: result.score, findings: result.findings });
      this.notifyDeployFailure(app, requestId, 'deploy_blocked', 'deploy_blocked_by_security_policy');
      return { decision: 'BLOCK', requestId, reason: 'deploy_blocked_by_security_policy', score: result.score, findings: result.findings };
    } catch (err: any) {
      this.persistStage(app, currentStage, 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'fatal', decision: 'BLOCK', reason: err.message });
      // ZipExtractionError = ปัญหาที่ไฟล์ของผู้ใช้ ไม่ใช่ internal error — โชว์ข้อความจริงให้เลย
      // (ข้อความพวกนี้เราประกอบเองทั้งหมดใน zip-extract.util ไม่มี internal detail หลุด)
      // error อื่นคง fail-closed ด้วยข้อความกลางๆ เหมือนเดิม
      const reason = err instanceof ZipExtractionError ? err.message : 'internal_error_fail_closed';
      this.notifyDeployFailure(app, requestId, 'deploy_failed', reason);
      return { decision: 'BLOCK', requestId, reason };
    } finally {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      this.automator.releaseLock(app.id);
    }
  }
}
