'use client';
import { PipelineStage, PipelineStageStatus } from '@/types';

// Mirror ของ STAGE_STATUS_META ใน backend/src/webhook/webhook-dashboard.html.ts (server-rendered
// HTML dashboard เดิม) — ใช้ icon/สีชุดเดียวกันเพื่อให้หน้าตาสอดคล้องกันทั้งสองที่
const STATUS_META: Record<PipelineStageStatus, { icon: string; border: string; text: string; label: string }> = {
  pending: { icon: '○', border: 'border-border', text: 'text-sub', label: 'pending' },
  running: { icon: '◐', border: 'border-accent', text: 'text-accent', label: 'running…' },
  success: { icon: '✓', border: 'border-green', text: 'text-green', label: 'success' },
  failed: { icon: '✕', border: 'border-red', text: 'text-red', label: 'failed' },
};

export default function PipelineStepper({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="flex flex-col gap-3">
      {stages.map((s) => {
        const m = STATUS_META[s.status] || STATUS_META.pending;
        const at = s.at ? new Date(s.at).toLocaleString() : '';
        return (
          <div key={s.key} className="flex items-start gap-3">
            <span
              className={`shrink-0 w-6 h-6 rounded-full border-[1.5px] flex items-center justify-center text-xs font-mono ${m.border} ${m.text} ${s.status === 'running' ? 'pulse-green' : ''}`}
            >
              {m.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-text font-mono">{s.label}</div>
              <div className={`text-[10px] font-mono mt-0.5 ${m.text}`}>
                {m.label}
                {at ? ` · ${at}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
