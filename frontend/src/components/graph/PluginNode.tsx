'use client';
import { useRouter } from 'next/navigation';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plugin } from '@/types';
import StatusBadge from '../ui/StatusBadge';

const borderByStatus: Record<string, string> = {
  active: 'border-allow-dot/50',
  blocked: 'border-danger-dot/50',
  revoked: 'border-danger-dot/50',
  quarantine: 'border-warn-dot/50',
  screening: 'border-primary/50',
  generating: 'border-primary/50',
  pending: 'border-input-border',
};

export default function PluginNode({ data, selected }: NodeProps<Plugin>) {
  const router = useRouter();
  const border = borderByStatus[data.status] || 'border-input-border';
  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-border !bg-muted" />
      <div
        onClick={() => router.push(`/plugins/${data.id}`)}
        className={`relative w-52 cursor-pointer rounded-xl border bg-surface shadow-node transition-all duration-150 hover:scale-[1.02] ${border} ${
          selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-page' : ''
        }`}
      >
        <div className="border-b border-[#EFEDE6] px-3 pb-2 pt-3">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-semibold leading-tight text-ink">{data.name}</span>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-3">{data.base_url}</p>
        </div>

        <div className="space-y-1 px-3 py-2">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>auth</span>
            <span className="text-primary">{data.auth_type}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>endpoints</span>
            <span className="text-ink-soft">{data.endpoints?.length ?? 0}</span>
          </div>
          {data.risk_score !== undefined && (
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span>risk score</span>
              <span className={data.risk_score >= 50 ? 'text-danger-text' : data.risk_score > 0 ? 'text-warn-text' : 'text-allow-text'}>
                {data.risk_score}
              </span>
            </div>
          )}
        </div>

        {data.signature && (
          <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-allow-dot" title="Signed" />
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-border !bg-muted" />
    </>
  );
}
