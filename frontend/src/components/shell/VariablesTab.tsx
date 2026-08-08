'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { EnvVarSummary } from '@/types';
import { useLang } from '@/lib/i18n';

export default function VariablesTab({
  appId,
  onRequestRedeploy,
}: {
  appId: string;
  onRequestRedeploy: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [vars, setVars] = useState<EnvVarSummary[] | null>(null);
  // error ของการโหลดรายการ (กดลองใหม่ได้) — error ของ เพิ่ม/แก้/ลบ/นำเข้า ไปเด้ง toast แทน
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsRedeploy, setNeedsRedeploy] = useState(false);

  // add form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const newKeyRef = useRef<HTMLInputElement>(null);
  // แก้ค่าทีละ row (เก็บ key ที่กำลังแก้ + ค่าใหม่ — ค่าเดิมไม่เคยรู้ ต้องพิมพ์ใหม่)
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // import .env
  const [importOpen, setImportOpen] = useState(false);
  const [importRaw, setImportRaw] = useState('');

  // สลับแอปแล้วผลของแอปเก่าที่กลับมาช้าต้องไม่ทับของแอปใหม่ — เทียบ appId ตอน response กลับ
  const currentAppId = useRef(appId);
  currentAppId.current = appId;

  const load = useCallback(async (id: string) => {
    try {
      const r = await api.env.list(id);
      if (currentAppId.current !== id) return;
      setVars(r.vars);
      setLoadError('');
    } catch (e: any) {
      if (currentAppId.current !== id) return;
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    load(appId);
  }, [appId, load]);

  const retryLoad = async () => {
    setRetrying(true);
    await load(appId);
    setRetrying(false);
  };

  const run = async (fn: () => Promise<{ vars: EnvVarSummary[]; needsRedeploy?: boolean }>) => {
    setBusy(true);
    try {
      const r = await fn();
      setVars(r.vars);
      if (r.needsRedeploy) setNeedsRedeploy(true);
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addVar = async () => {
    const key = newKey.trim();
    if (!key) return;
    const ok = await run(() => api.env.set(appId, key, newValue));
    if (ok) {
      toast.success(t('toast.varSaved', { key }));
      setNewKey('');
      setNewValue('');
    }
  };

  const saveEdit = async (key: string) => {
    const ok = await run(() => api.env.set(appId, key, editValue));
    if (ok) {
      toast.success(t('toast.varSaved', { key }));
      setEditKey(null);
      setEditValue('');
    }
  };

  const removeVar = async (key: string) => {
    const confirmed = await confirm({
      title: t('confirm.deleteVarTitle'),
      body: t('vars.deleteConfirm', { key }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!confirmed) return;
    if (await run(() => api.env.remove(appId, key))) toast.success(t('toast.varDeleted', { key }));
  };

  const doImport = async () => {
    if (!importRaw.trim()) return;
    const ok = await run(() => api.env.importRaw(appId, importRaw));
    if (ok) {
      toast.success(t('toast.varsImported'));
      setImportRaw('');
      setImportOpen(false);
    }
  };

  return (
    <div>
      {/* แบนเนอร์เตือน redeploy — env ผูกกับ container ตอนสร้าง จึงมีผลรอบ deploy ถัดไป */}
      {needsRedeploy && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[rgba(214,158,82,.35)] bg-[rgba(214,158,82,.1)] px-4 py-3">
          <i className="ph-fill ph-warning-circle text-[18px] text-[#A97B2F] dark:text-[#D9A653]" />
          <div className="min-w-0 flex-1 text-[13.5px] text-ink-soft">{t('vars.needsRedeploy')}</div>
          <button
            onClick={onRequestRedeploy}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-primary-hover"
          >
            <i className="ph ph-rocket-launch mr-1" /> {t('vars.redeployNow')}
          </button>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-bold">{t('vars.title')}</div>
          <div className="text-[13px] text-muted">{t('vars.subtitle')}</div>
        </div>
        <button
          onClick={() => setImportOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
        >
          <i className="ph ph-upload-simple" /> {t('vars.import')}
        </button>
      </div>

      {loadError && <ErrorBanner className="mb-3" message={loadError} onRetry={retryLoad} retrying={retrying} />}

      {/* import .env */}
      {importOpen && (
        <div className="mb-4 rounded-xl border border-border-alt bg-surface p-3">
          <textarea
            value={importRaw}
            onChange={(e) => setImportRaw(e.target.value)}
            placeholder={t('vars.importPlaceholder')}
            aria-label={t('vars.importLabel')}
            rows={5}
            className="w-full resize-y rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={doImport}
              disabled={busy || !importRaw.trim()}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {t('vars.importMerge')}
            </button>
            <button
              onClick={() => {
                setImportOpen(false);
                setImportRaw('');
              }}
              className="rounded-lg border border-border-alt px-3.5 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
            >
              {t('common.cancel')}
            </button>
            <span className="text-[12.5px] text-muted-3">{t('vars.importHint')}</span>
          </div>
        </div>
      )}

      {/* ตารางตัวแปร */}
      <div className="overflow-hidden rounded-xl border border-border-alt bg-surface">
        {vars === null ? (
          <div className="px-4 py-6 text-[13.5px] text-muted">{t('common.loading')}</div>
        ) : vars.length === 0 ? (
          <EmptyState
            icon="ph ph-key"
            title={t('vars.emptyTitle')}
            body={t('vars.emptyBody')}
            className="py-10"
            // ฟอร์มเพิ่มอยู่ใต้ตารางนี้ — ปุ่มโฟกัสไปที่ช่องชื่อตัวแปรให้เลย
            action={{ label: t('vars.emptyAction'), onClick: () => newKeyRef.current?.focus(), icon: 'ph ph-plus' }}
            secondary={{ label: t('vars.import'), onClick: () => setImportOpen(true), icon: 'ph ph-upload-simple' }}
          />
        ) : (
          <div className="divide-y divide-border-alt">
            {vars.map((v) => (
              <div key={v.key} className="flex items-center gap-3 px-4 py-2.5">
                <i className="ph ph-key text-[15px] text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[14px] font-semibold text-ink">{v.key}</div>
                  {editKey === v.key ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(v.key)}
                      placeholder={t('vars.newValuePlaceholder')}
                      aria-label={t('vars.editValueLabel', { key: v.key })}
                      className="mt-1 w-full rounded-md border border-primary bg-page px-2 py-1 font-mono text-[13px] text-ink outline-none"
                    />
                  ) : (
                    <div className="mt-px font-mono text-[13px] tracking-wider text-muted-3">••••••••••••</div>
                  )}
                </div>
                {editKey === v.key ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => saveEdit(v.key)}
                      disabled={busy}
                      className="rounded-md bg-primary px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {t('common.save')}
                    </button>
                    <button
                      onClick={() => {
                        setEditKey(null);
                        setEditValue('');
                      }}
                      className="rounded-md border border-border-alt px-2.5 py-1 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      title={t('vars.editValue')}
                      onClick={() => {
                        setEditKey(v.key);
                        setEditValue('');
                      }}
                      className="rounded-md p-1.5 text-muted hover:bg-page hover:text-primary"
                    >
                      <i className="ph ph-pencil-simple text-[15px]" />
                    </button>
                    <button
                      title={t('common.delete')}
                      onClick={() => removeVar(v.key)}
                      className="rounded-md p-1.5 text-muted hover:bg-page hover:text-danger-text"
                    >
                      <i className="ph ph-trash text-[15px]" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* เพิ่มตัวแปรใหม่ */}
      <div className="mt-4 rounded-xl border border-border-alt bg-surface p-3">
        <div className="mb-2 text-[13.5px] font-semibold text-ink-soft">{t('vars.addTitle')}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={newKeyRef}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="KEY"
            aria-label={t('vars.keyLabel')}
            className="w-[200px] rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <span className="text-muted">=</span>
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVar()}
            placeholder="value"
            aria-label={t('vars.valueLabel')}
            className="min-w-[200px] flex-1 rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <button
            onClick={addVar}
            disabled={busy || !newKey.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <i className="ph ph-plus mr-1" /> {t('common.add')}
          </button>
        </div>
        <div className="mt-2 text-[12.5px] text-muted-3">{t('vars.nameRule')}</div>
      </div>
    </div>
  );
}
