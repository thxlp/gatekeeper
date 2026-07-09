'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/shell/TopBar';
import { api } from '@/lib/api';
import { GitAppDetail, PipelineStage } from '@/types';

const POLL_MS = 1500;

function StepCircle({ stage }: { stage: PipelineStage }) {
  if (stage.status === 'success') {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[rgba(115,169,140,.14)] text-allow-text">
        <i className="ph-fill ph-check text-[13px]" />
      </div>
    );
  }
  if (stage.status === 'failed') {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[rgba(214,109,82,.12)] text-danger-text">
        <i className="ph-bold ph-x text-[13px]" />
      </div>
    );
  }
  if (stage.status === 'running') {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-primary bg-white text-primary">
        <i className="ph-bold ph-spinner gk-spin text-[13px]" />
      </div>
    );
  }
  return (
    <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-border-alt bg-white text-[#C4BFB4]">
      <i className="ph ph-hourglass text-xs" />
    </div>
  );
}

export default function PipelineDetailPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<GitAppDetail | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await api.getApp(params.id);
        if (cancelled) return;
        setDetail(d);
        if (d.pipelineStatus !== 'deploying' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [params.id]);

  const stages = detail?.pipelineStages;
  const name = detail?.projectName || detail?.repoFullName || params.id;

  const statusBadge =
    detail?.pipelineStatus === 'success' ? (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.1)] px-3 py-1 text-[11px] font-bold text-allow-text">
        <i className="ph-fill ph-check-circle" /> LIVE
      </span>
    ) : detail?.pipelineStatus === 'failed' ? (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(214,109,82,.3)] bg-[rgba(214,109,82,.08)] px-3 py-1 text-[11px] font-bold text-danger-text">
        <i className="ph-fill ph-x-circle" /> FAILED
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(74,144,226,.25)] bg-[rgba(74,144,226,.08)] px-3 py-1 text-[11px] font-bold text-primary">
        <i className="ph ph-spinner gk-spin" /> DEPLOYING
      </span>
    );

  return (
    <>
      <TopBar variant="title" title="Pipeline" backHref="/" right={detail && statusBadge} />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-1 flex items-center gap-2.5 text-[12.5px] text-muted">
            <span className="font-semibold text-ink">{name}</span>
            <span className="font-mono text-[11px] text-muted-3">({params.id})</span>
          </div>
          <div className="mb-5 text-[19px] font-bold">Gatekeeper Pipeline</div>

          {error && (
            <div className="mb-4 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[12.5px] text-danger-text">
              {error}
            </div>
          )}

          {!detail && !error && <p className="text-[12.5px] text-muted">กำลังโหลดสถานะ pipeline…</p>}

          {stages && (
            <div className="flex flex-col">
              {stages.map((stage, i) => {
                const last = i === stages.length - 1;
                return (
                  <div key={stage.key} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <StepCircle stage={stage} />
                      {!last && (
                        <div className={`w-0.5 flex-1 ${stage.status === 'success' ? 'bg-allow-dot/35' : 'bg-border-alt'}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-[18px]">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-[13.5px] font-semibold ${
                            stage.status === 'running' ? 'text-primary-hover' : stage.status === 'pending' ? 'text-[#B7B2A7]' : ''
                          }`}
                        >
                          {stage.label}
                        </span>
                        {stage.status === 'running' && <span className="text-[11px] text-primary">กำลังดำเนินการ…</span>}
                      </div>
                      {stage.at && stage.status !== 'running' && (
                        <div className={`mt-0.5 text-[11.5px] ${stage.status === 'failed' ? 'text-danger-text' : 'text-muted'}`}>
                          {new Date(stage.at).toLocaleString('th-TH')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {detail?.pipelineStatus === 'failed' && (
            <div className="mt-2 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-4 py-3 text-[12.5px] text-ink-soft">
              Deploy ไม่สำเร็จ — เหตุผลโดยละเอียด (findings/score) ดูได้ที่{' '}
              <Link href="/audit" className="font-semibold text-primary">
                Audit Log
              </Link>
            </div>
          )}

          {detail?.pipelineStatus === 'success' && detail.liveUrl && (
            <a
              href={detail.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              <i className="ph ph-arrow-square-out" /> Visit Live Site
            </a>
          )}
        </div>
      </div>
    </>
  );
}
