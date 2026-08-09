'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { GitAppSummary, ManagedDbSummary } from '@/types';
import { useLang } from '@/lib/i18n';

const POLL_MS = 2500;

const ENGINES: { key: 'postgres' | 'redis' | 'mysql'; label: string; icon: string }[] = [
  { key: 'postgres', label: 'PostgreSQL', icon: 'ph-database' },
  { key: 'redis', label: 'Redis', icon: 'ph-lightning' },
  { key: 'mysql', label: 'MySQL', icon: 'ph-hard-drives' },
];
const engineMeta = (e: string) => ENGINES.find((x) => x.key === e) ?? ENGINES[0];

function StatusBadge({ db }: { db: ManagedDbSummary }) {
  if (db.status === 'running')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(115,169,140,.12)] px-2.5 py-1 text-[12.5px] font-bold text-allow-text">
        <i className="ph-fill ph-check-circle" /> RUNNING
      </span>
    );
  if (db.status === 'provisioning')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(74,144,226,.08)] px-2.5 py-1 text-[12.5px] font-bold text-primary">
        <i className="ph ph-spinner gk-spin" /> PROVISIONING
      </span>
    );
  if (db.status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(214,109,82,.1)] px-2.5 py-1 text-[12.5px] font-bold text-danger-text">
        <i className="ph-fill ph-x-circle" /> ERROR
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-page px-2.5 py-1 text-[12.5px] font-bold text-muted">
      <i className="ph ph-pause-circle" /> STOPPED
    </span>
  );
}

