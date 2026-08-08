import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/paths';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../common/crypto.util';

/** provider ที่ต้องให้ผู้ใช้ paste credential เอง — github ใช้ OAuth แยกทาง (GithubTokenStore) */
export type CredentialProvider = 'gitlab' | 'bitbucket';

export interface GitCredential {
  accountId: string;
  provider: CredentialProvider;
  /**
   * ชื่อผู้ใช้ที่ใช้ทำ HTTP Basic ตอน clone
   * - gitlab: คงที่เป็น 'oauth2' (PAT ของ GitLab ใช้ท่านี้)
   * - bitbucket: username จริงของเจ้าของ app password
   */
  username: string;
  token: string;
  connectedAt: string;
}

/**
 * เก็บ credential ของ GitLab/Bitbucket ต่อ (account, provider) — โครงเดียวกับ GithubTokenStore
 * (อ่านไฟล์สดทุกครั้งไม่ cache เพราะ backend รันหลาย instance แชร์ DATA_DIR เดียวกัน)
 *
 * token เข้ารหัส AES-256-GCM เสมอในไฟล์ โค้ดนอก store เห็น plaintext อย่างเดียว
 */
@Injectable()
export class GitCredentialStore {
  private storePath = path.join(DATA_DIR, 'git-credentials.json');

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, '[]\n', 'utf8');
    }

    // migrate ครั้งเดียวตอน boot เหมือน GithubTokenStore — plaintext ที่หลงเหลือถูกเข้ารหัสทับ
    const raw = this.readAll();
    if (raw.some((c) => !isEncryptedSecret(c.token))) {
      this.writeAll(raw.map((c) => (isEncryptedSecret(c.token) ? c : { ...c, token: encryptSecret(c.token) })));
    }
  }

  private readAll(): GitCredential[] {
    try {
      return JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      return [];
    }
  }

  private writeAll(items: GitCredential[]): void {
    fs.writeFileSync(this.storePath, JSON.stringify(items, null, 2) + '\n', 'utf8');
  }

  get(accountId: string, provider: CredentialProvider): GitCredential | undefined {
    const cred = this.readAll().find((c) => c.accountId === accountId && c.provider === provider);
    return cred ? { ...cred, token: decryptSecret(cred.token) } : undefined;
  }

  /** สถานะทุก provider ของ account — ไม่คืน token (ใช้แสดงผลในหน้า Settings) */
  listByAccount(accountId: string): Omit<GitCredential, 'token'>[] {
    return this.readAll()
      .filter((c) => c.accountId === accountId)
      .map(({ token: _token, ...rest }) => rest);
  }

  save(cred: GitCredential): GitCredential {
    const all = this.readAll();
    const stored = { ...cred, token: encryptSecret(cred.token) };
    const idx = all.findIndex((c) => c.accountId === cred.accountId && c.provider === cred.provider);
    if (idx >= 0) all[idx] = stored;
    else all.push(stored);
    this.writeAll(all);
    return cred;
  }

  delete(accountId: string, provider: CredentialProvider): boolean {
    const all = this.readAll();
    const next = all.filter((c) => !(c.accountId === accountId && c.provider === provider));
    const existed = next.length !== all.length;
    if (existed) this.writeAll(next);
    return existed;
  }
}
