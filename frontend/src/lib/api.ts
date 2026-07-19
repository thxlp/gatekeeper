import {
  DeployOutcome,
  GitAppDetail,
  GitAppRegistration,
  GitAppSummary,
  GithubRegisterResult,
  GithubRepo,
  GithubStatus,
  UsageSummary,
} from '@/types';

const API_BASE = '/api';

// config เพิ่มเติมต่อ app (ใช้ร่วมกับ register/update) — value ของ env/build-arg เป็นความลับ
// backend เข้ารหัสเก็บและไม่ echo กลับเป็นค่าเต็ม
export type AppConfigBody = {
  envVars?: { key: string; value: string }[];
  buildArgs?: { key: string; value: string }[];
  addons?: string[];
  memoryMb?: number;
  cpuMilli?: number;
  spa?: boolean;
};

async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  // FormData (multipart upload) ต้องปล่อยให้ browser ตั้ง Content-Type เอง (มี boundary แนบมาด้วย)
  // ห้ามตั้ง 'application/json' ทับ ไม่งั้น multer ฝั่ง backend parse ไม่ออก
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string> | undefined),
  };

  // ไม่ใส่ Authorization header จาก browser แล้ว — api key เดินทางผ่าน httpOnly cookie
  // (เซ็ตตอน /auth/session) แนบไปเองอัตโนมัติเพราะเป็น same-origin request ผ่าน nginx อยู่แล้ว
  // ใส่ credentials ชัดเจนกันพลาดข้ามเบราว์เซอร์รุ่นเก่า
  const res = await fetch(`${base}${path}`, { ...init, headers, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) {
    const message = data.message || data.error || `HTTP ${res.status}`;
    // key หมดอายุ (idle เกิน 15 นาที) หรือถูกลบไปแล้ว (หลุดโควตา) — ล้าง flag แล้วพาไป login
    // ทันที ไม่ปล่อยให้ทุกหน้าค้างอยู่กับ session ที่ใช้ไม่ได้ (invalid_supabase_session ของ
    // /auth/session ไม่เข้าเงื่อนไขนี้ — หน้า login จัดการ error ของตัวเองอยู่แล้ว) cookie จริง
    // เป็น httpOnly ลบเองจาก JS ไม่ได้ — จะหมดอายุเองฝั่ง server ตาม idle timeout อยู่แล้ว
    if (res.status === 401 && (message === 'session_expired' || message === 'invalid_api_key')) {
      localStorage.removeItem('gk_authed');
      localStorage.removeItem('gk_key_prefix');
      localStorage.removeItem('gk_last_activity');
      window.location.href = `/login?reason=${message === 'session_expired' ? 'idle' : 'expired'}`;
    }
    throw new Error(message);
  }
  return data as T;
}

export interface AuthResult {
  keyPrefix: string;
  email: string;
  plan: 'free' | 'pro';
}

