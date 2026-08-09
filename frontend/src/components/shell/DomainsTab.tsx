'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { CustomDomain } from '@/types';
import { useLang } from '@/lib/i18n';

const POLL_MS = 4000;

function DomainStatus({ status }: { status: CustomDomain['status'] }) {
  if (status === 'active')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(115,169,140,.12)] px-2.5 py-1 text-[12.5px] font-bold text-allow-text">
        <i className="ph-fill ph-check-circle" /> ACTIVE
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(214,109,82,.1)] px-2.5 py-1 text-[12.5px] font-bold text-danger-text">
        <i className="ph-fill ph-x-circle" /> ERROR
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(74,144,226,.08)] px-2.5 py-1 text-[12.5px] font-bold text-primary">
      <i className="ph ph-spinner gk-spin" /> PENDING
    </span>
  );
}

export default function DomainsTab({ appId, liveOriginHost }: { appId: string; liveOriginHost: string }) {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [domains, setDomains] = useState<CustomDomain[] | null>(null);
  // error ของการโหลดรายการ (กดลองใหม่ได้) — error ของ เพิ่ม/ตรวจ/ลบ ไปเด้ง toast แทน
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setDomains(await api.domains.list(appId));
      setLoadError('');
    } catch (e: any) {
      setLoadError(e.message);
    }
  };

  const retryLoad = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const anyPending = useMemo(() => (domains || []).some((d) => d.status === 'pending'), [domains]);
  useEffect(() => {
    if (anyPending && !pollRef.current) pollRef.current = setInterval(load, POLL_MS);
    else if (!anyPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPending]);

  const add = async () => {
    const domain = input.trim();
    if (!domain) return;
    setBusy(true);
    try {
      setDomains(await api.domains.add(appId, domain));
      toast.success(t('toast.domainAdded', { domain }));
      setInput('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (domain: string) => {
    setBusy(true);
    try {
      setDomains(await api.domains.verify(appId, domain));
      toast.info(t('toast.domainChecked', { domain }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (domain: string) => {
    const ok = await confirm({
      title: t('domains.deleteTitle'),
      body: t('domains.deleteConfirm', { domain }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setDomains(await api.domains.remove(appId, domain));
      toast.success(t('toast.domainDeleted', { domain }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {loadError && <ErrorBanner className="mb-4" message={loadError} onRetry={retryLoad} retrying={retrying} />}

      {/* เพิ่มโดเมน */}
      <div className="mb-5 rounded-xl border border-border-alt bg-surface p-4">
        <div className="mb-2 text-[15px] font-bold">{t('domains.addTitle')}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="app.yourdomain.com"
            aria-label={t('domains.inputLabel')}
            className="min-w-[220px] flex-1 rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[14px] text-ink outline-none focus:border-primary"
          />
          <button
            onClick={add}
            disabled={busy || !input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <i className="ph ph-plus mr-1" /> {t('common.add')}
          </button>
        </div>
        <div className="mt-3 rounded-lg bg-page px-3 py-2 text-[12.5px] text-muted">
          <div className="mb-1 font-semibold text-ink-soft">{t('domains.stepsTitle')}</div>
          <div>{t('domains.step1', { host: liveOriginHost })}</div>
          <div>{t('domains.step2')}</div>
        </div>
      </div>

      {/* รายการโดเมน */}
      {!domains && !loadError && <p className="text-[14px] text-muted">{t('common.loading')}</p>}
      {domains && domains.length === 0 && (
        <EmptyState
          card
          icon="ph ph-globe"
          title={t('domains.emptyTitle')}
          body={t('domains.emptyBody')}
          action={{
            label: t('domains.emptyAction'),
            onClick: () => inputRef.current?.focus(),
            icon: 'ph ph-plus',
          }}
        />
      )}

      <div className="flex flex-col gap-2.5">
        {(domains || []).map((d) => (
          <div key={d.domain} className="rounded-xl border border-border-alt bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <i className="ph ph-globe text-[17px] text-muted" />
              <a
                href={`https://${d.domain}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[14.5px] font-semibold text-ink hover:text-primary"
              >
                {d.domain}
              </a>
              <DomainStatus status={d.status} />
              <div className="ml-auto flex items-center gap-1.5">
                {d.status !== 'active' && (
                  <button
                    onClick={() => verify(d.domain)}
                    disabled={busy}
                    className="rounded-lg border border-border-alt px-2.5 py-1.5 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <i className="ph ph-arrow-clockwise mr-1" /> {t('domains.verify')}
                  </button>
                )}
                <button
                  onClick={() => remove(d.domain)}
                  disabled={busy}
                  className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-danger-text disabled:opacity-50"
                  title={t('domains.deleteTitle')}
                >
                  <i className="ph ph-trash text-[15px]" />
                </button>
              </div>
            </div>
            {d.status === 'pending' && (
              <div className="mt-2 text-[12.5px] text-muted-3">{t('domains.pendingHint')}</div>
            )}
            {d.status === 'error' && d.lastError && (
              <div className="mt-2 rounded-lg bg-[rgba(214,109,82,.06)] px-3 py-2 text-[12.5px] text-danger-text">{d.lastError}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
