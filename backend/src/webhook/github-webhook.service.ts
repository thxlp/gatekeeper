import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Finding, GitApp, PipelineStageKey, PipelineStageStatus } from '../common/types';
import { DATA_DIR } from '../common/paths';
import { ScannerService } from '../scanner/scanner.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { UsageCollectorService } from '../entitlement/usage-collector.service';
import { GitAppRegistryService } from './git-app-registry.service';
import { GitAutomatorService } from './git-automator.service';
import { GitAppStore } from '../apps/git-app.store';
import { isValidGithubSignature } from './webhook-signature.util';
import { initialPipelineStages } from '../common/pipeline.util';

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);
  private stagingRoot = path.join(DATA_DIR, 'git-staging');
  private deployedRoot = path.join(DATA_DIR, 'git-deployed');
  private quarantineRoot = path.join(DATA_DIR, 'git-quarantine');

  constructor(
    private registry: GitAppRegistryService,
    private automator: GitAutomatorService,
    private scanner: ScannerService,
    private riskEngine: RiskEngineService,
    private ticket: TicketService,
    private audit: AuditService,
    private usageCollector: UsageCollectorService,
    private gitAppStore: GitAppStore,
  ) {
    fs.mkdirSync(this.stagingRoot, { recursive: true });
    fs.mkdirSync(this.deployedRoot, { recursive: true });
    fs.mkdirSync(this.quarantineRoot, { recursive: true });
  }

  /**
   * บันทึกสถานะแต่ละ pipeline stage ลง GitAppStore ให้หน้า dashboard (GET .../webhooks/github?app=)
   * อ่านมาแสดงได้ — เขียนกลับเฉพาะ app ที่เป็น dynamic/self-service (มีอยู่จริงใน store) เท่านั้น
   * เพราะ app แบบ static/ops-managed (configs/git-apps.json) เป็น read-only ไม่มี record ให้เขียนกลับ
   */
  private persistStage(app: GitApp, key: PipelineStageKey, status: PipelineStageStatus): void {
    if (!this.gitAppStore.findById(app.id)) return;

    const stages = (app.pipelineStages?.length ? app.pipelineStages : initialPipelineStages()).map((s) =>
      s.key === key ? { ...s, status, at: new Date().toISOString() } : s,
    );
    app.pipelineStages = stages;
    app.pipelineStatus =
      status === 'failed' ? 'failed' : stages.every((s) => s.status === 'success') ? 'success' : 'deploying';
    this.gitAppStore.save(app);
  }

  async handleWebhook(rawBody: Buffer, headers: Record<string, string>, payload: any) {
    const requestId = uuidv4();
    const event = headers['x-github-event'];

    if (event === 'ping') {
      return { ok: true, pong: true };
    }

    if (event !== 'push') {
      return { ok: true, ignored: true, reason: `event_not_supported:${event}` };
    }

    const repoFullName = payload?.repository?.full_name;
    if (typeof repoFullName !== 'string' || !repoFullName) {
      this.audit.append({ requestId, stage: 'webhook', decision: 'BLOCK', reason: 'missing_repository_full_name' });
      throw new UnauthorizedException('unrecognized_source');
    }

    // หา config ที่ลงทะเบียนไว้ล่วงหน้าก่อนเสมอ — ไม่มี dynamic registration ผ่าน payload
    const app = this.registry.findByRepo(repoFullName);
    const secret = app && this.registry.getWebhookSecret(app);

    // ตอบ 401 แบบเดียวกันไม่ว่าจะเป็น "repo ไม่รู้จัก" หรือ "signature ผิด"
    // กันไม่ให้ผู้โจมตีที่ยังไม่ผ่านการยืนยันตัวตน enumerate รายชื่อ repo ที่ลงทะเบียนไว้
    if (!app || !secret) {
      this.audit.append({ requestId, stage: 'webhook', decision: 'BLOCK', reason: `unregistered_or_unconfigured:${repoFullName}` });
      throw new UnauthorizedException('unrecognized_source');
    }

    const signatureHeader = headers['x-hub-signature-256'];
    if (!isValidGithubSignature(rawBody, signatureHeader, secret)) {
      app.pipelineStages = initialPipelineStages();
      this.persistStage(app, 'payload_verification', 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'BLOCK', reason: 'bad_signature' });
      throw new UnauthorizedException('invalid_signature');
    }

    // signature ผ่าน — เริ่มรอบ pipeline ใหม่ รีเซ็ตสถานะทุก stage ก่อนแล้วค่อย mark stage แรกว่าผ่าน
    app.pipelineStages = initialPipelineStages();
    this.persistStage(app, 'payload_verification', 'success');

    if (payload.deleted || payload.ref !== `refs/heads/${app.branch}`) {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'INFO', reason: `push_ignored:${payload.ref}` });
      return { ok: true, ignored: true, reason: 'branch_not_watched' };
    }

    try {
      this.automator.acquireLock(app.id);
    } catch {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'BLOCK', reason: 'deploy_in_progress' });
      throw new ConflictException('deploy_already_in_progress');
    }

    const stagingDir = path.join(this.stagingRoot, `${app.id}-${requestId}`);
    let currentStage: PipelineStageKey = 'repo_cloning';

    try {
      this.persistStage(app, 'repo_cloning', 'running');
      await this.automator.cloneShallow(app, stagingDir);
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
        feature: 'git-auto-deploy',
        allowed: result.decision === 'ALLOW',
        stage: 'webhook-deploy',
      });

      if (result.decision === 'ALLOW') {
        this.persistStage(app, 'security_scan', 'success');

        // หมายเหตุ: ยังไม่มี build step จริง (เช่น npm run build ต่อ runtime) — ระบบยังไม่รองรับ
        // การรันคำสั่ง build เอง (ยังไม่ได้ตัดสินใจเรื่อง sandbox/security ของการรัน build command
        // ที่มาจาก repo ลูกค้า) ถือเป็น pass-through ไปก่อน รอ infra ส่วนนี้ในอนาคต
        currentStage = 'app_build';
        this.persistStage(app, 'app_build', 'running');
        this.persistStage(app, 'app_build', 'success');

        currentStage = 'production_deploy';
        this.persistStage(app, 'production_deploy', 'running');

        // Fail-closed boundary เดียวกับ DeployService: ต้องมี signed ticket ที่ verify ผ่านก่อนถึงจะ deploy ได้จริง
        const signed = this.ticket.sign({ request_id: requestId, account_id: app.accountId });
        try {
          this.ticket.verify(signed);
        } catch (err: any) {
          this.persistStage(app, 'production_deploy', 'failed');
          this.audit.append({ requestId, accountId: app.accountId, stage: 'deploy', decision: 'BLOCK', reason: err.message });
          return { decision: 'BLOCK', requestId, reason: 'ticket_rejected' };
        }

        const deployedDir = path.join(this.deployedRoot, app.id);
        this.automator.promote(stagingDir, deployedDir);

        let restartOk = true;
        let restartError: string | undefined;
        try {
          await this.automator.runRestartCommand(app, deployedDir);
        } catch (err: any) {
          restartOk = false;
          restartError = err.message;
          this.logger.error(`restart command failed for ${app.id}: ${err.message}`);
        }
        this.persistStage(app, 'production_deploy', restartOk ? 'success' : 'failed');

        this.audit.append({
          requestId,
          accountId: app.accountId,
          stage: 'decision',
          decision: 'ALLOW',
          score: result.score,
          findings: result.findings,
          deployResult: { deployedPath: deployedDir, restartOk, restartError },
        });

        return { decision: 'ALLOW', requestId, score: result.score, deployedPath: deployedDir, restartOk };
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
      return { decision: 'BLOCK', requestId, reason: 'internal_error_fail_closed' };
    } finally {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      this.automator.releaseLock(app.id);
    }
  }
}
