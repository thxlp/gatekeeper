import { PluginStatus } from '@/types';
import { Pill } from './primitives';

const cfg: Record<PluginStatus, { label: string; kind: 'allow' | 'warn' | 'danger' | 'primary' | 'muted' }> = {
  active: { label: 'ACTIVE', kind: 'allow' },
  revoked: { label: 'REVOKED', kind: 'danger' },
  blocked: { label: 'BLOCKED', kind: 'danger' },
  quarantine: { label: 'QUARANTINE', kind: 'warn' },
  screening: { label: 'SCREENING', kind: 'primary' },
  generating: { label: 'GENERATING', kind: 'primary' },
  pending: { label: 'PENDING', kind: 'muted' },
};

export default function StatusBadge({ status }: { status: PluginStatus }) {
  const c = cfg[status] || cfg.pending;
  return <Pill kind={c.kind}>{c.label}</Pill>;
}
