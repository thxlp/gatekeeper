'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { Pill, Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { AuditEntry } from '@/types';
import { auditDetail, decisionKind, stageBadge } from '@/lib/audit';

const COLS = '130px 160px 1fr 130px';

const pillClassByKind: Record<'primary' | 'allow' | 'danger', string> = {
  primary: 'bg-[rgba(74,144,226,.08)] text-primary',
  allow: 'bg-[rgba(115,169,140,.12)] text-allow-text',
  danger: 'bg-[rgba(214,109,82,.1)] text-danger-text',
};

// โครง shimmer ตอนโหลด log — ทรงตรงกับตาราง desktop + การ์ด mobile
function AuditSkeleton() {
  const rows = Array.from({ length: 7 });
  return (
    <>
      <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
        <div
          className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <div>Time</div>
          <div>Stage</div>
          <div>Detail</div>
          <div>Decision</div>
        </div>
        {rows.map((_, i) => (
          <div
            key={i}
            className={`grid items-center px-[18px] py-3 ${i < rows.length - 1 ? 'border-b border-border' : ''}`}
            style={{ gridTemplateColumns: COLS }}
          >
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-20 rounded-[5px]" />
            <Skeleton className="h-3.5 w-56" />
            <Skeleton className="h-5 w-16 rounded-[5px]" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 sm:hidden">
        {rows.map((_, i) => (
          <div key={i} className="rounded-[10px] border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <Skeleton className="h-5 w-20 rounded-[5px]" />
              <Skeleton className="h-5 w-16 rounded-[5px]" />
            </div>
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="mt-1.5 h-2.5 w-32" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getMyAudit().then((r) => setRows(r.slice().reverse())).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <TopBar
        variant="title"
        title={
          <span className="flex items-center gap-2.5">
            Audit Log
            <span className="hidden text-xs font-normal text-muted-3 sm:inline">ทุกการตัดสินถูกบันทึก · immutable</span>
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-3 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[14.5px] text-danger-text">
            {error}
          </div>
        )}
        {!rows && !error && <AuditSkeleton />}
        {rows && rows.length === 0 && <p className="text-[14.5px] text-muted">ยังไม่มี audit event</p>}

        {rows && rows.length > 0 && (
          <>
            <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
              <div
                className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
                style={{ gridTemplateColumns: COLS }}
              >
                <div>Time</div><div>Stage</div><div>Detail</div><div>Decision</div>
              </div>
              {rows.map((row, i) => {
                const badge = stageBadge(row.stage);
                const kind = decisionKind[row.decision] || 'allow';
                return (
                  <div
                    key={row.requestId + i}
                    className={`grid items-center px-[18px] py-3 text-[14.5px] ${i < rows.length - 1 ? 'border-b border-border' : ''} ${
                      kind === 'warn' ? 'bg-[rgba(224,185,118,.05)]' : kind === 'danger' ? 'bg-[rgba(214,109,82,.04)]' : ''
                    }`}
                    style={{ gridTemplateColumns: COLS }}
                  >
                    <div className="font-mono text-[13px] text-muted">{new Date(row.ts).toLocaleString('th-TH')}</div>
                    <div>
                      <span className={`rounded-[5px] px-2 py-0.5 font-mono text-[12px] font-bold ${pillClassByKind[badge.kind]}`}>{badge.label}</span>
                    </div>
                    <div className="truncate text-ink-soft">{auditDetail(row)}</div>
                    <div><Pill kind={kind}>{row.decision}</Pill></div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2.5 sm:hidden">
              {rows.map((row, i) => {
                const badge = stageBadge(row.stage);
                const kind = decisionKind[row.decision] || 'allow';
                return (
                  <div key={row.requestId + i} className={`rounded-[10px] border border-border bg-surface p-3 ${kind === 'danger' ? 'bg-[rgba(214,109,82,.04)]' : ''}`}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`rounded-[5px] px-2 py-0.5 font-mono text-[12px] font-bold ${pillClassByKind[badge.kind]}`}>{badge.label}</span>
                      <Pill kind={kind}>{row.decision}</Pill>
                    </div>
                    <div className="text-[14.5px]">{auditDetail(row)}</div>
                    <div className="mt-1 font-mono text-[12.5px] text-muted-3">{new Date(row.ts).toLocaleString('th-TH')}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
