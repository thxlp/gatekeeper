import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Finding, GitApp, PipelineStageKey, PipelineStageStatus } from '../common/types';
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

  /** ลบ container ของแอป + addon (เรียกตอนลบ app) — best-effort ผ่าน DockerRuntimeService */
  async cleanupContainers(app: GitApp): Promise<void> {
    await this.dockerRuntime.removeAppContainers(app);
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
            return { decision: 'BLOCK', requestId, reason: addon.reason, score: result.score, findings: result.findings };
          }
          if (this.gitAppStore.findById(app.id)) this.gitAppStore.save(app); // persist connections (encrypted)
        }
        const buildResult = await this.dockerRuntime.buildImage(stagingDir, app, requestId);
        if (!buildResult.ok) {
          this.persistStage(app, 'app_build', 'failed');
          this.audit.append({ requestId, accountId: app.accountId, stage: 'app_build', decision: 'BLOCK', reason: buildResult.reason });
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
          return { decision: 'BLOCK', requestId, reason: runResult.reason, score: result.score, findings: result.findings };
        }

        // จำ port ที่ container listen จริงไว้ใน store เพื่อให้ /live/<id> proxy เข้า container ถูก port
        // (มาจาก app.port ที่ผู้ใช้ระบุ, EXPOSE ใน Dockerfile, หรือ default ตาม runtime)
        if (runResult.port) app.port = runResult.port;

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

        return { decision: 'ALLOW', requestId, score: result.score, deployedPath: deployedDir, restartOk: true };
      }

      if (result.decision === 'QUARANTINE') {
        this.persistStage(app, 'security_scan', 'failed');
        const qDir = path.join(this.quarantineRoot, `${app.id}-${requestId}`);
        fs.renameSync(stagingDir, qDir);
        this.audit.append({ requestId, accountId: app.accountId, stage: 'decision', decision: 'QUARANTINE', score: result.score, findings: result.findings });
        return { decision: 'QUARANTINE', requestId, message: 'รอตรวจสอบจากทีม SecOps', score: result.score, findings: result.findings };
      }

      // BLOCK — ปล่อยให้ finally เก็บกวาด staging ทิ้ง ไม่แตะ deployedDir เดิม (แอปเวอร์ชันก่อนหน้ายังรันอยู่)
      this.persistStage(app, 'security_scan', 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'decision', decision: 'BLOCK', score: result.score, findings: result.findings });
      return { decision: 'BLOCK', requestId, reason: 'deploy_blocked_by_security_policy', score: result.score, findings: result.findings };
    } catch (err: any) {
      this.persistStage(app, currentStage, 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'fatal', decision: 'BLOCK', reason: err.message });
      // ZipExtractionError = ปัญหาที่ไฟล์ของผู้ใช้ ไม่ใช่ internal error — โชว์ข้อความจริงให้เลย
      // (ข้อความพวกนี้เราประกอบเองทั้งหมดใน zip-extract.util ไม่มี internal detail หลุด)
      // error อื่นคง fail-closed ด้วยข้อความกลางๆ เหมือนเดิม
      const reason = err instanceof ZipExtractionError ? err.message : 'internal_error_fail_closed';
      return { decision: 'BLOCK', requestId, reason };
    } finally {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      this.automator.releaseLock(app.id);
    }
  }
}
