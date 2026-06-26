import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Plugin, Account, Finding } from '../common/types';
import { PluginStore } from './plugin.store';
import { ScannerService } from '../scanner/scanner.service';
import { RiskEngineService } from '../decision/risk-engine.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditService } from '../audit/audit.service';
import { RegisterPluginDto, ProxyCallDto } from './plugin.dto';

const TICKET_SECRET = process.env.GATEKEEPER_TICKET_SECRET || 'dev-secret-change-me';

@Injectable()
export class PluginsService {
  constructor(
    private store: PluginStore,
    private scanner: ScannerService,
    private riskEngine: RiskEngineService,
    private ticket: TicketService,
    private audit: AuditService,
  ) {}

  // ── Step 1: Get Certified Core Services ──────────────────────────────────────
  getCertifiedServices() {
    return [
      {
        id: 'certified:firebase',
        name: 'Firebase',
        vendor: 'Google',
        category: 'Database / Auth',
        base_url_template: 'https://{project-id}.firebaseio.com',
        auth_type: 'bearer',
        verified: true,
        docs_url: 'https://firebase.google.com/docs/reference/rest',
        logo: 'firebase',
      },
      {
        id: 'certified:supabase',
        name: 'Supabase',
        vendor: 'Supabase Inc.',
        category: 'Database / Auth',
        base_url_template: 'https://{project-ref}.supabase.co',
        auth_type: 'api_key',
        verified: true,
        docs_url: 'https://supabase.com/docs/reference/api',
        logo: 'supabase',
      },
      {
        id: 'certified:stripe',
        name: 'Stripe',
        vendor: 'Stripe Inc.',
        category: 'Payment',
        base_url_template: 'https://api.stripe.com/v1',
        auth_type: 'bearer',
        verified: true,
        docs_url: 'https://stripe.com/docs/api',
        logo: 'stripe',
      },
      {
        id: 'certified:sendgrid',
        name: 'SendGrid',
        vendor: 'Twilio',
        category: 'Email',
        base_url_template: 'https://api.sendgrid.com/v3',
        auth_type: 'bearer',
        verified: true,
        docs_url: 'https://docs.sendgrid.com/api-reference',
        logo: 'sendgrid',
      },
      {
        id: 'certified:twilio',
        name: 'Twilio',
        vendor: 'Twilio',
        category: 'SMS / Communication',
        base_url_template: 'https://api.twilio.com/2010-04-01',
        auth_type: 'basic',
        verified: true,
        docs_url: 'https://www.twilio.com/docs/usage/api',
        logo: 'twilio',
      },
    ];
  }

