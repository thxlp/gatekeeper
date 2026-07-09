import { AuditEntry } from '@/types';

// backend/src/audit writes `stage` as a free-form string (see AuditEntry in
// backend/src/common/types.ts) — there is no clean SCAN/HANDSHAKE/RISK/DEPLOY
// enum server-side, and `decision` is only ever ALLOW/QUARANTINE/BLOCK/INFO
// (no "OK"/"LIVE"). Group by stage *prefix* rather than a fixed list so new
// stage strings added backend-side still render sensibly.
export function stageBadge(stage: string): { label: string; kind: 'primary' | 'allow' | 'purple' } {
  if (stage.startsWith('plugin:')) return { label: stage.split(':')[1].toUpperCase(), kind: 'purple' };
  if (stage.startsWith('gitapp:')) return { label: stage.split(':')[1].toUpperCase(), kind: 'primary' };
  if (stage === 'webhook') return { label: 'WEBHOOK', kind: 'allow' };
  return { label: stage.toUpperCase(), kind: 'primary' }; // decision | app_build | deploy | fatal
}

export const decisionKind: Record<string, 'allow' | 'warn' | 'danger'> = {
  ALLOW: 'allow',
  INFO: 'allow',
  QUARANTINE: 'warn',
  BLOCK: 'danger',
};

export function auditDetail(e: AuditEntry): string {
  const parts: string[] = [];
  if (e.reason) parts.push(e.reason);
  if (e.score !== undefined) parts.push(`score=${e.score}`);
  if (e.findings?.length) parts.push(`${e.findings.length} findings`);
  if (e.pluginId) parts.push(`plugin: ${e.pluginId}`);
  return parts.join(' · ') || '—';
}
