import {
  AccountMe,
  CustomDomain,
  DbConnection,
  DeployOutcome,
  EnvListResponse,
  GitAppDetail,
  GitAppRegistration,
  GitAppSummary,
  GitCredentialProvider,
  GitCredentialStatus,
  GitCredentialsStatus,
  GithubRegisterResult,
  GithubRepo,
  GithubStatus,
  LogSnapshot,
  ManagedDbSummary,
  NotificationFeed,
  UsageSummary,
} from '@/types';
import { ApiError } from './errors';

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
  // เน็ตหลุด / server ไม่ตอบ → fetch โยน TypeError('Failed to fetch') ซึ่งไปโผล่หน้าจอดิบๆ
  // แปลงเป็น code ของเราเองให้ผู้ใช้อ่านรู้เรื่อง (ดู lib/errors.ts)
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError('network_error');
  }

  // body อาจไม่ใช่ JSON ได้ (เช่น nginx ตอบ 502 เป็น HTML) — กัน SyntaxError ที่ทำให้ผู้ใช้
  // เห็นข้อความประหลาดแทนสาเหตุจริง
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    // ValidationPipe ของ Nest ตอบ message เป็น "อาเรย์ของข้อความ" ตอน DTO ไม่ผ่าน —
    // ต้องรวบเป็น string ก่อน ไม่งั้น ApiError ได้ค่าที่ไม่มี .trim() ไปโผล่ตอน render
    const raw = Array.isArray(data.message) ? data.message.join(' · ') : data.message;
    const message = raw || data.error || `http_${res.status}`;
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
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export interface AuthResult {
  keyPrefix: string;
  email: string;
  plan: 'free' | 'pro';
}

// บัญชีที่เปิด 2FA: /auth/session ตอบแบบนี้แทน (ยังไม่ได้ cookie) — ต้องไปกรอกรหัสจากอีเมล
// แล้วเรียก verifyOtp ต่อ ใช้ type guard 'mfaRequired' in res แยกสองเคส
export type SessionResult = AuthResult | { mfaRequired: true };

