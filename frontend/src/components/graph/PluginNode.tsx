'use client';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plugin } from '@/types';
import StatusBadge from '../ui/StatusBadge';

const borderByStatus: Record<string, string> = {
  active:     'border-green/50  shadow-green/10',
  blocked:    'border-red/50    shadow-red/10',
  revoked:    'border-red/40    shadow-red/10',
  quarantine: 'border-yellow/50 shadow-yellow/10',
  screening:  'border-purple/50 shadow-purple/10',
  generating: 'border-accent/50 shadow-accent/10',
  pending:    'border-muted',
};

export default function PluginNode({ data, selected }: NodeProps<Plugin & { onSelect: (p: Plugin) => void }>) {
  const border = borderByStatus[data.status] || 'border-muted';
  return (
    <>
      <Handle type="target" position={Position.Left}  className="!bg-muted !border-border !w-2 !h-2" />
      <div
        onClick={() => data.onSelect(data)}
        className={`
          relative w-52 rounded-xl border bg-panel shadow-lg cursor-pointer
          transition-all duration-150 hover:scale-[1.02]
          ${border}
          ${selected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}
        `}
      >
        {/* header */}
        <div className="px-3 pt-3 pb-2 border-b border-border">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-text leading-tight truncate">{data.name}</span>
            <StatusBadge status={data.status} />
          </div>
          <p className="text-[10px] text-sub font-mono mt-0.5 truncate">{data.base_url}</p>
        </div>

        {/* body */}
        <div className="px-3 py-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-sub font-mono">
            <span>auth</span>
            <span className="text-accent">{data.auth_type}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-sub font-mono">
            <span>endpoints</span>
            <span className="text-text">{data.endpoints?.length ?? 0}</span>
          </div>
          {data.risk_score !== undefined && (
            <div className="flex items-center justify-between text-[10px] text-sub font-mono">
              <span>risk score</span>
              <span className={data.risk_score >= 50 ? 'text-red' : data.risk_score > 0 ? 'text-yellow' : 'text-green'}>
                {data.risk_score}
              </span>
            </div>
          )}
        </div>

        {/* signature indicator */}
        {data.signature && (
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-green border-2 border-surface" title="Signed" />
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted !border-border !w-2 !h-2" />
    </>
  );
}
