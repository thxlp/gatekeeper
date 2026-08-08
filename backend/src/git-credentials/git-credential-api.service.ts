import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { CredentialProvider } from './git-credential.store';

const API_TIMEOUT_MS = 15_000;

// host คงที่เท่านั้น (เหตุผล SSRF เดียวกับ allowlist ใน git-url.util) — ไม่รับ self-hosted
const PROVIDER_API: Record<CredentialProvider, string> = {
  gitlab: 'https://gitlab.com/api/v4/user',
  bitbucket: 'https://api.bitbucket.org/2.0/user',
};

export interface VerifiedCredential {
  /** username ที่ provider ยืนยันกลับมา — เก็บลง store เพื่อใช้ทำ Basic auth ตอน clone */
  username: string;
}

/**
 * ตรวจ credential ของ GitLab/Bitbucket ว่าใช้ได้จริงก่อนเก็บลง store
 * (กันเก็บ token ผิดไว้แล้วไปพังตอน deploy ซึ่ง debug ยากกว่ามาก)
 *
 * ต่างจาก GitHub ตรงที่ไม่มี OAuth flow — ผู้ใช้สร้าง token เองแล้ว paste เข้ามา:
 * - GitLab: Personal Access Token scope `read_repository` (ส่งผ่าน header PRIVATE-TOKEN)
 * - Bitbucket: App password สิทธิ์ Repositories:Read (Basic auth คู่กับ username จริง)
 */
@Injectable()
export class GitCredentialApiService {
  private readonly logger = new Logger(GitCredentialApiService.name);

  async verify(provider: CredentialProvider, token: string, username?: string): Promise<VerifiedCredential> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'gatekeeper-deploy',
    };

    if (provider === 'gitlab') {
      headers['PRIVATE-TOKEN'] = token;
    } else {
      // bitbucket app password ต้องคู่กับ username เสมอ — ไม่มี = ยิงไปก็ 401 เปล่าๆ
      if (!username) throw new BadRequestException('bitbucket_username_required');
      headers.Authorization = `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;
    }

    let res: Response;
    try {
      res = await fetch(PROVIDER_API[provider], {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err: any) {
      this.logger.warn(`${provider} /user unreachable: ${err.message}`);
      throw new BadGatewayException(`${provider}_unreachable`);
    }

    if (res.status === 401 || res.status === 403) throw new BadRequestException(`${provider}_token_invalid`);
    if (!res.ok) throw new BadGatewayException(`${provider}_error:${res.status}`);

    const body: any = await res.json().catch(() => ({}));
    // gitlab คืน { username }, bitbucket คืน { username, nickname } (บางบัญชีมีแต่ nickname)
    const resolved = body?.username || body?.nickname || username;
    if (!resolved) throw new BadGatewayException(`${provider}_error:no_username`);

    return { username: String(resolved) };
  }
}
