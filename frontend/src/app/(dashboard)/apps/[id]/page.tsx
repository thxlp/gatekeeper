'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/shell/TopBar';
import DeploySuccessArt from '@/components/shell/DeploySuccessArt';
import LogsTab from '@/components/shell/LogsTab';
import VariablesTab from '@/components/shell/VariablesTab';
import { api } from '@/lib/api';
import { GitAppDetail, PipelineStage, ReleaseSummary } from '@/types';

const POLL_MS = 1500;

type TabKey = 'overview' | 'logs' | 'variables';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'ph-git-branch' },
  { key: 'logs', label: 'Logs', icon: 'ph-terminal-window' },
  { key: 'variables', label: 'Variables', icon: 'ph-key' },
];

function StepCircle({ stage }: { stage: PipelineStage }) {
  if (stage.status === 'success') {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[rgba(115,169,140,.14)] text-allow-text">
        <i className="ph-fill ph-check text-[15px]" />
      </div>
    );
  }
  if (stage.status === 'failed') {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[rgba(214,109,82,.12)] text-danger-text">
        <i className="ph-bold ph-x text-[15px]" />
      </div>
    );
  }
  if (stage.status === 'running') {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-primary bg-surface text-primary">
        <i className="ph-bold ph-spinner gk-spin text-[15px]" />
      </div>
    );
  }
  return (
    <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-border-alt bg-surface text-[#C4BFB4] dark:text-[#5A564A]">
      <i className="ph ph-hourglass text-xs" />
    </div>
  );
}

