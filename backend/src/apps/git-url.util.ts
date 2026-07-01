/**
 * ยอมรับเฉพาะ https://github.com/<owner>/<repo> เท่านั้น
 *
 * นี่คือช่องโหว่ตัวสำคัญของฟีเจอร์นี้: repoUrl มาจาก input ของลูกค้าโดยตรง แล้วถูกส่งต่อเข้า
 * `git clone` ที่รันบนเซิร์ฟเวอร์จริง ถ้ายอมรับ scheme อื่น (file://, ssh://, ext::, หรือแม้แต่
 * scp-style user@host:path) จะเปิดช่องให้ clone จากโฮสต์ภายใน/รันคำสั่งผ่าน git transport
 * แปลกๆ ได้ — จึงบังคับ pattern ให้แคบที่สุดเท่าที่ใช้งานได้จริง (host คงที่ = github.com)
 */
const GITHUB_REPO_RE = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
  repoFullName: string;
  cloneUrl: string;
}

export function parseGithubRepoUrl(input: string): ParsedGithubRepo | null {
  const trimmed = (input || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const match = GITHUB_REPO_RE.exec(trimmed);
  if (!match) return null;
  const [, owner, repo] = match;
  return {
    owner,
    repo,
    repoFullName: `${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

/** กัน branch name ที่อาจหลอก git ให้ตีความเป็น flag หรือ ref แปลกๆ (defense-in-depth) */
export function isSafeBranchName(branch: string): boolean {
  if (!branch || branch.length > 200) return false;
  if (branch.startsWith('-') || branch.includes('..') || branch.endsWith('.lock') || branch.endsWith('/')) {
    return false;
  }
  return /^[A-Za-z0-9._/-]+$/.test(branch);
}