export const api = {
  // เรียกหลัง Supabase auth สำเร็จ (ไม่ว่า email/password, GitHub, Google) พร้อม
  // supabase access token แทน gatekeeper api_key ปกติ (override header เอง) เพื่อแลกเป็น
  // gatekeeper api_key ของบัญชีนั้น (สร้างให้ใหม่ถ้ายังไม่เคยมี) — key จริงมาทาง Set-Cookie
  // ไม่ใช่ response body (ดู AuthResult) — logout เคลียร์ cookie ฝั่ง server เพราะเป็น httpOnly
  auth: {
    syncSession: (supabaseAccessToken: string) =>
      request<AuthResult>(API_BASE, '/auth/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAccessToken}` },
      }),
    logout: () => request<{ ok: boolean }>(API_BASE, '/auth/logout', { method: 'POST' }),
  },

  // plugin lifecycle
  getCertified: () => request<any[]>(API_BASE, '/plugins/certified'),

  registerPlugin: (body: unknown) =>
    request<any>(API_BASE, '/plugins', { method: 'POST', body: JSON.stringify(body) }),

  listPlugins: () => request<any[]>(API_BASE, '/plugins'),
  getPlugin: (id: string) => request<any>(API_BASE, `/plugins/${id}`),

  screenPlugin: (id: string) =>
    request<any>(API_BASE, `/plugins/${id}/screen`, { method: 'POST' }),

  verifyPlugin: (id: string) => request<any>(API_BASE, `/plugins/${id}/verify`),

  handshakePlugin: (id: string) =>
    request<any>(API_BASE, `/plugins/${id}/handshake`, { method: 'POST' }),

  proxyCall: (id: string, body: unknown) =>
    request<any>(API_BASE, `/plugins/${id}/proxy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revokePlugin: (id: string) =>
    request<any>(API_BASE, `/plugins/${id}/revoke`, { method: 'DELETE' }),

  updatePlugin: (id: string, body: unknown) =>
    request<any>(API_BASE, `/plugins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deletePlugin: (id: string) =>
    request<{ ok: boolean }>(API_BASE, `/plugins/${id}`, { method: 'DELETE' }),

  getPluginLogs: (id: string) => request<any[]>(API_BASE, `/plugins/${id}/logs`),

  // combined audit stream
  getMyAudit: () => request<any[]>(API_BASE, '/audit'),

  // GitHub connection (repo picker + auto webhook แบบ Railway)
  github: {
    status: () => request<GithubStatus>(API_BASE, '/github/status'),
    // token = PAT ที่ user paste เอง หรือ provider_token จาก Supabase GitHub OAuth (scope repo)
    connect: (token: string) =>
      request<GithubStatus>(API_BASE, '/github/connect', { method: 'POST', body: JSON.stringify({ token }) }),
    disconnect: () => request<GithubStatus>(API_BASE, '/github/connect', { method: 'DELETE' }),
    repos: () => request<GithubRepo[]>(API_BASE, '/github/repos'),
    branches: (owner: string, repo: string) =>
      request<string[]>(API_BASE, `/github/repos/${owner}/${repo}/branches`),
  },

  // เลือก repo จาก picker → backend สร้าง webhook ใน GitHub ให้อัตโนมัติ + ยิง first deploy ทันที
  // (ตอบเร็ว — poll สถานะ pipeline ต่อผ่าน getApp(id))
  registerGithubApp: (body: { repoFullName: string; branch?: string; runtime?: string; port?: number; projectName?: string } & AppConfigBody) =>
    request<GithubRegisterResult>(API_BASE, '/apps/register-github', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // สั่ง deploy git app ทันที (Deploy now / Redeploy) — poll สถานะต่อผ่าน getApp(id)
  deployGitApp: (id: string) =>
    request<{ ok: boolean; id: string; pipelineStatus: string }>(API_BASE, `/apps/${id}/deploy`, { method: 'POST' }),

  // GitHub Auto-Deploy webhook self-service
  registerGitApp: (body: { repoUrl: string; branch?: string; runtime?: string; port?: number } & AppConfigBody) =>
    request<GitAppRegistration>(API_BASE, '/apps/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listGitApps: () => request<GitAppSummary[]>(API_BASE, '/apps'),

  // ใช้ poll สถานะ pipeline ระหว่าง deploy กำลังวิ่งอยู่ (มี pipelineStages ที่ listGitApps ไม่มี)
  getApp: (id: string) => request<GitAppDetail>(API_BASE, `/apps/${id}`),

  // Manual zip-upload deploy — formData ต้องมีฟิลด์ "archive" (ไฟล์ .zip) และถ้าจะ redeploy
  // app เดิมให้ใส่ฟิลด์ "appId" มาด้วย ไม่ใส่ = สร้าง app ใหม่ (ต้องมี "runtime" ตอนนั้น)
  deployManual: (formData: FormData) =>
    request<DeployOutcome>(API_BASE, '/apps/manual/deploy', { method: 'POST', body: formData }),

  updateGitApp: (id: string, body: { branch?: string; runtime?: string; port?: number; enabled?: boolean } & AppConfigBody) =>
    request<GitAppSummary>(API_BASE, `/apps/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteGitApp: (id: string) =>
    request<{ ok: boolean }>(API_BASE, `/apps/${id}`, { method: 'DELETE' }),

  // ผลการใช้งานของ account ตัวเอง (CPU/RAM สดต่อ app + สถิติ deploy) — หน้า Settings
  usage: () => request<UsageSummary>(API_BASE, '/usage'),
};
