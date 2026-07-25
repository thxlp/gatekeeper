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

// host allowlist สำหรับ multi-provider — host คงที่เท่านั้น (เหตุผล SSRF เดียวกับ github)
const HOST_PROVIDER: Record<string, 'github' | 'gitlab' | 'bitbucket'> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
};
// path repo: อย่างน้อย 2 segment, อักขระปลอดภัย (gitlab รองรับ subgroup ได้หลายชั้น)
const REPO_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/;

export interface ParsedRepo {
  provider: 'github' | 'gitlab' | 'bitbucket';
  repoFullName: string;
  cloneUrl: string;
}

/**
 * parse repo URL ของ 3 provider (github/gitlab/bitbucket) — คงข้อจำกัด host แบบ allowlist ตายตัว
 * (กัน SSRF/แปลง transport เหมือน parseGithubRepoUrl) github/bitbucket = 2 segment, gitlab
 * รองรับ subgroup ได้ถึง 6 ชั้น จำกัดความลึกกัน abuse
 */
export function parseGitRepoUrl(input: string): ParsedRepo | null {
  const trimmed = (input || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const provider = HOST_PROVIDER[u.hostname];
  if (!provider) return null;
  const repoPath = u.pathname.replace(/^\/+/, '');
  if (!REPO_PATH_RE.test(repoPath)) return null;
  const depth = repoPath.split('/').length;
  if (provider !== 'gitlab' && depth !== 2) return null; // github/bitbucket = owner/repo เท่านั้น
  if (depth > 6) return null;
  return { provider, repoFullName: repoPath, cloneUrl: `https://${u.hostname}/${repoPath}.git` };
}

/** กัน branch name ที่อาจหลอก git ให้ตีความเป็น flag หรือ ref แปลกๆ (defense-in-depth) */
export function isSafeBranchName(branch: string): boolean {
  if (!branch || branch.length > 200) return false;
  if (branch.startsWith('-') || branch.includes('..') || branch.endsWith('.lock') || branch.endsWith('/')) {
    return false;
  }
  return /^[A-Za-z0-9._/-]+$/.test(branch);
}
