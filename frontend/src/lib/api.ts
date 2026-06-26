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

export const api = {
  // v0.1 Node.js — deploy pipeline
  deploy: (body: unknown) =>
    request<any>(V1_BASE, '/deploy', { method: 'POST', body: JSON.stringify(body) }),

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
};
