'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { Pill, Skeleton } from '@/components/ui/primitives';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { AuditDecisionFilter, AuditEntry } from '@/types';
import { auditDetail, decisionKind, stageBadge } from '@/lib/audit';
import { useLang, localeTag, type TFunc } from '@/lib/i18n';

const COLS = '130px 160px 1fr 130px';
const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

const DECISION_FILTERS: AuditDecisionFilter[] = ['ALLOW', 'QUARANTINE', 'BLOCK', 'INFO'];

const pillClassByKind: Record<'primary' | 'allow' | 'danger', string> = {
  primary: 'bg-[rgba(74,144,226,.08)] text-primary',
  allow: 'bg-[rgba(115,169,140,.12)] text-allow-text',
  danger: 'bg-[rgba(214,109,82,.1)] text-danger-text',
};

// โครง shimmer ตอนโหลด log — ทรงตรงกับตาราง desktop + การ์ด mobile
function AuditSkeleton({ t }: { t: TFunc }) {
  const rows = Array.from({ length: 7 });
  return (
    <>
      <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
        <div
          className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <div>{t('audit.colTime')}</div>
          <div>{t('audit.colStage')}</div>
          <div>{t('audit.colDetail')}</div>
          <div>{t('audit.colDecision')}</div>
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
  const { t, lang } = useLang();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const [decision, setDecision] = useState<AuditDecisionFilter | ''>('');
  const [query, setQuery] = useState('');
  // คำค้นที่ยิงจริง — หน่วงจากช่องพิมพ์ ไม่ยิง API ทุกตัวอักษร
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // กดลองใหม่ = บวกเลขนี้ให้ effect โหลดซ้ำด้วยตัวกรองเดิม (ไม่ต้องรีเฟรชหน้าแล้วเสียคำค้น)
  const [reloadEpoch, setReloadEpoch] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // นับรอบโหลด — ผลของ request เก่าที่กลับมาช้าต้องไม่ทับผลของรอบใหม่
  const runRef = useRef(0);

  useEffect(() => {
    const run = ++runRef.current;
    setRows(null);
    setError('');
    api
      .getMyAudit({ decision: decision || undefined, q: debouncedQuery, limit: PAGE_SIZE })
      .then((page) => {
        if (run !== runRef.current) return;
        setRows(page.rows);
        setTotal(page.total);
        setHasMore(page.hasMore);
      })
      .catch((e: any) => {
        if (run !== runRef.current) return;
        setError(e.message);
      });
  }, [decision, debouncedQuery, reloadEpoch]);

  const loadMore = useCallback(async () => {
    if (!rows || loadingMore) return;
    const run = runRef.current;
    setLoadingMore(true);
    try {
      const page = await api.getMyAudit({
        decision: decision || undefined,
        q: debouncedQuery,
        offset: rows.length,
        limit: PAGE_SIZE,
      });
      if (run !== runRef.current) return; // ตัวกรองเปลี่ยนระหว่างรอ — ทิ้งผลนี้
      setRows((prev) => [...(prev ?? []), ...page.rows]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [rows, loadingMore, decision, debouncedQuery]);

  const filtering = !!decision || !!debouncedQuery.trim();
  const clearFilters = () => {
    setDecision('');
    setQuery('');
  };

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
      active ? 'border-primary bg-[rgba(74,144,226,.1)] text-primary' : 'border-border text-muted hover:text-ink'
    }`;

  return (
    <>
      <TopBar
        variant="title"
        title={
          <span className="flex items-center gap-2.5">
            {t('audit.title')}
            <span className="hidden text-xs font-normal text-muted-3 sm:inline">{t('audit.subtitle')}</span>
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {/* ตัวกรอง — log โตขึ้นเรื่อยๆ ไล่หาด้วยตาเปล่าไม่ไหว */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-border bg-surface px-3 py-[7px] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 sm:max-w-xs">
            <i className="ph ph-magnifying-glass flex-none text-muted-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('');
                  e.currentTarget.blur();
                }
              }}
              placeholder={t('audit.search')}
              aria-label={t('audit.search')}
              className="min-w-0 flex-1 appearance-none bg-transparent text-[14.5px] text-ink outline-none placeholder:text-muted-3 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setDecision('')} className={chipClass(!decision)}>
              {t('audit.filterAll')}
            </button>
            {DECISION_FILTERS.map((d) => (
              <button key={d} onClick={() => setDecision(d)} className={chipClass(decision === d)}>
                {d}
              </button>
            ))}
          </div>

          {rows && rows.length > 0 && (
            <span className="ml-auto text-[13px] tabular-nums text-muted-3">
              {t('audit.showing', { shown: rows.length, total })}
            </span>
          )}
        </div>

        {error && (
          <ErrorBanner className="mb-3" message={error} onRetry={() => setReloadEpoch((e) => e + 1)} retrying={!rows} />
        )}
        {!rows && !error && <AuditSkeleton t={t} />}

        {rows &&
          rows.length === 0 &&
          (filtering ? (
            <EmptyState
              icon="ph ph-funnel"
              title={t('audit.noMatch')}
              body={t('audit.noMatchBody')}
              secondary={{ label: t('audit.clearFilters'), onClick: clearFilters, icon: 'ph ph-x' }}
            />
          ) : (
            // log ว่างจริง = ยังไม่เคยดีพลอยอะไรเลย → พาไปหน้าที่ทำให้มันไม่ว่าง
            <EmptyState
              icon="ph ph-scroll"
              title={t('audit.emptyTitle')}
              body={t('audit.emptyBody')}
              action={{ label: t('audit.emptyAction'), href: '/deploy', icon: 'ph ph-rocket-launch' }}
            />
          ))}

        {rows && rows.length > 0 && (
          <>
            <div className="hidden overflow-hidden rounded-[11px] border border-border bg-surface sm:block">
              <div
                className="grid border-b border-border px-[18px] py-2.5 text-[12.5px] font-semibold uppercase tracking-[.6px] text-muted-3"
                style={{ gridTemplateColumns: COLS }}
              >
                <div>{t('audit.colTime')}</div><div>{t('audit.colStage')}</div><div>{t('audit.colDetail')}</div><div>{t('audit.colDecision')}</div>
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
                    <div className="font-mono text-[13px] text-muted">{new Date(row.ts).toLocaleString(localeTag(lang))}</div>
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
                    <div className="mt-1 font-mono text-[12.5px] text-muted-3">{new Date(row.ts).toLocaleString(localeTag(lang))}</div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-[7px] border border-border bg-surface px-4 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:bg-page-alt disabled:opacity-50"
                >
                  {loadingMore ? t('audit.loading') : t('audit.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
