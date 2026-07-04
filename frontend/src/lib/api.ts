import { GitAppRegistration, GitAppSummary } from '@/types';

const V1_BASE = '/api/v1';
const V2_BASE = '/api/v2';

function getKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('gk_api_key') || '';
}

async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getKey()}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data as T;
}

export interface AuthResult {
  apiKey: string;
  email: string;
  plan: 'free' | 'pro';
}

export const api = {
  // v0.1 Node.js — deploy pipeline
  deploy: (body: unknown) =>
    request<any>(V1_BASE, '/deploy', { method: 'POST', body: JSON.stringify(body) }),

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

  getPluginLogs: (id: string) => request<any[]>(V2_BASE, `/plugins/${id}/logs`),

  // v0.2 NestJS — combined audit stream
  getMyAudit: () => request<any[]>(V2_BASE, '/audit'),

  // v0.2 NestJS — GitHub Auto-Deploy webhook self-service
  registerGitApp: (body: { repoUrl: string; branch?: string; runtime?: string }) =>
    request<GitAppRegistration>(V2_BASE, '/apps/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listGitApps: () => request<GitAppSummary[]>(V2_BASE, '/apps'),
};
