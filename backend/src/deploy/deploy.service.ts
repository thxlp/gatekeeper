import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Account } from '../common/types';
import { ScannerService } from '../scanner/scanner.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { UsageCollectorService } from '../entitlement/usage-collector.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { DATA_DIR } from '../common/paths';

export interface DeployFile {
  path: string;
  content_base64: string;
}

export interface DeployDto {
  runtime?: string;
  feature?: string;
  files: DeployFile[];
}

@Injectable()
export class DeployService {
  private stagingRoot = path.join(DATA_DIR, 'staging');
  private deployedRoot = path.join(DATA_DIR, 'deployed');
  private quarantineRoot = path.join(DATA_DIR, 'quarantine');

  constructor(
    private scanner: ScannerService,
    private riskEngine: RiskEngineService,
    private entitlement: EntitlementService,
    private usageCollector: UsageCollectorService,
    private ticket: TicketService,
    private audit: AuditService,
  ) {
    fs.mkdirSync(this.stagingRoot, { recursive: true });
    fs.mkdirSync(this.deployedRoot, { recursive: true });
    fs.mkdirSync(this.quarantineRoot, { recursive: true });
  }

  async handleDeploy(dto: DeployDto, account: Account) {
    const requestId = uuidv4();
    let stagingDir: string | null = null;

    try {
      const { runtime, feature, files } = dto;

      if (!Array.isArray(files) || files.length === 0) {
        this.audit.append({ requestId, accountId: account.id, stage: 'validate', decision: 'BLOCK', reason: 'no_files' });
        return { decision: 'BLOCK', requestId, reason: 'no_files_in_payload' };
      }

      const totalBytes = files.reduce((s, f) => s + Buffer.byteLength(f.content_base64 || '', 'base64'), 0);
      const artifactSizeMb = totalBytes / (1024 * 1024);

      // Stage 2: Entitlement
      const ent = this.entitlement.check(account, { runtime, feature, artifactSizeMb, requestId });
      if (!ent.allowed) {
        this.audit.append({ requestId, accountId: account.id, stage: 'entitlement', decision: 'BLOCK', reason: ent.reason });
        return { decision: 'BLOCK', requestId, reason: ent.reason };
      }

      // Stage 3: Write staging + scan
      stagingDir = path.join(this.stagingRoot, requestId);
      fs.mkdirSync(stagingDir, { recursive: true });

      const writtenFiles: { path: string; textContent: string }[] = [];
      for (const f of files) {
        const safeRel = path.normalize(f.path || '').replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
        if (!safeRel) continue;
        const fullPath = path.join(stagingDir, safeRel);
        if (!fullPath.startsWith(stagingDir)) continue;
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const content = Buffer.from(f.content_base64 || '', 'base64');
        fs.writeFileSync(fullPath, content);
        writtenFiles.push({ path: safeRel, textContent: content.toString('utf8') });
      }

      let findings = [];
      for (const wf of writtenFiles) {
        findings = findings.concat(this.scanner.scanText(wf.path, wf.textContent));
      }
      findings = findings.concat(this.scanner.scanDependencies(writtenFiles));

      // Stage 4: Risk decision
      const result = this.riskEngine.evaluate(findings);

      if (result.decision === 'ALLOW') {
        const signed = this.ticket.sign({ request_id: requestId, account_id: account.id });
        try {
          this.ticket.verify(signed);
        } catch (err: any) {
          const reason = err?.message || 'ticket_rejected';
          this.audit.append({ requestId, accountId: account.id, stage: 'deploy', decision: 'BLOCK', reason });
          return { decision: 'BLOCK', requestId, reason };
        }

        // Stage 5: Deploy (copy to deployed dir — fail-closed boundary via signed ticket)
        // TODO (production): docker build at this point
        // TODO (production): kubectl apply / k8s rollout at this point
        // TODO (production): systemctl restart at this point
        const deployedPath = path.join(this.deployedRoot, requestId);
        fs.mkdirSync(deployedPath, { recursive: true });
        fs.cpSync(stagingDir, deployedPath, { recursive: true });
        fs.rmSync(stagingDir, { recursive: true, force: true });
        stagingDir = null;

        this.usageCollector.recordUsage({
          requestId,
          accountId: account.id,
          plan: account.plan,
          feature,
          runtime,
          allowed: true,
          stage: 'deploy',
        });

        this.audit.append({ requestId, accountId: account.id, stage: 'decision', decision: 'ALLOW', score: result.score, findings: result.findings, deployResult: { deployedPath } });
        return { decision: 'ALLOW', requestId, score: result.score, deployedPath };
      }

      if (result.decision === 'QUARANTINE') {
        const qDir = path.join(this.quarantineRoot, requestId);
        fs.renameSync(stagingDir, qDir);
        stagingDir = null;
        this.audit.append({ requestId, accountId: account.id, stage: 'decision', decision: 'QUARANTINE', score: result.score, findings: result.findings });
        return { decision: 'QUARANTINE', requestId, message: 'รอตรวจสอบจากทีม SecOps', score: result.score, findings: result.findings };
      }

      // BLOCK
      this.audit.append({ requestId, accountId: account.id, stage: 'decision', decision: 'BLOCK', score: result.score, findings: result.findings });
      return { decision: 'BLOCK', requestId, reason: 'deploy_blocked_by_security_policy', score: result.score, findings: result.findings };

    } catch (err: any) {
      this.audit.append({ requestId, stage: 'fatal', decision: 'BLOCK', reason: err.message });
      return { decision: 'BLOCK', requestId, reason: 'internal_error_fail_closed' };
    } finally {
      if (stagingDir && fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    }
  }
}
