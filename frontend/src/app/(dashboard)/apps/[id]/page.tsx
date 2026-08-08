'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/shell/TopBar';
import DeploySuccessArt from '@/components/shell/DeploySuccessArt';
import LogsTab from '@/components/shell/LogsTab';
import VariablesTab from '@/components/shell/VariablesTab';
import DeploySettingsTab from '@/components/shell/DeploySettingsTab';
import DomainsTab from '@/components/shell/DomainsTab';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';
import { GitAppDetail, PipelineStage, ReleaseSummary } from '@/types';
import { useLang, localeTag, type MsgKey } from '@/lib/i18n';

const POLL_MS = 1500;

type TabKey = 'overview' | 'logs' | 'variables' | 'deploy' | 'domains';
const TABS: { key: TabKey; label: MsgKey; icon: string }[] = [
  { key: 'overview', label: 'app.tabOverview', icon: 'ph-git-branch' },
  { key: 'logs', label: 'app.tabLogs', icon: 'ph-terminal-window' },
  { key: 'variables', label: 'app.tabVariables', icon: 'ph-key' },
  { key: 'deploy', label: 'app.tabDeploy', icon: 'ph-arrows-clockwise' },
  { key: 'domains', label: 'app.tabDomains', icon: 'ph-globe' },
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
  const { t, lang } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
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
    if (t === 'logs' || t === 'variables' || t === 'deploy' || t === 'domains') setTab(t);
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
      setError(t('app.manualRedeployHint'));
      changeTab('overview');
      return;
    }
    setError('');
    try {
      await api.deployGitApp(params.id);
      toast.success(t('toast.deployStarted', { name: detail.projectName || detail.repoFullName || params.id }));
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
    const label = r.commitSha ? r.commitSha.slice(0, 7) : t('app.manualUpload');
    const ok = await confirm({
      title: t('confirm.rollbackTitle'),
      body: t('app.rollbackConfirm', { label, when: new Date(r.createdAt).toLocaleString(localeTag(lang)) }),
      confirmLabel: t('app.rollback'),
      danger: true,
    });
    if (!ok) return;
    setRollingBack(true);
    setError('');
    try {
      await api.rollbackApp(params.id, r.id);
      toast.info(t('toast.rollbackStarted', { label }));
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
      <TopBar variant="title" title={t('app.topbarTitle')} backHref="/" right={detail && statusBadge} />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-1 flex items-center gap-2.5 text-[14.5px] text-muted">
            <span className="font-semibold text-ink">{name}</span>
            <span className="font-mono text-[13px] text-muted-3">({params.id})</span>
          </div>
          {/* tab bar — แยก Overview / Logs / Variables ให้ชัด ไม่รวมปุ่มเดียว */}
          <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border-alt">
            {TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => changeTab(item.key)}
                className={`-mb-px flex flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-[14px] font-semibold ${
                  tab === item.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <i className={`ph ${item.icon} text-[16px]`} />
                {t(item.label)}
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
          {tab === 'deploy' &&
            (detail ? (
              <DeploySettingsTab appId={params.id} detail={detail} />
            ) : (
              <p className="text-[14.5px] text-muted">{t('common.loading')}</p>
            ))}
          {tab === 'domains' && (
            <DomainsTab
              appId={params.id}
              liveOriginHost={detail?.liveUrl ? new URL(detail.liveUrl).host : 'live.studiodup.com'}
            />
          )}

          {tab === 'overview' && (
            <>
              <div className="mb-5 text-[19px] font-bold">{t('app.pipelineTitle')}</div>
              {!detail && !error && <p className="text-[14.5px] text-muted">{t('app.loadingPipeline')}</p>}

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
                        {stage.status === 'running' && <span className="text-[13px] text-primary">{t('app.stageRunning')}</span>}
                      </div>
                      {stage.at && stage.status !== 'running' && (
                        <div className={`mt-0.5 text-[13.5px] ${stage.status === 'failed' ? 'text-danger-text' : 'text-muted'}`}>
                          {new Date(stage.at).toLocaleString(localeTag(lang))}
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
              {t('app.deployFailed')}{' '}
              <Link href="/audit" className="font-semibold text-primary">
                {t('audit.title')}
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
                  <i className="ph ph-arrow-square-out" /> {t('app.visitLiveSite')}
                </a>
              )}
            </>
          )}

          {/* ประวัติ release + ปุ่ม rollback — safety net ตอน deploy ตัวใหม่พัง */}
          {detail?.releases && detail.releases.length > 0 && (
            <div className="mt-7">
              <div className="mb-1 text-[15px] font-bold">{t('app.releasesTitle')}</div>
              <div className="mb-2.5 text-[13.5px] text-muted">{t('app.releasesSubtitle')}</div>
              <div className="divide-y divide-border-alt rounded-lg border border-border-alt bg-surface">
                {detail.releases.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <i className={`ph ${r.sourceType === 'git' ? 'ph-git-commit' : 'ph-file-zip'} text-[15px] text-muted`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[14.5px] font-semibold">
                          {r.commitSha ? r.commitSha.slice(0, 7) : t('app.manualUpload')}
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
                        {new Date(r.createdAt).toLocaleString(localeTag(lang))}
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
                        {t('app.rollback')}
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
