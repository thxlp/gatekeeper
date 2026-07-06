import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GitAppRegistryService } from './git-app-registry.service';
import { GitAutomatorService } from './git-automator.service';
import { AuditService } from '../audit/audit.service';
import { DeployPipelineService } from '../deploy/deploy-pipeline.service';
import { GithubTokenStore } from '../github/github-token.store';
import { isValidGithubSignature } from './webhook-signature.util';

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private registry: GitAppRegistryService,
    private automator: GitAutomatorService,
    private audit: AuditService,
    private deployPipeline: DeployPipelineService,
    private githubTokens: GithubTokenStore,
  ) {}

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
      this.deployPipeline.resetStages(app);
      this.deployPipeline.persistStage(app, 'payload_verification', 'failed');
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'BLOCK', reason: 'bad_signature' });
      throw new UnauthorizedException('invalid_signature');
    }

    // signature ผ่าน — เริ่มรอบ pipeline ใหม่ รีเซ็ตสถานะทุก stage ก่อนแล้วค่อย mark stage แรกว่าผ่าน
    this.deployPipeline.resetStages(app);
    this.deployPipeline.persistStage(app, 'payload_verification', 'success');

    if (payload.deleted || payload.ref !== `refs/heads/${app.branch}`) {
      this.audit.append({ requestId, accountId: app.accountId, stage: 'webhook', decision: 'INFO', reason: `push_ignored:${payload.ref}` });
      return { ok: true, ignored: true, reason: 'branch_not_watched' };
    }

    // ถ้าเจ้าของ app เชื่อม GitHub token ไว้ ใช้ตอน clone ด้วย — จำเป็นกับ private repo
    // (public repo มี token ติดไปก็ไม่เสียอะไร)
    const token = app.accountId ? this.githubTokens.get(app.accountId)?.token : undefined;
    return this.deployPipeline.runPipeline(app, requestId, 'git-auto-deploy', (stagingDir) =>
      this.automator.cloneShallow(app, stagingDir, token),
    );
  }
}
