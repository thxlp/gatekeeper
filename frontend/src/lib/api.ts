import {
  DeployOutcome,
  GitAppDetail,
  GitAppRegistration,
  GitAppSummary,
  GithubRegisterResult,
  GithubRepo,
  GithubStatus,
} from '@/types';

const V2_BASE = '/api/v2';

function getKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('gk_api_key') || '';
}

async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  // FormData (multipart upload) ต้องปล่อยให้ browser ตั้ง Content-Type เอง (มี boundary แนบมาด้วย)
  // ห้ามตั้ง 'application/json' ทับ ไม่งั้น multer ฝั่ง backend parse ไม่ออก
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getKey()}`,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${base}${path}`, { ...init, headers });
  const data = await res.json();
  if (!res.ok) {
    const message = data.message || data.error || `HTTP ${res.status}`;
    // key หมดอายุ (idle เกิน 15 นาที) หรือถูกลบไปแล้ว (หลุดโควตา) — ล้าง key แล้วพาไป login
    // ทันที ไม่ปล่อยให้ทุกหน้าค้างอยู่กับ key ที่ใช้ไม่ได้ (invalid_supabase_session ของ
    // /auth/session ไม่เข้าเงื่อนไขนี้ — หน้า login จัดการ error ของตัวเองอยู่แล้ว)
    if (res.status === 401 && (message === 'session_expired' || message === 'invalid_api_key')) {
      localStorage.removeItem('gk_api_key');
      localStorage.removeItem('gk_last_activity');
      window.location.href = `/login?reason=${message === 'session_expired' ? 'idle' : 'expired'}`;
    }
    throw new Error(message);
  }
  return data as T;
}

export interface AuthResult {
  apiKey: string;
  email: string;
  plan: 'free' | 'pro';
}

export const api = {
  // v0.2 NestJS — เรียกหลัง Supabase auth สำเร็จ (ไม่ว่า email/password, GitHub, Google) พร้อม
  // supabase access token แทน gatekeeper api_key ปกติ (override header เอง ไม่ผ่าน getKey())
  // เพื่อแลกเป็น gatekeeper api_key ของบัญชีนั้น (สร้างให้ใหม่ถ้ายังไม่เคยมี)
  auth: {
    syncSession: (supabaseAccessToken: string) =>
      request<AuthResult>(V2_BASE, '/auth/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAccessToken}` },
      }),
  },

  // v0.2 NestJS — plugin lifecycle
  getCertified: () => request<any[]>(V2_BASE, '/plugins/certified'),

  registerPlugin: (body: unknown) =>
    request<any>(V2_BASE, '/plugins', { method: 'POST', body: JSON.stringify(body) }),

  listPlugins: () => request<any[]>(V2_BASE, '/plugins'),
  getPlugin: (id: string) => request<any>(V2_BASE, `/plugins/${id}`),

  screenPlugin: (id: string) =>
    request<any>(V2_BASE, `/plugins/${id}/screen`, { method: 'POST' }),

  verifyPlugin: (id: string) => request<any>(V2_BASE, `/plugins/${id}/verify`),

  handshakePlugin: (id: string) =>
    request<any>(V2_BASE, `/plugins/${id}/handshake`, { method: 'POST' }),

  proxyCall: (id: string, body: unknown) =>
    request<any>(V2_BASE, `/plugins/${id}/proxy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revokePlugin: (id: string) =>
    request<any>(V2_BASE, `/plugins/${id}/revoke`, { method: 'DELETE' }),

  updatePlugin: (id: string, body: unknown) =>
    request<any>(V2_BASE, `/plugins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deletePlugin: (id: string) =>
    request<{ ok: boolean }>(V2_BASE, `/plugins/${id}`, { method: 'DELETE' }),

  getPluginLogs: (id: string) => request<any[]>(V2_BASE, `/plugins/${id}/logs`),

  // v0.2 NestJS — combined audit stream
  getMyAudit: () => request<any[]>(V2_BASE, '/audit'),

  // v0.2 NestJS — GitHub connection (repo picker + auto webhook แบบ Railway)
  github: {
    status: () => request<GithubStatus>(V2_BASE, '/github/status'),
    // token = PAT ที่ user paste เอง หรือ provider_token จาก Supabase GitHub OAuth (scope repo)
    connect: (token: string) =>
      request<GithubStatus>(V2_BASE, '/github/connect', { method: 'POST', body: JSON.stringify({ token }) }),
    disconnect: () => request<GithubStatus>(V2_BASE, '/github/connect', { method: 'DELETE' }),
    repos: () => request<GithubRepo[]>(V2_BASE, '/github/repos'),
    branches: (owner: string, repo: string) =>
      request<string[]>(V2_BASE, `/github/repos/${owner}/${repo}/branches`),
  },

  // เลือก repo จาก picker → backend สร้าง webhook ใน GitHub ให้อัตโนมัติ + ยิง first deploy ทันที
  // (ตอบเร็ว — poll สถานะ pipeline ต่อผ่าน getApp(id))
  registerGithubApp: (body: { repoFullName: string; branch?: string; runtime?: string; projectName?: string }) =>
    request<GithubRegisterResult>(V2_BASE, '/apps/register-github', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // สั่ง deploy git app ทันที (Deploy now / Redeploy) — poll สถานะต่อผ่าน getApp(id)
  deployGitApp: (id: string) =>
    request<{ ok: boolean; id: string; pipelineStatus: string }>(V2_BASE, `/apps/${id}/deploy`, { method: 'POST' }),

  // v0.2 NestJS — GitHub Auto-Deploy webhook self-service
  registerGitApp: (body: { repoUrl: string; branch?: string; runtime?: string }) =>
    request<GitAppRegistration>(V2_BASE, '/apps/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listGitApps: () => request<GitAppSummary[]>(V2_BASE, '/apps'),

  // ใช้ poll สถานะ pipeline ระหว่าง deploy กำลังวิ่งอยู่ (มี pipelineStages ที่ listGitApps ไม่มี)
  getApp: (id: string) => request<GitAppDetail>(V2_BASE, `/apps/${id}`),

  // Manual zip-upload deploy — formData ต้องมีฟิลด์ "archive" (ไฟล์ .zip) และถ้าจะ redeploy
  // app เดิมให้ใส่ฟิลด์ "appId" มาด้วย ไม่ใส่ = สร้าง app ใหม่ (ต้องมี "runtime" ตอนนั้น)
  deployManual: (formData: FormData) =>
    request<DeployOutcome>(V2_BASE, '/apps/manual/deploy', { method: 'POST', body: formData }),

  updateGitApp: (id: string, body: { branch?: string; runtime?: string; enabled?: boolean }) =>
    request<GitAppSummary>(V2_BASE, `/apps/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteGitApp: (id: string) =>
    request<{ ok: boolean }>(V2_BASE, `/apps/${id}`, { method: 'DELETE' }),
};
