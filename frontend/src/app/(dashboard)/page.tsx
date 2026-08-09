'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/shell/TopBar';
import { Pill, Skeleton } from '@/components/ui/primitives';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import CopyField from '@/components/ui/CopyField';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';
import { GitAppSummary } from '@/types';
import { useLang, localeTag, type MsgKey, type TFunc } from '@/lib/i18n';
import { RUNTIMES } from '@/lib/runtimes';

const LIST_POLL_MS = 4000;
const COLS = '2.2fr 1fr 1fr 1.2fr 1.3fr 90px';


type StatusKind = 'allow' | 'primary' | 'danger' | 'muted';

const STATUS_META: Record<string, { label: string; kind: StatusKind }> = {
  idle: { label: 'IDLE', kind: 'muted' },
  deploying: { label: 'DEPLOYING', kind: 'primary' },
  success: { label: 'LIVE', kind: 'allow' },
  failed: { label: 'FAILED', kind: 'danger' },
};

const rowTintByKind: Record<StatusKind, string> = {
  allow: '',
  primary: '',
  muted: '',
  danger: 'bg-[rgba(214,109,82,.04)]',
};

const dotByKind: Record<StatusKind, string> = {
  allow: 'bg-allow-dot',
  primary: 'bg-primary',
  muted: 'bg-muted-3',
  danger: 'bg-danger-dot',
};

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const { t, lang } = useLang();
  const [apps, setApps] = useState<GitAppSummary[] | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setApps(await api.listGitApps());
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  // ลองใหม่ = โหลดรายการซ้ำในที่เดิม ไม่ต้องรีเฟรชทั้งหน้า (คำค้นที่พิมพ์ไว้ยังอยู่)
  const retry = useCallback(async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // มีแอปกำลัง deploy อยู่ → poll รายการซ้ำเพื่อให้สถานะบนตารางขยับสด
  useEffect(() => {
    if (!apps?.some((a) => a.pipelineStatus === 'deploying')) return;
    const t = setInterval(refresh, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [apps, refresh]);

  // ชื่อบนแท็บของหน้านี้ตั้งที่ (dashboard)/layout.tsx แล้ว ("โปรเจกต์ · Gatekeeper")
  // เดิมหน้านี้เขียนทับด้วยชื่อโปรเจกต์ล่าสุด ทำให้แท็บไม่บอกว่ากำลังอยู่หน้าไหน แถมค้าง
  // ติดไปหน้าอื่นด้วยเพราะ SPA ไม่รีเซ็ต title ให้

  // ค้นหาแบบ client-side: รายการทั้งหมดอยู่ในมืออยู่แล้ว (endpoint เดียวคืนทุกแอปของ user)
  // จึงไม่ต้องยิง API ซ้ำ — คำค้นเทียบกับทุกอย่างที่ผู้ใช้เห็นบนแถว ไม่ใช่แค่ชื่อ
  const visible = useMemo(() => {
    if (!apps) return null;
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      [a.projectName, a.repoFullName, a.id, a.branch, a.runtime, a.liveUrl]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [apps, query]);

  const searching = query.trim().length > 0;

  const live = apps?.filter((a) => a.pipelineStatus === 'success').length ?? 0;
  const deploying = apps?.filter((a) => a.pipelineStatus === 'deploying').length ?? 0;
  const failed = apps?.filter((a) => a.pipelineStatus === 'failed').length ?? 0;

  const statCards: { icon: string; tint: string; value: number; label: MsgKey }[] = [
    { icon: 'ph-fill ph-check-circle', tint: 'bg-[rgba(115,169,140,.14)] text-allow-text', value: live, label: 'projects.statLive' },
    { icon: 'ph ph-spinner', tint: 'bg-[rgba(74,144,226,.1)] text-primary', value: deploying, label: 'projects.statDeploying' },
    { icon: 'ph-fill ph-x-circle', tint: 'bg-[rgba(214,109,82,.12)] text-danger-text', value: failed, label: 'projects.statFailed' },
    { icon: 'ph ph-squares-four', tint: 'bg-[rgba(150,144,140,.15)] text-muted', value: apps?.length ?? 0, label: 'projects.statTotal' },
  ];

  return (
    <>
      <TopBar variant="actions" search={query} onSearchChange={setQuery} />

      <div className="flex items-end justify-between px-6 pt-5">
        <div>
          <h1 className="text-[21px] font-bold tracking-[-.3px]">{t('projects.title')}</h1>
          <div className="mt-[3px] text-[14.5px] text-muted">
            {searching && visible
              ? t('projects.searchCount', { n: visible.length, total: apps?.length ?? 0 })
              : t('projects.subtitle')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 px-6 py-4 sm:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-[10px] border border-border bg-surface px-[15px] py-[13px]">
            <div className={`flex h-[34px] w-[34px] items-center justify-center rounded-[9px] ${s.tint}`}>
              <i className={`${s.icon} text-[17px]`} />
            </div>
            <div>
              <div className="text-[17px] font-bold leading-none">{s.value}</div>
              <div className="mt-1 text-[13px] text-muted">{t(s.label)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 pt-1.5">
        {error && <ErrorBanner className="mb-3" message={error} onRetry={retry} retrying={retrying} />}

        {!apps && !error && <ProjectsSkeleton t={t} />}

        {apps && apps.length === 0 && (
          <EmptyState
            icon="ph ph-rocket-launch"
            title={t('projects.emptyTitle')}
            body={t('projects.emptyBody')}
            action={{ label: t('projects.newProject'), href: '/deploy', icon: 'ph ph-plus' }}
          />
        )}

        {/* มีโปรเจกต์อยู่ แต่คำค้นไม่ตรงสักอัน — คนละสถานะกับ "ยังไม่มีโปรเจกต์" ข้างบน */}
        {apps && apps.length > 0 && visible && visible.length === 0 && (
          <EmptyState
            icon="ph ph-magnifying-glass"
            title={t('projects.searchEmptyTitle', { query: query.trim() })}
            body={t('projects.searchEmptyBody')}
            secondary={{ label: t('projects.searchClearAll'), onClick: () => setQuery('') }}
          />
        )}

        {visible && visible.length > 0 && (
          <>
            {/* table (desktop) */}
            <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
              <div
                className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
                style={{ gridTemplateColumns: COLS }}
              >
                <div>{t('projects.colApp')}</div>
                <div>{t('projects.colSource')}</div>
                <div>{t('projects.colRuntime')}</div>
                <div>{t('projects.colStatus')}</div>
                <div>{t('projects.colUpdated')}</div>
                <div className="text-right">{t('projects.colActions')}</div>
              </div>

              {visible.map((app, i) => {
                const meta = STATUS_META[app.pipelineStatus || 'idle'] || STATUS_META.idle;
                const isGit = app.sourceType === 'git';
                const name = app.projectName || app.repoFullName || app.id;
                const subline = app.pipelineStatus === 'success' && app.liveUrl ? app.liveUrl : app.repoFullName || app.projectName || '';
                const editing = editingId === app.id;

                return (
                  <div key={app.id}>
                    <div
                      className={`grid items-center px-[18px] py-[13px] text-[14.5px] ${
                        i < visible.length - 1 && !editing ? 'border-b border-border' : ''
                      } ${rowTintByKind[meta.kind]}`}
                      style={{ gridTemplateColumns: COLS }}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`h-2 w-2 flex-none rounded-full ${dotByKind[meta.kind]}`} />
                        <div className="min-w-0">
                          <Link href={`/apps/${app.id}`} className="text-[15px] font-semibold text-ink hover:text-primary">
                            {name}
                          </Link>
                          <div className="truncate font-mono text-[13px] text-muted-3">{subline}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-soft">
                        {isGit ? (
                          <>
                            <i className="ph-fill ph-github-logo" /> {app.branch}
                          </>
                        ) : (
                          <>
                            <i className="ph ph-package" /> {t('projects.sourceManual')}
                          </>
                        )}
                      </div>
                      <div className="text-ink-soft">{app.runtime}</div>
                      <div>
                        <Pill kind={meta.kind}>
                          {meta.label}
                        </Pill>
                      </div>
                      <div className="text-[13.5px] text-muted">
                        {app.updatedAt ? new Date(app.updatedAt).toLocaleString(localeTag(lang)) : '—'}
                      </div>
                      <RowActions
                        app={app}
                        t={t}
                        onChanged={refresh}
                        onEdit={isGit ? () => setEditingId(editing ? null : app.id) : undefined}
                      />
                    </div>
                    {editing && (
                      <div className={`px-[18px] pb-4 ${i < visible.length - 1 ? 'border-b border-border' : ''}`}>
                        <EditRow app={app} t={t} onCancel={() => setEditingId(null)} onSaved={() => { setEditingId(null); refresh(); }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* card list (mobile) */}
            <div className="flex flex-col gap-2.5 sm:hidden">
              {visible.map((app) => {
                const meta = STATUS_META[app.pipelineStatus || 'idle'] || STATUS_META.idle;
                const name = app.projectName || app.repoFullName || app.id;
                return (
                  <Link
                    key={app.id}
                    href={`/apps/${app.id}`}
                    className={`flex items-center gap-3 rounded-[10px] border border-border bg-surface p-3 ${rowTintByKind[meta.kind]}`}
                  >
                    <span className={`h-2 w-2 flex-none rounded-full ${dotByKind[meta.kind]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{name}</div>
                      <div className="truncate font-mono text-[13px] text-muted-3">
                        {app.repoFullName || app.projectName}
                      </div>
                    </div>
                    <Pill kind={meta.kind === 'muted' ? 'muted' : meta.kind === 'primary' ? 'primary' : meta.kind}>
                      {meta.label}
                    </Pill>
                    <i className="ph ph-caret-right text-muted-3" />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// โครง shimmer ตอนโหลดรายการ — ทรงตรงกับตาราง desktop + การ์ด mobile (กัน layout shift)
function ProjectsSkeleton({ t }: { t: TFunc }) {
  const rows = Array.from({ length: 4 });
  return (
    <>
      <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
        <div
          className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <div>{t('projects.colApp')}</div>
          <div>{t('projects.colSource')}</div>
          <div>{t('projects.colRuntime')}</div>
          <div>{t('projects.colStatus')}</div>
          <div>{t('projects.colUpdated')}</div>
          <div className="text-right">{t('projects.colActions')}</div>
        </div>
        {rows.map((_, i) => (
          <div
            key={i}
            className={`grid items-center px-[18px] py-[15px] ${i < rows.length - 1 ? 'border-b border-border' : ''}`}
            style={{ gridTemplateColumns: COLS }}
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-40" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-5 w-16 rounded-[5px]" />
            <Skeleton className="h-3.5 w-28" />
            <div className="flex justify-end">
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 sm:hidden">
        {rows.map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-[10px] border border-border bg-surface p-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-40" />
            </div>
            <Skeleton className="h-5 w-14 rounded-[5px]" />
          </div>
        ))}
      </div>
    </>
  );
}

function RowActions({
  app,
  t,
  onChanged,
  onEdit,
}: {
  app: GitAppSummary;
  t: TFunc;
  onChanged: () => void;
  onEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const isGit = app.sourceType === 'git';
  const deploying = app.pipelineStatus === 'deploying';
  const label = app.projectName || app.repoFullName || app.id;
  const iconBtn =
    'rounded-md border px-2 py-1.5 cursor-pointer transition-colors border-border bg-surface text-muted disabled:opacity-40 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

  const deployNow = async () => {
    setBusy(true);
    try {
      await api.deployGitApp(app.id);
      toast.success(t('toast.deployStarted', { name: label }));
      onChanged();
    } catch (e: any) {
      // เดิม try/finally ไม่มี catch — ดีพลอยพลาดแล้วเงียบสนิท (unhandled rejection)
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('confirm.deleteProjectTitle'),
      body: t(isGit ? 'projects.deleteConfirmGit' : 'projects.deleteConfirm', { name: label }),
      note: t('confirm.deleteProjectNote'),
      confirmLabel: t('common.delete'),
      danger: true,
      typeToConfirm: label, // ลบแล้วกู้ไม่ได้ — บังคับพิมพ์ชื่อยืนยัน
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteGitApp(app.id);
      toast.success(t('toast.projectDeleted', { name: label }));
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex justify-end gap-1">
      {isGit ? (
        <button className={iconBtn} aria-label={t('projects.redeploy')} onClick={deployNow} disabled={busy || deploying}>
          <i className={`ph ph-arrows-clockwise ${deploying ? 'gk-spin' : ''}`} />
        </button>
      ) : (
        <Link href={`/deploy?appId=${app.id}`} className={iconBtn} aria-label={t('projects.redeploy')}>
          <i className="ph ph-arrows-clockwise" />
        </Link>
      )}
      {onEdit && (
        <button className={iconBtn} aria-label={t('common.edit')} onClick={onEdit}>
          <i className="ph ph-pencil-simple" />
        </button>
      )}
      <button className={iconBtn} aria-label={t('common.delete')} onClick={remove} disabled={busy}>
        <i className="ph ph-trash" />
      </button>
    </div>
  );
}

function EditRow({
  app,
  t,
  onCancel,
  onSaved,
}: {
  app: GitAppSummary;
  t: TFunc;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [branch, setBranch] = useState(app.branch || 'main');
  const [runtime, setRuntime] = useState(app.runtime || 'node');
  const [enabled, setEnabled] = useState(app.enabled);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  // แถวแก้ไขเปิดได้ทีละหลายแถว → id ต้องไม่ชนกัน ไม่งั้น label ชี้ไปช่องของแถวอื่น
  const fieldId = useId();

  const save = async () => {
    setError('');
    setLoading(true);
    try {
      await api.updateGitApp(app.id, { branch: branch.trim() || 'main', runtime, enabled });
      toast.success(t('toast.appUpdated'));
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-primary/40 bg-page-alt p-4">
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${fieldId}-branch`} className="mb-1 block text-xs font-semibold">
            {t('projects.branch')}
          </label>
          <input
            id={`${fieldId}-branch`}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-runtime`} className="mb-1 block text-xs font-semibold">
            {t('projects.runtime')}
          </label>
          <select
            id={`${fieldId}-runtime`}
            value={runtime}
            onChange={(e) => setRuntime(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {RUNTIMES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pt-5 text-[14.5px] text-ink-soft">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('projects.enabled')}
        </label>
      </div>

      {app.webhookUrl && <div className="mb-3"><CopyField label="Webhook URL" value={app.webhookUrl} /></div>}

      {error && (
        <div className="mb-3 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14px] text-danger-text">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-border bg-surface py-2 text-[14.5px] font-medium text-ink-soft">
          {t('common.cancel')}
        </button>
        <button
          onClick={save}
          disabled={loading}
          className="flex-1 rounded-lg bg-primary py-2 text-[14.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