export default function DatabasesPage() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [dbs, setDbs] = useState<ManagedDbSummary[] | null>(null);
  const [apps, setApps] = useState<GitAppSummary[]>([]);
  // แยก error ของ "โหลดรายการ" (กดลองใหม่ได้) ออกจาก error ของการกดปุ่ม (เด้ง toast)
  // ปุ่มลองใหม่ที่ไปโหลดรายการซ้ำไม่ตรงกับสิ่งที่ผู้ใช้เพิ่งกดพลาด เช่นลบไม่สำเร็จ
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [name, setName] = useState('');
  const [engine, setEngine] = useState<'postgres' | 'redis' | 'mysql'>('postgres');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const list = await api.databases.list();
      setDbs(list);
      setLoadError('');
      return list;
    } catch (e: any) {
      setLoadError(e.message);
      return null;
    }
  };

  const retryLoad = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  useEffect(() => {
    load();
    api.listGitApps().then(setApps).catch((e: any) => toast.error(e.message));
  }, []);

  // poll เฉพาะตอนมี DB กำลัง provision อยู่ (ไม่ poll ตลอด)
  const anyProvisioning = useMemo(() => (dbs || []).some((d) => d.status === 'provisioning'), [dbs]);
  useEffect(() => {
    if (anyProvisioning && !pollRef.current) {
      pollRef.current = setInterval(load, POLL_MS);
    } else if (!anyProvisioning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [anyProvisioning]);

  const appName = (id: string) => {
    const a = apps.find((x) => x.id === id);
    return a?.projectName || a?.repoFullName || id;
  };

  const create = async () => {
    const dbName = name.trim();
    if (!dbName) return;
    setCreating(true);
    try {
      await api.databases.create({ name: dbName, engine });
      toast.success(t('toast.dbCreated', { name: dbName }));
      setName('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const copyConnection = async (id: string) => {
    try {
      const c = await api.databases.connection(id);
      await navigator.clipboard.writeText(c.url);
      setCopiedId(id);
      toast.success(t('toast.connectionCopied'));
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1800);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const attach = async (id: string, appId: string) => {
    if (!appId) return;
    setBusyId(id);
    try {
      const updated = await api.databases.attach(id, appId);
      setDbs((prev) => (prev || []).map((d) => (d.id === id ? updated : d)));
      toast.success(t('toast.dbAttached', { name: appName(appId) }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const detach = async (id: string, appId: string) => {
    setBusyId(id);
    try {
      const updated = await api.databases.detach(id, appId);
      setDbs((prev) => (prev || []).map((d) => (d.id === id ? updated : d)));
      toast.success(t('toast.dbDetached', { name: appName(appId) }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (db: ManagedDbSummary) => {
    const ok = await confirm({
      title: t('db.deleteTitle'),
      body: t('db.deleteConfirm', { name: db.name }),
      confirmLabel: t('common.delete'),
      danger: true,
      typeToConfirm: db.name, // ลบ volume ทิ้งด้วย = ข้อมูลหายถาวร
    });
    if (!ok) return;
    setBusyId(db.id);
    try {
      await api.databases.remove(db.id);
      toast.success(t('toast.dbDeleted', { name: db.name }));
      setDbs((prev) => (prev || []).filter((d) => d.id !== db.id));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <TopBar
        variant="title"
        title={
          <span className="flex items-center gap-2.5">
            {t('db.title')}
            <span className="hidden text-xs font-normal text-muted-3 sm:inline">{t('db.subtitle')}</span>
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[820px]">
          {loadError && (
            <ErrorBanner className="mb-4" message={loadError} onRetry={retryLoad} retrying={retrying} />
          )}

          {/* สร้าง database ใหม่ */}
          <div className="mb-6 rounded-xl border border-border-alt bg-surface p-4">
            <div className="mb-3 text-[15px] font-bold">{t('db.createTitle')}</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {ENGINES.map((e) => (
                <button
                  key={e.key}
                  onClick={() => setEngine(e.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold ${
                    engine === e.key
                      ? 'border-primary bg-[rgba(74,144,226,.06)] text-primary'
                      : 'border-border-alt text-ink-soft hover:border-primary/60'
                  }`}
                >
                  <i className={`ph ${e.icon} text-[16px]`} />
                  {e.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder={t('db.namePlaceholder')}
                aria-label={t('db.nameLabel')}
                className="min-w-[220px] flex-1 rounded-lg border border-border-alt bg-page px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
              />
              <button
                onClick={create}
                disabled={creating || !name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
              >
                <i className="ph ph-plus mr-1" /> {t('db.create')}
              </button>
            </div>
          </div>

          {/* รายการ database */}
          {!dbs && !loadError && <p className="text-[14.5px] text-muted">{t('common.loading')}</p>}
          {dbs && dbs.length === 0 && (
            <EmptyState
              card
              icon="ph ph-database"
              title={t('db.emptyTitle')}
              body={t('db.emptyBody')}
              // ฟอร์มสร้างอยู่บนหน้าเดียวกันแล้ว — ปุ่มพาโฟกัสไปที่ช่องชื่อเลย ไม่ต้องให้ผู้ใช้ไล่หา
              action={{
                label: t('db.emptyAction'),
                onClick: () => nameRef.current?.focus(),
                icon: 'ph ph-plus',
              }}
            />
          )}

          <div className="flex flex-col gap-3">
            {(dbs || []).map((db) => {
              const meta = engineMeta(db.engine);
              const attachable = apps.filter((a) => !db.attachedAppIds.includes(a.id));
              return (
                <div key={db.id} className="rounded-xl border border-border-alt bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-page text-primary">
                      <i className={`ph ${meta.icon} text-[20px]`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15.5px] font-bold text-ink">{db.name}</span>
                        <span className="text-[12.5px] text-muted-3">{meta.label}</span>
                        <StatusBadge db={db} />
                      </div>
                      <div className="mt-0.5 font-mono text-[12.5px] text-muted">
                        {db.connection.host}:{db.connection.port}
                        {db.connection.dbName ? ` / ${db.connection.dbName}` : ''}
                      </div>
                      {db.status === 'error' && db.lastError && (
                        <div className="mt-1 text-[12.5px] text-danger-text">{db.lastError}</div>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      <button
                        onClick={() => copyConnection(db.id)}
                        disabled={db.status !== 'running'}
                        title={t('db.copyConnection')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-2.5 py-1.5 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary disabled:opacity-40"
                      >
                        <i className={`ph ${copiedId === db.id ? 'ph-check' : 'ph-copy'}`} />
                        {copiedId === db.id ? t('common.copied') : t('db.connection')}
                      </button>
                      <button
                        onClick={() => remove(db)}
                        disabled={busyId === db.id}
                        title={t('db.deleteTitle')}
                        className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-danger-text disabled:opacity-40"
                      >
                        <i className="ph ph-trash text-[16px]" />
                      </button>
                    </div>
                  </div>

                  {/* attach กับแอป — inject DATABASE_URL/REDIS_URL ให้อัตโนมัติ (มีผล deploy ถัดไป) */}
                  <div className="mt-3 border-t border-border-alt pt-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
                      <i className="ph ph-plugs-connected" /> {t('db.attachTitle')}
                      <span className="font-normal text-muted-3">{t('db.attachInject', { envKey: db.connection.envKey })}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {db.attachedAppIds.map((appId) => (
                        <span
                          key={appId}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt bg-page py-1 pl-2.5 pr-1.5 text-[13px] text-ink-soft"
                        >
                          {appName(appId)}
                          <button
                            onClick={() => detach(db.id, appId)}
                            disabled={busyId === db.id}
                            className="rounded p-0.5 text-muted hover:text-danger-text disabled:opacity-40"
                            title={t('db.detach')}
                          >
                            <i className="ph ph-x text-[13px]" />
                          </button>
                        </span>
                      ))}
                      {attachable.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => attach(db.id, e.target.value)}
                          disabled={busyId === db.id || db.status !== 'running'}
                          aria-label={t('db.attachLabel')}
                          className="rounded-lg border border-dashed border-border-alt bg-surface px-2.5 py-1 text-[13px] text-muted hover:border-primary hover:text-primary disabled:opacity-40"
                        >
                          <option value="">{t('db.attachPlaceholder')}</option>
                          {attachable.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.projectName || a.repoFullName || a.id}
                            </option>
                          ))}
                        </select>
                      )}
                      {db.attachedAppIds.length === 0 && attachable.length === 0 && (
                        <span className="text-[13px] text-muted-3">{t('db.noAppsToAttach')}</span>
                      )}
                    </div>
                    {db.attachedAppIds.length > 0 && (
                      <div className="mt-2 text-[12px] text-muted-3">
                        <i className="ph ph-info mr-1" />
                        {t('db.attachNeedsRedeploy')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 text-[12.5px] text-muted-3">
            <i className="ph ph-lock-simple mr-1" />
            {t('db.internalOnly')}
          </div>
        </div>
      </div>
    </>
  );
}