  // ── Step 2: Register Custom Plugin ───────────────────────────────────────────
  async register(dto: RegisterPluginDto, account: Account): Promise<Plugin> {
    const now = new Date().toISOString();
    const plugin: Plugin = {
      id: `plugin_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
      name: dto.name,
      description: dto.description,
      base_url: dto.base_url,
      auth_type: dto.auth_type,
      auth_header: dto.auth_header,
      endpoints: dto.endpoints,
      owner_account_id: account.id,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };

    this.store.save(plugin);
    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'plugin:register',
      decision: 'INFO',
      pluginId: plugin.id,
    });

    // auto-trigger screening (async — ไม่บล็อก response)
    this.runScreening(plugin.id, account).catch(console.error);

    return plugin;
  }

  // ── Step 3: Trigger API Screening & Safety Check ──────────────────────────────
  async runScreening(pluginId: string, account: Account): Promise<Plugin> {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);

    plugin.status = 'screening';
    this.store.save(plugin);

    // สแกน base_url + endpoint paths
    let findings: Finding[] = [];
    findings = findings.concat(this.scanner.scanPluginEndpoint(plugin.base_url));
    for (const ep of plugin.endpoints) {
      findings = findings.concat(
        this.scanner.scanText(`endpoint:${ep.path}`, `${ep.method} ${ep.path} ${ep.description || ''}`),
      );
    }

    const result = this.riskEngine.evaluate(findings);
    plugin.risk_score = result.score;
    plugin.findings = result.findings;

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'plugin:screening',
      decision: result.decision,
      score: result.score,
      findings: result.findings,
      pluginId,
    });

    if (result.decision === 'BLOCK') {
      plugin.status = 'blocked';
      this.store.save(plugin);
      return plugin;
    }
    if (result.decision === 'QUARANTINE') {
      plugin.status = 'quarantine';
      this.store.save(plugin);
      return plugin;
    }

    // ALLOW → ต่อไป Step 4
    return this.generateConnectionFile(pluginId, account);
  }

  // ── Step 4: Generate Plugin Connection File ───────────────────────────────────
  async generateConnectionFile(pluginId: string, account: Account): Promise<Plugin> {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);
    plugin.status = 'generating';
    this.store.save(plugin);

    const manifest = {
      schema_version: '1.0',
      plugin_id: plugin.id,
      name: plugin.name,
      base_url: plugin.base_url,
      auth_type: plugin.auth_type,
      auth_header: plugin.auth_header || null,
      endpoints: plugin.endpoints,
      generated_at: new Date().toISOString(),
      generated_by: 'gatekeeper-v0.2',
    };
    plugin.connection_file = manifest;

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'plugin:generate_file',
      decision: 'INFO',
      pluginId,
    });

    // ต่อ Step 5 ทันที
    return this.issueSignature(pluginId, account, manifest);
  }

  // ── Step 5: Issue Plugin Code Signature ──────────────────────────────────────
  async issueSignature(pluginId: string, account: Account, manifest?: object): Promise<Plugin> {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);
    const payload = manifest || plugin.connection_file;
    if (!payload) throw new BadRequestException('no_connection_file_to_sign');

    const sig = crypto
      .createHmac('sha256', TICKET_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    plugin.signature = sig;
    plugin.status = 'active';
    plugin.last_verified_at = new Date().toISOString();
    this.store.save(plugin);

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'plugin:sign',
      decision: 'ALLOW',
      pluginId,
    });

    return plugin;
  }

  // ── Step 6: Verify Deployed Code Integrity ────────────────────────────────────
  verifyIntegrity(pluginId: string, account: Account): { ok: boolean; reason?: string } {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);
    if (!plugin.connection_file || !plugin.signature) {
      return { ok: false, reason: 'no_signature_or_manifest' };
    }

    const expected = crypto
      .createHmac('sha256', TICKET_SECRET)
      .update(JSON.stringify(plugin.connection_file))
      .digest('hex');

    const ok = crypto.timingSafeEqual(
      Buffer.from(plugin.signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'plugin:verify_integrity',
      decision: ok ? 'ALLOW' : 'BLOCK',
      reason: ok ? undefined : 'signature_mismatch',
      pluginId,
    });

    if (!ok) {
      // auto-revoke ถ้า signature ไม่ตรง
      plugin.status = 'revoked';
      this.store.save(plugin);
    }

    return { ok, reason: ok ? undefined : 'signature_mismatch' };
  }

  // ── Step 7: Test Handshake Connectivity ──────────────────────────────────────
  async testHandshake(pluginId: string, account: Account): Promise<{ ok: boolean; latency_ms?: number; error?: string }> {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);
    if (plugin.status !== 'active') {
      return { ok: false, error: `plugin_not_active:${plugin.status}` };
    }

    const start = Date.now();
    try {
      // ยิง HEAD ไปที่ base_url เพื่อเช็ค connectivity
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(plugin.base_url, {
        method: 'HEAD',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const latency_ms = Date.now() - start;
      plugin.last_handshake_at = new Date().toISOString();
      this.store.save(plugin);

      this.audit.append({
        requestId: uuidv4(),
        accountId: account.id,
        stage: 'plugin:handshake',
        decision: res.ok || res.status < 500 ? 'ALLOW' : 'BLOCK',
        reason: `http_${res.status}`,
        pluginId,
      });

      return { ok: res.ok || res.status < 500, latency_ms };
    } catch (err: any) {
      const latency_ms = Date.now() - start;
      this.audit.append({
        requestId: uuidv4(),
        accountId: account.id,
        stage: 'plugin:handshake',
        decision: 'BLOCK',
        reason: err.message,
        pluginId,
      });
      return { ok: false, latency_ms, error: err.message };
    }
  }

  // ── Step 8: Execute Secure Proxy Call ────────────────────────────────────────
  async proxyCall(pluginId: string, account: Account, dto: ProxyCallDto): Promise<{ ok: boolean; status?: number; data?: any; error?: string }> {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);

    // verify integrity ก่อน proxy ทุกครั้ง (fail-closed)
    const integrity = this.verifyIntegrity(pluginId, account);
    if (!integrity.ok) {
      return { ok: false, error: `proxy_rejected:${integrity.reason}` };
    }

    if (plugin.status !== 'active') {
      return { ok: false, error: `plugin_not_active:${plugin.status}` };
    }

    // ตรวจว่า endpoint path อยู่ใน whitelist ที่ลงทะเบียนไว้
    const allowedPaths = plugin.endpoints.map((e) => e.path);
    if (!allowedPaths.includes(dto.endpoint_path)) {
      this.audit.append({
        requestId: uuidv4(),
        accountId: account.id,
        stage: 'plugin:proxy',
        decision: 'BLOCK',
        reason: `endpoint_not_whitelisted:${dto.endpoint_path}`,
        pluginId,
      });
      return { ok: false, error: `endpoint_not_whitelisted:${dto.endpoint_path}` };
    }

    try {
      const url = plugin.base_url.replace(/\/$/, '') + dto.endpoint_path;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Gatekeeper-Plugin-Id': pluginId,
        ...dto.headers,
      };

      // ใส่ credential ถ้ามี (credential ส่งมาจาก client ไม่ได้ store ใน plugin)
      if (dto.credential) {
        const headerName = plugin.auth_header || 'Authorization';
        headers[headerName] =
          plugin.auth_type === 'bearer' ? `Bearer ${dto.credential}` : dto.credential;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: dto.method,
        headers,
        body: dto.body ? JSON.stringify(dto.body) : undefined,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      let data: any;
      const ct = res.headers.get('content-type') || '';
      data = ct.includes('application/json') ? await res.json() : await res.text();

      this.audit.append({
        requestId: uuidv4(),
        accountId: account.id,
        stage: 'plugin:proxy',
        decision: 'ALLOW',
        reason: `http_${res.status}`,
        pluginId,
      });

      return { ok: res.ok, status: res.status, data };
    } catch (err: any) {
      this.audit.append({
        requestId: uuidv4(),
        accountId: account.id,
        stage: 'plugin:proxy',
        decision: 'BLOCK',
        reason: err.message,
        pluginId,
      });
      return { ok: false, error: err.message };
    }
  }

  // ── Step 9: Revoke / Block Plugin Access ─────────────────────────────────────
  revoke(pluginId: string, account: Account): Plugin {
    const plugin = this.getOwnedOrThrow(pluginId, account.id);
    plugin.status = 'revoked';
    plugin.signature = undefined;
    plugin.connection_file = undefined;
    this.store.save(plugin);

    this.audit.append({
      requestId: uuidv4(),
      accountId: account.id,
      stage: 'plugin:revoke',
      decision: 'BLOCK',
      reason: 'manual_revoke',
      pluginId,
    });

    return plugin;
  }

  // ── Step 10: Fetch Verification & Audit Logs ─────────────────────────────────
  getAuditLogs(pluginId: string, account: Account) {
    this.getOwnedOrThrow(pluginId, account.id);
    return this.audit.readByPlugin(pluginId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  getAll(account: Account): Plugin[] {
    return this.store.findAll(account.id);
  }

  getOne(pluginId: string, account: Account): Plugin {
    return this.getOwnedOrThrow(pluginId, account.id);
  }

  private getOwnedOrThrow(pluginId: string, accountId: string): Plugin {
    const plugin = this.store.findById(pluginId);
    if (!plugin) throw new NotFoundException(`plugin_not_found:${pluginId}`);
    if (plugin.owner_account_id !== accountId) throw new ForbiddenException('not_your_plugin');
    return plugin;
  }
}