export const api = {
  // เรียกหลัง Supabase auth สำเร็จ (ไม่ว่า email/password, GitHub, Google) พร้อม
  // supabase access token แทน gatekeeper api_key ปกติ (override header เอง) เพื่อแลกเป็น
  // gatekeeper api_key ของบัญชีนั้น (สร้างให้ใหม่ถ้ายังไม่เคยมี) — key จริงมาทาง Set-Cookie
  // ไม่ใช่ response body (ดู AuthResult) — logout เคลียร์ cookie ฝั่ง server เพราะเป็น httpOnly
  auth: {
    syncSession: (supabaseAccessToken: string) =>
      request<SessionResult>(API_BASE, '/auth/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAccessToken}` },
      }),
    // step 2 ของบัญชีที่เปิด 2FA — Supabase token เดิม + รหัส 6 หลักจากอีเมล แลก cookie จริง
    verifyOtp: (supabaseAccessToken: string, code: string) =>
      request<AuthResult>(API_BASE, '/auth/session/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAccessToken}` },
        body: JSON.stringify({ code }),
      }),
    resendOtp: (supabaseAccessToken: string) =>
      request<{ ok: boolean }>(API_BASE, '/auth/session/resend', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAccessToken}` },
      }),
    // จัดการ 2FA จากหน้า Settings (ใช้ session cookie ปกติ) — ทั้งเปิดและปิดต้องยืนยันรหัสจากอีเมล
    request2faOtp: (intent: 'enable' | 'disable') =>
      request<{ ok: boolean }>(API_BASE, '/auth/2fa/otp', { method: 'POST', body: JSON.stringify({ intent }) }),
    enable2fa: (code: string) =>
      request<{ ok: boolean; twoFactorEnabled: boolean }>(API_BASE, '/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    disable2fa: (code: string) =>
      request<{ ok: boolean; twoFactorEnabled: boolean }>(API_BASE, '/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    logout: () => request<{ ok: boolean }>(API_BASE, '/auth/logout', { method: 'POST' }),
  },

  // combined audit stream
  getMyAudit: () => request<any[]>(API_BASE, '/audit'),

  // feed แจ้งเตือน (กระดิ่งบน TopBar) — poll เป็นระยะตาม pattern polling ของทั้งแอป
  notifications: {
    list: () => request<NotificationFeed>(API_BASE, '/notifications'),
    markRead: () => request<{ ok: boolean }>(API_BASE, '/notifications/read', { method: 'POST' }),
  },

  // ข้อมูล + preference ของบัญชีตัวเอง (toggle Email Notifications ในหน้า Settings)
  account: {
    me: () => request<AccountMe>(API_BASE, '/account/me'),
    updatePrefs: (body: { notifyEmail: boolean }) =>
      request<{ ok: boolean; notifyEmail: boolean }>(API_BASE, '/account/prefs', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

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

  // GitLab/Bitbucket — ไม่มี OAuth flow ผู้ใช้ paste PAT/app password เอง (ใช้ตอน clone private repo)
  gitCredentials: {
    status: () => request<GitCredentialsStatus>(API_BASE, '/git-credentials/status'),
    connect: (body: { provider: GitCredentialProvider; token: string; username?: string }) =>
      request<GitCredentialStatus>(API_BASE, '/git-credentials/connect', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    disconnect: (provider: GitCredentialProvider) =>
      request<GitCredentialStatus>(API_BASE, `/git-credentials/connect/${provider}`, { method: 'DELETE' }),
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

  // กดกลับไป release เดิม (จากลิสต์ releases ใน getApp) — poll สถานะต่อผ่าน getApp(id)
  rollbackApp: (id: string, releaseId: string) =>
    request<{ ok: boolean; id: string; pipelineStatus: string }>(API_BASE, `/apps/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ releaseId }),
    }),

  // Manual zip-upload deploy — formData ต้องมีฟิลด์ "archive" (ไฟล์ .zip) และถ้าจะ redeploy
  // app เดิมให้ใส่ฟิลด์ "appId" มาด้วย ไม่ใส่ = สร้าง app ใหม่ (ต้องมี "runtime" ตอนนั้น)
  deployManual: (formData: FormData) =>
    request<DeployOutcome>(API_BASE, '/apps/manual/deploy', { method: 'POST', body: formData }),

  updateGitApp: (
    id: string,
    body: { branch?: string; runtime?: string; port?: number; enabled?: boolean; autoDeploy?: boolean } & AppConfigBody,
  ) => request<GitAppSummary>(API_BASE, `/apps/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // ===== custom domains ต่อแอป (แท็บ Domains) =====
  domains: {
    list: (appId: string) => request<CustomDomain[]>(API_BASE, `/apps/${appId}/domains`),
    add: (appId: string, domain: string) =>
      request<CustomDomain[]>(API_BASE, `/apps/${appId}/domains`, { method: 'POST', body: JSON.stringify({ domain }) }),
    verify: (appId: string, domain: string) =>
      request<CustomDomain[]>(API_BASE, `/apps/${appId}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' }),
    remove: (appId: string, domain: string) =>
      request<CustomDomain[]>(API_BASE, `/apps/${appId}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' }),
  },

  deleteGitApp: (id: string) =>
    request<{ ok: boolean }>(API_BASE, `/apps/${id}`, { method: 'DELETE' }),

  // ===== Environment variables / secrets manager (แท็บ Variables) =====
  // ค่า env เป็นความลับ — API คืนแค่ key ไม่เคยส่งค่าจริงกลับ ทุก mutation ตอบ needsRedeploy
  env: {
    list: (id: string) => request<EnvListResponse>(API_BASE, `/apps/${id}/env`),
    // เพิ่ม/แก้ทีละตัว (upsert)
    set: (id: string, key: string, value: string) =>
      request<EnvListResponse>(API_BASE, `/apps/${id}/env`, {
        method: 'POST',
        body: JSON.stringify({ key, value }),
      }),
    remove: (id: string, key: string) =>
      request<EnvListResponse>(API_BASE, `/apps/${id}/env/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    // import จากข้อความ .env ที่วางมา (merge ทับของเดิม)
    importRaw: (id: string, raw: string) =>
      request<EnvListResponse>(API_BASE, `/apps/${id}/env`, { method: 'PUT', body: JSON.stringify({ raw }) }),
  },

  // ===== Live logs (แท็บ Logs) =====
  logs: {
    // snapshot ล่าสุด (ไม่ follow) — ใช้ตอนเปิดแท็บครั้งแรก / ตอน pause
    snapshot: (id: string, tail = 500) =>
      request<LogSnapshot>(API_BASE, `/apps/${id}/logs?tail=${tail}`),
    // live tail — คืน Response ดิบให้ caller อ่าน body เป็น stream เอง (fetch + ReadableStream)
    // ไม่ผ่าน request() เพราะนั่น .json() ทั้งก้อน แต่ endpoint นี้เป็น chunked text ที่เปิดค้าง
    stream: (id: string, tail: number, signal: AbortSignal) =>
      fetch(`${API_BASE}/apps/${id}/logs/stream?tail=${tail}`, {
        credentials: 'same-origin',
        signal,
      }),
  },

  // ผลการใช้งานของ account ตัวเอง (CPU/RAM สดต่อ app + สถิติ deploy) — หน้า Settings
  usage: () => request<UsageSummary>(API_BASE, '/usage'),

  // ===== Managed databases (ต่อ user) — หน้า Databases =====
  databases: {
    list: () => request<ManagedDbSummary[]>(API_BASE, '/databases'),
    create: (body: { name: string; engine: string }) =>
      request<ManagedDbSummary>(API_BASE, '/databases', { method: 'POST', body: JSON.stringify(body) }),
    // connection string เต็ม (มี password) — แยก endpoint ไม่ปนกับ list
    connection: (id: string) => request<DbConnection>(API_BASE, `/databases/${id}/connection`),
    attach: (id: string, appId: string) =>
      request<ManagedDbSummary>(API_BASE, `/databases/${id}/attach`, { method: 'POST', body: JSON.stringify({ appId }) }),
    detach: (id: string, appId: string) =>
      request<ManagedDbSummary>(API_BASE, `/databases/${id}/detach`, { method: 'POST', body: JSON.stringify({ appId }) }),
    remove: (id: string) => request<{ ok: boolean }>(API_BASE, `/databases/${id}`, { method: 'DELETE' }),
  },
};
