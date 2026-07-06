import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';

const GITHUB_API = 'https://api.github.com';
const API_TIMEOUT_MS = 15_000;

export interface GithubUser {
  username: string;
  scopes: string[];
}

export interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

/**
 * ตัวห่อ GitHub REST API เดียวที่โค้ดฝั่งเราใช้ — ทุก call ใช้ token ของ user (ไม่มี token กลาง
 * ของระบบ) และจำกัดอยู่แค่ endpoint ที่ต้องใช้กับ flow "เลือก repo → ตั้ง webhook อัตโนมัติ" เท่านั้น
 */
@Injectable()
export class GithubApiService {
  private readonly logger = new Logger(GithubApiService.name);

  private async request(token: string, method: string, apiPath: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${GITHUB_API}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'gatekeeper-deploy',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    return res;
  }

  /** ตรวจว่า token ใช้งานได้จริง + คืน username และ scope ที่ token นี้มี */
  async validateToken(token: string): Promise<GithubUser> {
    let res: Response;
    try {
      res = await this.request(token, 'GET', '/user');
    } catch (err: any) {
      this.logger.warn(`github /user unreachable: ${err.message}`);
      throw new BadGatewayException('github_unreachable');
    }
    if (res.status === 401) throw new BadRequestException('github_token_invalid');
    if (!res.ok) throw new BadGatewayException(`github_error:${res.status}`);

    const scopes = (res.headers.get('x-oauth-scopes') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const user = await res.json();
    return { username: user.login, scopes };
  }

  /** repo ที่ user เข้าถึงได้ เรียงตามที่ push ล่าสุด (พอสำหรับ picker — ไม่ paginate ทั้งบัญชี) */
  async listRepos(token: string): Promise<GithubRepo[]> {
    const res = await this.request(token, 'GET', '/user/repos?sort=pushed&per_page=100');
    if (!res.ok) throw new BadGatewayException(`github_list_repos_failed:${res.status}`);
    const repos = await res.json();
    return (repos as any[]).map((r) => ({
      fullName: r.full_name,
      name: r.name,
      owner: r.owner?.login,
      private: !!r.private,
      defaultBranch: r.default_branch,
      description: r.description ?? null,
      updatedAt: r.pushed_at || r.updated_at,
    }));
  }

  async listBranches(token: string, owner: string, repo: string): Promise<string[]> {
    const res = await this.request(
      token,
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
    );
    if (res.status === 404) throw new BadRequestException('github_repo_not_found');
    if (!res.ok) throw new BadGatewayException(`github_list_branches_failed:${res.status}`);
    const branches = await res.json();
    return (branches as any[]).map((b) => b.name);
  }

  /** ยืนยันว่า token เข้าถึง repo นี้ได้จริงก่อนลงทะเบียน + เอา default branch มาใช้เป็นค่า default */
  async getRepo(token: string, owner: string, repo: string): Promise<GithubRepo> {
    const res = await this.request(token, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    if (res.status === 404) throw new BadRequestException('github_repo_not_found_or_no_access');
    if (!res.ok) throw new BadGatewayException(`github_get_repo_failed:${res.status}`);
    const r = await res.json();
    return {
      fullName: r.full_name,
      name: r.name,
      owner: r.owner?.login,
      private: !!r.private,
      defaultBranch: r.default_branch,
      description: r.description ?? null,
      updatedAt: r.pushed_at || r.updated_at,
    };
  }

  /**
   * สร้าง push webhook ชี้กลับมาที่ gatekeeper ให้อัตโนมัติ — ถ้ามี hook ที่ชี้ URL เดียวกันอยู่แล้ว
   * (GitHub ตอบ 422 "Hook already exists") จะอัปเดต secret ของ hook เดิมแทน เพื่อให้ secret
   * ที่เก็บฝั่งเรากับฝั่ง GitHub ตรงกันเสมอ
   */
  async createOrUpdatePushWebhook(
    token: string,
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string,
  ): Promise<number> {
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`;
    const config = { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '0' };

    const res = await this.request(token, 'POST', base, {
      name: 'web',
      active: true,
      events: ['push'],
      config,
    });
    if (res.ok) {
      const hook = await res.json();
      return hook.id;
    }

    if (res.status === 422) {
      // hook เดิมมีอยู่แล้ว — หา hook ที่ URL ตรงกันแล้วอัปเดต secret ทับ
      const listRes = await this.request(token, 'GET', `${base}?per_page=100`);
      if (listRes.ok) {
        const hooks = (await listRes.json()) as any[];
        const existing = hooks.find((h) => h.config?.url === webhookUrl);
        if (existing) {
          const patchRes = await this.request(token, 'PATCH', `${base}/${existing.id}`, {
            active: true,
            events: ['push'],
            config,
          });
          if (patchRes.ok) return existing.id;
        }
      }
    }

    if (res.status === 404) {
      // GitHub ตอบ 404 ทั้งกรณี repo ไม่มีจริงและ token ไม่มีสิทธิ์จัดการ hook (admin/scope ไม่พอ)
      throw new BadRequestException('github_webhook_forbidden_or_not_found — ต้องเป็น admin ของ repo และ token มี scope repo หรือ admin:repo_hook');
    }
    const detail = await res.text().catch(() => '');
    this.logger.warn(`create webhook failed ${res.status}: ${detail.slice(0, 300)}`);
    throw new BadGatewayException(`github_create_webhook_failed:${res.status}`);
  }

  /** ลบ hook ตอน user ลบ app — best-effort เท่านั้น (token อาจถูก revoke ไปแล้วก็ไม่เป็นไร) */
  async deleteWebhook(token: string, owner: string, repo: string, hookId: number): Promise<void> {
    try {
      await this.request(
        token,
        'DELETE',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
      );
    } catch (err: any) {
      this.logger.warn(`delete webhook ${owner}/${repo}#${hookId} failed: ${err.message}`);
    }
  }
}
