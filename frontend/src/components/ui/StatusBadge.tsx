'use client';
import { PluginStatus } from '@/types';

const cfg: Record<PluginStatus, { label: string; cls: string; dot?: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-yellow/10 text-yellow border-yellow/30',    dot: 'bg-yellow' },
  screening:  { label: 'Scanning…',  cls: 'bg-purple/10 text-purple border-purple/30',    dot: 'bg-purple pulse-green' },
  generating: { label: 'Generating', cls: 'bg-accent/10  text-accent  border-accent/30',  dot: 'bg-accent pulse-green' },
  active:     { label: 'Active',     cls: 'bg-green/10   text-green   border-green/30',   dot: 'bg-green' },
  quarantine: { label: 'Quarantine', cls: 'bg-yellow/10 text-yellow border-yellow/30',    dot: 'bg-yellow' },
  revoked:    { label: 'Revoked',    cls: 'bg-red/10     text-red     border-red/30',     dot: 'bg-red' },
  blocked:    { label: 'Blocked',    cls: 'bg-red/10     text-red     border-red/30',     dot: 'bg-red' },
};

export default function StatusBadge({ status }: { status: PluginStatus }) {
  const c = cfg[status] || cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono font-medium ${c.cls}`}>
      {c.dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
      {c.label}
    </span>
  );
}
