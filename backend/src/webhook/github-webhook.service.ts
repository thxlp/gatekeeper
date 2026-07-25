import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GitAppRegistryService } from './git-app-registry.service';
import { GitAutomatorService } from './git-automator.service';
import { AuditService } from '../audit/audit.service';
import { DeployPipelineService } from '../deploy/deploy-pipeline.service';
import { GithubTokenStore } from '../github/github-token.store';
import { GitAppStore } from '../apps/git-app.store';
import { GitProvider } from '../common/types';
import { parseWebhook, verifyWebhook } from './providers';

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private registry: GitAppRegistryService,
    private automator: GitAutomatorService,
    private audit: AuditService,
    private deployPipeline: DeployPipelineService,
    private githubTokens: GithubTokenStore,
    private store: GitAppStore,
  ) {}

  /**
   * จัดการ webhook จาก git provider (github/gitlab/bitbucket) — normalize payload เป็น ParsedPush
   * แล้วเดินเส้นเดียวกันทุก provider: หา app → verify → เช็ค branch + autoDeploy → วิ่ง pipeline
   */
  async handleWebhook(
    provider: GitProvider,
    rawBody: Buffer,
    headers: Record<string, any>,
    payload: any,
    query: Record<string, any> = {},
  ) {
    const requestId = uuidv4();
    const parsed = parseWebhook(provider, headers, payload);

    if (parsed.event === 'ping') return { ok: true, pong: true };
    if (parsed.event !== 'push') return { ok: true, ignored: true, reason: 'event_not_supported' };

    const repoFullName = parsed.repoFullName;
    if (typeof repoFullName !== 'string' || !repoFullName) {
      this.audit.append({ requestId, stage: 'webhook', decision: 'BLOCK', reason: `missing_repo:${provider}` });
      throw new UnauthorizedException('unrecognized_source');
    }

    // หา config ที่ลงทะเบียนไว้ล่วงหน้า (ไม่มี dynamic registration ผ่าน payload) — provider ต้องตรงด้วย
    const app = this.registry.findByRepo(repoFullName);
    const secret = app && this.registry.getWebhookSecret(app);

    // ตอบ 401 เหมือนกันไม่ว่า "repo ไม่รู้จัก"/"provider ไม่ตรง"/"signature ผิด" — กัน enumerate repo
    if (!app || !secret || (app.provider || 'github') !== provider) {
      this.audit.append({
        requestId,
        stage: 'webhook',
        decision: 'BLOCK',
        reason: `unregistered_or_unconfigured:${provider}:${repoFullName}`,
      });
      throw new UnauthorizedException('unrecognized_source');
    }

    if (!verifyWebhook(provider, rawBody, headers, query, secret)) {
      this.deployPipeline.resetStages(app);
      this.deployPipeline.persistStage(app, 'payload_verification', 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'BLOCK', reason: 'bad_signature' });
      throw new UnauthorizedException('invalid_signature');
    }

    this.deployPipeline.resetStages(app);
    this.deployPipeline.persistStage(app, 'payload_verification', 'success');

    if (parsed.deleted || parsed.ref !== `refs/heads/${app.branch}`) {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'INFO', reason: `push_ignored:${parsed.ref}` });
      return { ok: true, ignored: true, reason: 'branch_not_watched' };
    }

    // toggle auto-deploy ต่อแอป — ปิดไว้ = รับ push แต่ไม่ deploy (คนกด Deploy เองทีหลังได้)
    if (app.autoDeploy === false) {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'INFO', reason: 'auto_deploy_disabled' });
      return { ok: true, ignored: true, reason: 'auto_deploy_disabled' };
    }

    // บันทึกเวลา auto-deploy ล่าสุด (เฉพาะ app แบบ dynamic ที่อยู่ใน store — static ops-managed ข้าม)
    if (this.store.findById(app.id)) {
      app.lastAutoDeployAt = new Date().toISOString();
      this.store.save(app);
    }

    // token ใช้ตอน clone private repo — ตอนนี้รองรับเฉพาะ github (gitlab/bitbucket private = follow-up)
    const token = provider === 'github' && app.accountId ? this.githubTokens.get(app.accountId)?.token : undefined;
    return this.deployPipeline.runPipeline(app, requestId, 'git-auto-deploy', (stagingDir) =>
      this.automator.cloneShallow(app, stagingDir, token),
    );
  }
}
