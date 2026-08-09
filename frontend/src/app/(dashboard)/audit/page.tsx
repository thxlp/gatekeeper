'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * แปลงวันที่จาก <input type="date"> (YYYY-MM-DD ตามปฏิทินที่ผู้ใช้เห็น) เป็น ISO instant
 * ของขอบวันนั้น **ตาม timezone ของเครื่องผู้ใช้**
 *
 * ต้องคำนวณฝั่งนี้ ไม่ใช่ส่งแค่ "2026-08-04" ให้เซิร์ฟเวอร์เดา — เซิร์ฟเวอร์รัน UTC แต่ ts ใน log
 * เป็น UTC ถ้าเดาขอบวันเป็น UTC คนไทย (UTC+7) จะได้ผลเคลื่อน 7 ชม. (ดีพลอย 4 ส.ค. 02:00
 * ตามเวลาไทย ถูกเก็บเป็น 2026-08-03T19:00Z — เลือกวันที่ 4 ส.ค. ต้องเห็นแถวนี้)
 */
function toDayStart(date: string): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

function toDayEnd(date: string): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  // ปลายวันคือ 23:59:59.999 — ถ้าใช้ 00:00 ของวันนั้น จะกรองแถวของวันที่เลือกทิ้งเกือบหมด
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

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
  // ช่วงวันที่ (YYYY-MM-DD ตามปฏิทินของผู้ใช้) — แปลงเป็น ISO instant ตอนยิง API
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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

  // ตัวกรองชุดเดียวที่ใช้ทั้งโหลดรอบแรกและ "โหลดเพิ่ม" — แยกไว้กันสองที่หลุดไม่ตรงกัน
  const filterArgs = useMemo(
    () => ({
      decision: decision || undefined,
      q: debouncedQuery,
      from: toDayStart(fromDate),
      to: toDayEnd(toDate),
    }),
    [decision, debouncedQuery, fromDate, toDate],
  );

  useEffect(() => {
    const run = ++runRef.current;
    setRows(null);
    setError('');
    api
      .getMyAudit({ ...filterArgs, limit: PAGE_SIZE })
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
  }, [filterArgs, reloadEpoch]);

  const loadMore = useCallback(async () => {
    if (!rows || loadingMore) return;
    const run = runRef.current;
    setLoadingMore(true);
    try {
      const page = await api.getMyAudit({ ...filterArgs, offset: rows.length, limit: PAGE_SIZE });
      if (run !== runRef.current) return; // ตัวกรองเปลี่ยนระหว่างรอ — ทิ้งผลนี้
      setRows((prev) => [...(prev ?? []), ...page.rows]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [rows, loadingMore, filterArgs]);

  const filtering = !!decision || !!debouncedQuery.trim() || !!fromDate || !!toDate;
  const clearFilters = () => {
    setDecision('');
    setQuery('');
    setFromDate('');
    setToDate('');
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

          {/* ช่วงวันที่ — max/min ผูกกันไว้ ให้เบราว์เซอร์กันเลือกช่วงกลับหลังตั้งแต่ต้น
              ไม่ต้องรอให้ผลออกมา 0 แถวแล้วผู้ใช้มางงว่าทำไม */}
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
            <i className="ph ph-calendar-blank flex-none text-muted-3" />
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label={t('audit.filterFrom')}
              title={t('audit.filterFrom')}
              className="rounded-[7px] border border-border bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <span className="text-muted-3">–</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              aria-label={t('audit.filterTo')}
              title={t('audit.filterTo')}
              className="rounded-[7px] border border-border bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            {(fromDate || toDate) && (
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                aria-label={t('audit.clearDates')}
                title={t('audit.clearDates')}
                className="rounded p-1 text-muted-3 transition-colors hover:text-ink"
              >
                <i className="ph ph-x text-[13px]" />
              </button>
            )}
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
