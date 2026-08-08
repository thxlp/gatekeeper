import { Injectable } from '@nestjs/common';
import { GithubTokenStore } from '../github/github-token.store';
import { GitCredentialStore } from './git-credential.store';
import type { CloneAuth } from '../webhook/git-automator.service';
import type { GitApp } from '../common/types';

/**
 * เลือก credential ที่ถูกต้องตาม provider ของ app — จุดเดียวที่รู้ว่าแต่ละเจ้าใช้ username อะไร
 * ทำ Basic auth (github ใช้ OAuth token จาก GithubTokenStore ส่วน gitlab/bitbucket ใช้ token
 * ที่ผู้ใช้ paste เองจาก GitCredentialStore)
 *
 * ไม่มี credential = คืน undefined แล้ว clone แบบไม่ auth ต่อ — public repo ยังใช้ได้ตามปกติ
 * ส่วน private repo จะพังที่ git ด้วย error ของ provider เอง (ไม่ได้บล็อกล่วงหน้า เพราะเรา
 * ไม่รู้ว่า repo นั้น private จริงไหมจนกว่าจะลอง)
 */
@Injectable()
export class CloneAuthResolver {
  constructor(
    private githubTokens: GithubTokenStore,
    private gitCredentials: GitCredentialStore,
  ) {}

  resolve(app: GitApp, accountId?: string): CloneAuth | undefined {
    const owner = accountId ?? app.accountId;
    if (!owner) return undefined;

    const provider = app.provider ?? 'github';
    if (provider === 'github') {
      const token = this.githubTokens.get(owner)?.token;
      return token ? { username: 'x-access-token', token } : undefined;
    }

    const cred = this.gitCredentials.get(owner, provider);
    return cred ? { username: cred.username, token: cred.token } : undefined;
  }
}