export default function PipelineDetailPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<GitAppDetail | null>(null);
  const [error, setError] = useState('');
  // bump ค่านี้ = restart polling loop (interval เดิมถูก clear ไปแล้วตอน deploy รอบก่อนจบ —
  // กด rollback ต้องเริ่ม poll ใหม่ให้เห็น stage วิ่ง)
  const [pollEpoch, setPollEpoch] = useState(0);
  const [rollingBack, setRollingBack] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // seed แท็บจาก ?tab= (deep-link) ครั้งแรกฝั่ง client
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'logs' || t === 'variables') setTab(t);
  }, []);

  const changeTab = (t: TabKey) => {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === 'overview') u.searchParams.delete('tab');
    else u.searchParams.set('tab', t);
    window.history.replaceState(null, '', u.toString());
  };

  // Redeploy หลังแก้ env — git app สั่ง deploy ใหม่ได้เลย, manual app ต้องอัปโหลด zip ใหม่เอง
  const handleRedeploy = async () => {
    if (!detail) return;
    if ((detail.sourceType ?? 'git') !== 'git') {
      setError('แอปนี้ deploy แบบอัปโหลด .zip — แก้ env แล้วต้องอัปโหลดไฟล์ใหม่ที่หน้า Deploy เพื่อให้ค่ามีผล');
      changeTab('overview');
      return;
    }
    setError('');
    try {
      await api.deployGitApp(params.id);
      changeTab('overview');
      setPollEpoch((e) => e + 1); // เริ่ม poll ใหม่ให้เห็น stage วิ่ง
    } catch (e: any) {
      setError(e.message);
    }
  };

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
  }, [params.id, pollEpoch]);

  const doRollback = async (r: ReleaseSummary) => {
    const label = r.commitSha ? r.commitSha.slice(0, 7) : 'manual upload';
    const ok = confirm(
      `Rollback กลับไป release ${label} (${new Date(r.createdAt).toLocaleString('th-TH')})?\n\n` +
        'หมายเหตุ: rollback ใช้โค้ดเวอร์ชันนั้น แต่ env vars/addons เป็นค่าปัจจุบัน ไม่ใช่ค่าตอน deploy รอบนั้น',
    );
    if (!ok) return;
    setRollingBack(true);
    setError('');
    try {
      await api.rollbackApp(params.id, r.id);
      setPollEpoch((e) => e + 1); // เริ่ม poll ใหม่ให้เห็น production_deploy วิ่ง
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRollingBack(false);
    }
  };

  const stages = detail?.pipelineStages;
  const name = detail?.projectName || detail?.repoFullName || params.id;

  const statusBadge =
    detail?.pipelineStatus === 'success' ? (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.1)] px-3 py-1 text-[13px] font-bold text-allow-text">
        <i className="ph-fill ph-check-circle" /> LIVE
      </span>
    ) : detail?.pipelineStatus === 'failed' ? (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(214,109,82,.3)] bg-[rgba(214,109,82,.08)] px-3 py-1 text-[13px] font-bold text-danger-text">
        <i className="ph-fill ph-x-circle" /> FAILED
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(74,144,226,.25)] bg-[rgba(74,144,226,.08)] px-3 py-1 text-[13px] font-bold text-primary">
        <i className="ph ph-spinner gk-spin" /> DEPLOYING
      </span>
    );

  return (
    <>
      <TopBar variant="title" title="Pipeline" backHref="/" right={detail && statusBadge} />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-1 flex items-center gap-2.5 text-[14.5px] text-muted">
            <span className="font-semibold text-ink">{name}</span>
            <span className="font-mono text-[13px] text-muted-3">({params.id})</span>
          </div>
          {/* tab bar — แยก Overview / Logs / Variables ให้ชัด ไม่รวมปุ่มเดียว */}
          <div className="mb-5 flex gap-1 border-b border-border-alt">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-[14px] font-semibold ${
                  tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <i className={`ph ${t.icon} text-[16px]`} />
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[14.5px] text-danger-text">
              {error}
            </div>
          )}

          {tab === 'logs' && <LogsTab appId={params.id} />}
          {tab === 'variables' && <VariablesTab appId={params.id} onRequestRedeploy={handleRedeploy} />}

          {tab === 'overview' && (
            <>
              <div className="mb-5 text-[19px] font-bold">Gatekeeper Pipeline</div>
              {!detail && !error && <p className="text-[14.5px] text-muted">กำลังโหลดสถานะ pipeline…</p>}

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
                          className={`text-[15.5px] font-semibold ${
                            stage.status === 'running' ? 'text-primary-hover' : stage.status === 'pending' ? 'text-muted-3' : ''
                          }`}
                        >
                          {stage.label}
                        </span>
                        {stage.status === 'running' && <span className="text-[13px] text-primary">กำลังดำเนินการ…</span>}
                      </div>
                      {stage.at && stage.status !== 'running' && (
                        <div className={`mt-0.5 text-[13.5px] ${stage.status === 'failed' ? 'text-danger-text' : 'text-muted'}`}>
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
            <div className="mt-2 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-4 py-3 text-[14.5px] text-ink-soft">
              Deploy ไม่สำเร็จ — เหตุผลโดยละเอียด (findings/score) ดูได้ที่{' '}
              <Link href="/audit" className="font-semibold text-primary">
                Audit Log
              </Link>
            </div>
          )}

          {detail?.pipelineStatus === 'success' && (
            <>
              <DeploySuccessArt />
              {detail.liveUrl && (
                <a
                  href={detail.liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  <i className="ph ph-arrow-square-out" /> Visit Live Site
                </a>
              )}
            </>
          )}

          {/* ประวัติ release + ปุ่ม rollback — safety net ตอน deploy ตัวใหม่พัง */}
          {detail?.releases && detail.releases.length > 0 && (
            <div className="mt-7">
              <div className="mb-1 text-[15px] font-bold">Releases</div>
              <div className="mb-2.5 text-[13.5px] text-muted">
                เก็บเวอร์ชันล่าสุดไว้ให้กดกลับได้ — rollback ไม่ rebuild ใช้ image เดิมที่ผ่านการสแกนแล้ว
              </div>
              <div className="divide-y divide-border-alt rounded-lg border border-border-alt bg-surface">
                {detail.releases.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <i className={`ph ${r.sourceType === 'git' ? 'ph-git-commit' : 'ph-file-zip'} text-[15px] text-muted`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[14.5px] font-semibold">
                          {r.commitSha ? r.commitSha.slice(0, 7) : 'manual upload'}
                        </span>
                        {r.active && (
                          <span className="rounded-md border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.1)] px-1.5 py-px text-[12px] font-bold text-allow-text">
                            ACTIVE
                          </span>
                        )}
                        {r.degraded && (
                          <span className="rounded-md border border-[rgba(214,158,82,.35)] bg-[rgba(214,158,82,.1)] px-1.5 py-px text-[12px] font-bold text-[#A97B2F] dark:text-[#D9A653]">
                            DEGRADED
                          </span>
                        )}
                      </div>
                      <div className="mt-px text-[13px] text-muted">
                        {new Date(r.createdAt).toLocaleString('th-TH')}
                        {r.branch ? ` · ${r.branch}` : ''}
                      </div>
                    </div>
                    {!r.active && (
                      <button
                        onClick={() => doRollback(r)}
                        disabled={rollingBack || detail.pipelineStatus === 'deploying'}
                        className="rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <i className="ph ph-arrow-counter-clockwise mr-1" />
                        Rollback
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
