import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { execFile } from 'child_process';
import * as path from 'path';
import { Account, CustomDomain, GitApp } from '../common/types';
import { GitAppStore } from '../apps/git-app.store';
import { AuditService } from '../audit/audit.service';
import { ROOT } from '../common/paths';
import { v4 as uuidv4 } from 'uuid';
import { domainPointsToUs, isReservedDomain, isValidDomain, normalizeDomain } from './domain.util';

const LIVE_ORIGIN_HOST = process.env.LIVE_ORIGIN_HOST || 'live.studiodup.com';
const SCRIPT_DIR = process.env.CERT_SCRIPT_DIR || path.join(ROOT, 'deployments', 'host');
const ISSUE_SCRIPT = path.join(SCRIPT_DIR, 'issue-cert.sh');
const REMOVE_SCRIPT = path.join(SCRIPT_DIR, 'remove-cert.sh');
const MAX_DOMAINS_PER_APP = Number(process.env.MAX_CUSTOM_DOMAINS_PER_APP || 5);
const CERT_TIMEOUT_MS = Number(process.env.CERT_SCRIPT_TIMEOUT_MS || 150_000);

// รัน script ออก/ลบ cert ผ่าน sudo (backend รันเป็น user dup ที่มี NOPASSWD เฉพาะ 2 script นี้)
// domain ถูก validate ด้วย DOMAIN_RE ก่อนเสมอ + ส่งเป็น arg เดียวผ่าน execFile (ไม่ผ่าน shell)
function runCertScript(script: string, domain: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile('sudo', ['-n', script, domain], { timeout: CERT_TIMEOUT_MS }, (err, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`.trim().slice(-2000);
      resolve({ ok: !err, output: output || (err ? err.message : '') });
    });
  });
}

@Injectable()
export class DomainService {
  private readonly logger = new Logger(DomainService.name);

  constructor(
    private store: GitAppStore,
    private audit: AuditService,
  ) {}

  list(appId: string, account: Account): CustomDomain[] {
    return this.getOwnedOrThrow(appId, account).customDomains ?? [];
  }

  /** เพิ่ม custom domain — เก็บสถานะ pending แล้ว trigger ออก cert แบบ background */
  add(appId: string, domainRaw: string, account: Account): CustomDomain[] {
    const app = this.getOwnedOrThrow(appId, account);
    const domain = normalizeDomain(domainRaw);
    if (!isValidDomain(domain)) throw new BadRequestException(`โดเมนไม่ถูกต้อง: "${domainRaw}"`);
    if (isReservedDomain(domain)) throw new BadRequestException('โดเมนนี้สงวนไว้สำหรับระบบ');

    const domains = app.customDomains ?? [];
    if (domains.some((d) => d.domain === domain)) throw new BadRequestException('เพิ่มโดเมนนี้ไว้แล้ว');
    if (domains.length >= MAX_DOMAINS_PER_APP) throw new BadRequestException(`เกินเพดาน ${MAX_DOMAINS_PER_APP} โดเมนต่อแอป`);
    // กันโดเมนซ้ำข้ามแอป (โดเมนหนึ่งชี้ได้ที่แอปเดียว)
    const usedElsewhere = this.store.findAll().some(
      (a) => a.id !== app.id && (a.customDomains || []).some((d) => d.domain === domain),
    );
    if (usedElsewhere) throw new BadRequestException('โดเมนนี้ถูกใช้กับแอปอื่นแล้ว');

    const cd: CustomDomain = { domain, status: 'pending', addedAt: new Date().toISOString() };
    app.customDomains = [...domains, cd];
    this.store.save(app);
    this.auditLog(account, 'domain:add', `${domain} → ${app.id}`);
    void this.issueInBackground(app.id, domain);
    return app.customDomains;
  }

  /** ลองใหม่ (verify DNS + ออก cert อีกครั้ง) สำหรับโดเมนที่ pending/error */
  verify(appId: string, domainRaw: string, account: Account): CustomDomain[] {
    const app = this.getOwnedOrThrow(appId, account);
    const domain = normalizeDomain(domainRaw);
    const cd = (app.customDomains || []).find((d) => d.domain === domain);
    if (!cd) throw new NotFoundException('ไม่พบโดเมนนี้');
    cd.status = 'pending';
    cd.lastError = undefined;
    this.store.save(app);
    void this.issueInBackground(app.id, domain);
    return app.customDomains ?? [];
  }

  /** ลบ custom domain — ลบ cert + vhost (ผ่าน script) แล้วเอาออกจาก store */
  async remove(appId: string, domainRaw: string, account: Account): Promise<CustomDomain[]> {
    const app = this.getOwnedOrThrow(appId, account);
    const domain = normalizeDomain(domainRaw);
    if (!(app.customDomains || []).some((d) => d.domain === domain)) throw new NotFoundException('ไม่พบโดเมนนี้');
    if (isValidDomain(domain)) await runCertScript(REMOVE_SCRIPT, domain);
    app.customDomains = (app.customDomains || []).filter((d) => d.domain !== domain);
    this.store.save(app);
    this.auditLog(account, 'domain:remove', `${domain} ✕ ${app.id}`);
    return app.customDomains;
  }

  private async issueInBackground(appId: string, domain: string): Promise<void> {
    const setStatus = (status: CustomDomain['status'], lastError?: string) => {
      const app = this.store.findById(appId);
      if (!app) return;
      const cd = (app.customDomains || []).find((d) => d.domain === domain);
      if (!cd) return;
      cd.status = status;
      cd.lastError = lastError;
      if (status === 'active') cd.activatedAt = new Date().toISOString();
      this.store.save(app);
    };
    try {
      const dns = await domainPointsToUs(domain, LIVE_ORIGIN_HOST);
      if (!dns.ok) {
        setStatus('error', dns.detail);
        return;
      }
      const res = await runCertScript(ISSUE_SCRIPT, domain);
      if (res.ok) {
        setStatus('active');
        this.logger.log(`custom domain active: ${domain}`);
      } else {
        setStatus('error', `ออก cert ไม่สำเร็จ: ${res.output}`.slice(0, 500));
        this.logger.warn(`custom domain ${domain} cert failed: ${res.output}`);
      }
    } catch (err: any) {
      setStatus('error', err?.message || 'issue_failed');
    }
  }

  private getOwnedOrThrow(appId: string, account: Account): GitApp {
    const app = this.store.findById(appId);
    if (!app) throw new NotFoundException(`gitapp_not_found:${appId}`);
    if (app.accountId !== account.id) throw new ForbiddenException('not_your_app');
    return app;
  }

  private auditLog(account: Account, stage: string, detail: string): void {
    this.audit.append({ requestId: uuidv4(), accountId: account.id, stage: 'custom-domain', decision: 'INFO', reason: `${stage}: ${detail}` });
  }
}
