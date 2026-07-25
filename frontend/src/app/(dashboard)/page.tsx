'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/shell/TopBar';
import { Pill, Skeleton } from '@/components/ui/primitives';
import CopyField from '@/components/ui/CopyField';
import { api } from '@/lib/api';
import { GitAppSummary } from '@/types';

const LIST_POLL_MS = 4000;
const COLS = '2.2fr 1fr 1fr 1.2fr 1.3fr 90px';

// node/static only — python/docker return runtime_not_yet_supported server-side
// (backend/src/deploy/docker-runtime.service.ts)
const RUNTIMES = ['node', 'static'];

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
  const [apps, setApps] = useState<GitAppSummary[] | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setApps(await api.listGitApps());
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // มีแอปกำลัง deploy อยู่ → poll รายการซ้ำเพื่อให้สถานะบนตารางขยับสด
  useEffect(() => {
    if (!apps?.some((a) => a.pipelineStatus === 'deploying')) return;
    const t = setInterval(refresh, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [apps, refresh]);

  // browser tab title: โปรเจกต์ล่าสุด (เรียงตาม updatedAt/createdAt) แทนคำว่า
  // "Gatekeeper" คงที่ — ถ้ายังไม่มีโปรเจกต์เลยให้ตั้งเป็น "Deploy" ชวนกดปุ่ม deploy บนหน้า
  useEffect(() => {
    if (!apps) return;
    if (apps.length === 0) {
      document.title = 'Deploy';
      return;
    }
    const latest = [...apps].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime(),
    )[0];
    document.title = latest.projectName || latest.repoFullName || latest.id;
  }, [apps]);

  const live = apps?.filter((a) => a.pipelineStatus === 'success').length ?? 0;
  const deploying = apps?.filter((a) => a.pipelineStatus === 'deploying').length ?? 0;
  const failed = apps?.filter((a) => a.pipelineStatus === 'failed').length ?? 0;

  const statCards = [
    { icon: 'ph-fill ph-check-circle', tint: 'bg-[rgba(115,169,140,.14)] text-allow-text', value: live, label: 'live' },
    { icon: 'ph ph-spinner', tint: 'bg-[rgba(74,144,226,.1)] text-primary', value: deploying, label: 'deploying' },
    { icon: 'ph-fill ph-x-circle', tint: 'bg-[rgba(214,109,82,.12)] text-danger-text', value: failed, label: 'failed' },
    { icon: 'ph ph-squares-four', tint: 'bg-[rgba(150,144,140,.15)] text-muted', value: apps?.length ?? 0, label: 'total' },
  ];

  return (
    <>
      <TopBar variant="actions" />

      <div className="flex items-end justify-between px-6 pt-5">
        <div>
          <div className="text-[21px] font-bold tracking-[-.3px]">Projects</div>
          <div className="mt-[3px] text-[14.5px] text-muted">
            ทุก deploy วิ่งผ่าน security pipeline ก่อนขึ้น live
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
              <div className="mt-1 text-[13px] text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 pt-1.5">
        {error && (
          <div className="mb-3 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[14.5px] text-danger-text">
            {error}
          </div>
        )}

        {!apps && !error && <ProjectsSkeleton />}

        {apps && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <i className="ph ph-rocket-launch text-4xl text-muted" />
            <div>
              <p className="text-sm font-semibold">ยังไม่มีโปรเจกต์</p>
              <p className="mt-1 text-xs text-muted">
                deploy จาก GitHub repo หรืออัปโหลด zip — ทุก deploy วิ่งผ่าน security pipeline
              </p>
            </div>
            <Link
              href="/deploy"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[15px] font-semibold text-white hover:bg-primary-hover"
            >
              <i className="ph ph-plus" /> New Project
            </Link>
          </div>
        )}

        {apps && apps.length > 0 && (
          <>
            {/* table (desktop) */}
            <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
              <div
                className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
                style={{ gridTemplateColumns: COLS }}
              >
                <div>App</div>
                <div>Source</div>
                <div>Runtime</div>
                <div>Status</div>
                <div>Last updated</div>
                <div className="text-right">Actions</div>
              </div>

              {apps.map((app, i) => {
                const meta = STATUS_META[app.pipelineStatus || 'idle'] || STATUS_META.idle;
                const isGit = app.sourceType === 'git';
                const name = app.projectName || app.repoFullName || app.id;
                const subline = app.pipelineStatus === 'success' && app.liveUrl ? app.liveUrl : app.repoFullName || app.projectName || '';
                const editing = editingId === app.id;

                return (
                  <div key={app.id}>
                    <div
                      className={`grid items-center px-[18px] py-[13px] text-[14.5px] ${
                        i < apps.length - 1 && !editing ? 'border-b border-border' : ''
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
                            <i className="ph ph-package" /> manual
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
                        {app.updatedAt ? new Date(app.updatedAt).toLocaleString('th-TH') : '—'}
                      </div>
                      <RowActions
                        app={app}
                        onChanged={refresh}
                        onEdit={isGit ? () => setEditingId(editing ? null : app.id) : undefined}
                      />
                    </div>
                    {editing && (
                      <div className={`px-[18px] pb-4 ${i < apps.length - 1 ? 'border-b border-border' : ''}`}>
                        <EditRow app={app} onCancel={() => setEditingId(null)} onSaved={() => { setEditingId(null); refresh(); }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* card list (mobile) */}
            <div className="flex flex-col gap-2.5 sm:hidden">
              {apps.map((app) => {
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
function ProjectsSkeleton() {
  const rows = Array.from({ length: 4 });
  return (
    <>
      <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
        <div
          className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <div>App</div>
          <div>Source</div>
          <div>Runtime</div>
          <div>Status</div>
          <div>Last updated</div>
          <div className="text-right">Actions</div>
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
  onChanged,
  onEdit,
}: {
  app: GitAppSummary;
  onChanged: () => void;
  onEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isGit = app.sourceType === 'git';
  const deploying = app.pipelineStatus === 'deploying';
  const iconBtn = 'rounded-md border px-2 py-1.5 cursor-pointer transition-colors border-border bg-surface text-muted disabled:opacity-40';

  const deployNow = async () => {
    setBusy(true);
    try {
      await api.deployGitApp(app.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const label = app.projectName || app.repoFullName || app.id;
    if (!confirm(`ลบ ${label} ออกจากระบบ?${isGit ? ' webhook auto-deploy จะถูกยกเลิกด้วย' : ''}`)) return;
    setBusy(true);
    try {
      await api.deleteGitApp(app.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex justify-end gap-1">
      {isGit ? (
        <button className={iconBtn} aria-label="Redeploy" onClick={deployNow} disabled={busy || deploying}>
          <i className={`ph ph-arrows-clockwise ${deploying ? 'gk-spin' : ''}`} />
        </button>
      ) : (
        <Link href={`/deploy?appId=${app.id}`} className={iconBtn} aria-label="Redeploy">
          <i className="ph ph-arrows-clockwise" />
        </Link>
      )}
      {onEdit && (
        <button className={iconBtn} aria-label="Edit" onClick={onEdit}>
          <i className="ph ph-pencil-simple" />
        </button>
      )}
      <button className={iconBtn} aria-label="Delete" onClick={remove} disabled={busy}>
        <i className="ph ph-trash" />
      </button>
    </div>
  );
}

function EditRow({
  app,
  onCancel,
  onSaved,
}: {
  app: GitAppSummary;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [branch, setBranch] = useState(app.branch || 'main');
  const [runtime, setRuntime] = useState(app.runtime || 'node');
  const [enabled, setEnabled] = useState(app.enabled);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setError('');
    setLoading(true);
    try {
      await api.updateGitApp(app.id, { branch: branch.trim() || 'main', runtime, enabled });
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
          <div className="mb-1 text-xs font-semibold">Branch</div>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold">Runtime</div>
          <select
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
          เปิดใช้งาน (auto-deploy)
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
          Cancel
        </button>
        <button
          onClick={save}
          disabled={loading}
          className="flex-1 rounded-lg bg-primary py-2 text-[14.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? 'กำลังบันทึก…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
