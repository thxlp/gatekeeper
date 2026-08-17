'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { ManagedDbSummary, RedisCommandResult, RedisKeyRow, RedisKeyValue } from '@/types';
import { useLang, type TFunc } from '@/lib/i18n';

/**
 * แยกผลรอบ "พรีวิว" ออกจากผลจริง — เขียนเป็น type guard เพราะโปรเจกต์นี้ตั้ง strict: false
 * ซึ่งทำให้ TS แยก union ด้วย discriminant ที่เป็น boolean ให้เองไม่ได้
 */
function isPreviewResult(r: RedisCommandResult): r is Extract<RedisCommandResult, { preview: true }> {
  return r.preview === true;
}

/** ttl ที่ redis คืนมามีความหมายพิเศษสองค่า: -1 = ไม่มีวันหมดอายุ, -2 = ไม่มี key นี้แล้ว */
function ttlLabel(ttl: number, t: TFunc): string {
  if (ttl === -1) return t('dbc.ttlNone');
  if (ttl === -2) return t('dbc.ttlGone');
  return t('dbc.ttlSeconds', { n: ttl });
}

/** ค่าใน redis มีได้หลายทรง — วาดตาม type ที่ backend บอกมา ไม่ต้องให้ผู้ใช้เดาเอง */
function ValueBody({ data }: { data: RedisKeyValue }) {
  const { t } = useLang();
  const v = data.value;

  if (data.type === 'hash' && v && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return <p className="text-[13px] text-muted-3">{t('dbc.emptyValue')}</p>;
    return (
      <div className="overflow-auto">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <tbody>
            {entries.map(([field, val], i) => (
              <tr key={field} className={i < entries.length - 1 ? 'border-b border-border-alt' : ''}>
                <td className="whitespace-nowrap py-1.5 pr-4 font-mono font-semibold text-muted">{field}</td>
                <td className="break-all py-1.5 font-mono text-ink-soft">{String(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (Array.isArray(v)) {
    if (!v.length) return <p className="text-[13px] text-muted-3">{t('dbc.emptyValue')}</p>;
    return (
      <ol className="flex flex-col gap-1">
        {v.map((item, i) => {
          // zset มาเป็น { value, score } — โชว์คู่กันให้เห็นคะแนน ไม่ใช่ JSON ดิบ
          const isScored = item && typeof item === 'object' && 'value' in (item as any) && 'score' in (item as any);
          return (
            <li key={i} className="flex gap-2 break-all font-mono text-[13px] text-ink-soft">
              <span className="flex-none text-muted-3">{i}</span>
              {isScored ? (
                <>
                  <span className="min-w-0 flex-1">{String((item as any).value)}</span>
                  <span className="flex-none text-muted">{String((item as any).score)}</span>
                </>
              ) : (
                <span className="min-w-0 flex-1">{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  if (v === null || v === undefined) return <p className="text-[13px] italic text-muted-3">NULL</p>;

  return (
    <pre className="whitespace-pre-wrap break-all font-mono text-[13px] text-ink-soft">
      {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
    </pre>
  );
}

export default function DbRedisTab({ db }: { db: ManagedDbSummary }) {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  // ===== key browser =====
  const [match, setMatch] = useState('*');
  const [keys, setKeys] = useState<RedisKeyRow[] | null>(null);
  const [cursor, setCursor] = useState('0');
  const [done, setDone] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ===== value viewer =====
  const [selected, setSelected] = useState<string | null>(null);
  const [value, setValue] = useState<RedisKeyValue | null>(null);
  const [valueError, setValueError] = useState('');

  // ===== command runner =====
  const [command, setCommand] = useState('');
  const [cmdResult, setCmdResult] = useState<unknown>(null);
  const [cmdError, setCmdError] = useState('');
  const [cmdRunning, setCmdRunning] = useState(false);

  /** SCAN หนึ่งหน้า — from='0' คือเริ่มนับใหม่ (เปลี่ยน pattern / กดค้นหา) */
  const scan = useCallback(
    async (from: string, replace: boolean) => {
      try {
        const page = await api.databases.redisKeys(db.id, from, match.trim() || '*');
        setKeys((prev) => (replace || !prev ? page.keys : [...prev, ...page.keys]));
        setCursor(page.cursor);
        setDone(page.done);
        setLoadError('');
      } catch (e: any) {
        setLoadError(e.message);
      }
    },
    [db.id, match],
  );

  useEffect(() => {
    scan('0', true);
    // pattern เปลี่ยนแล้วต้องกดค้นหาเอง — ไม่ยิงทุกตัวอักษรที่พิมพ์ (SCAN แต่ละรอบไม่ฟรี)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.id]);

  const search = async () => {
    setKeys(null);
    setSelected(null);
    setValue(null);
    await scan('0', true);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    await scan(cursor, false);
    setLoadingMore(false);
  };

  const retryLoad = async () => {
    setRetrying(true);
    await scan('0', true);
    setRetrying(false);
  };

  const openKey = async (key: string) => {
    setSelected(key);
    setValue(null);
    setValueError('');
    try {
      setValue(await api.databases.redisKey(db.id, key));
    } catch (e: any) {
      setValueError(e.message);
    }
  };

  const runCommand = async () => {
    const text = command.trim();
    if (!text) return;
    setCmdRunning(true);
    setCmdError('');
    try {
      const r = await api.databases.redisCommand(db.id, text, false);

      // คำสั่งที่เขียนข้อมูล: รอบแรก backend ยังไม่ส่งคำสั่งเข้า redis เลย แค่บอกสถานะ key
      // ปัจจุบันกลับมาให้ดูว่ากำลังจะทับ/ลบอะไร (redis rollback ไม่ได้แบบ SQL)
      if (isPreviewResult(r)) {
        const cur = r.current;
        const ok = await confirm({
          title: t('dbc.confirmRedisTitle'),
          body: t('dbc.confirmRedisBody', { command: r.command, key: r.key || '—' }),
          note: !cur || !cur.exists ? t('dbc.confirmRedisNew') : t('dbc.confirmRedisOverwrite', { type: cur.type || '?' }),
          confirmLabel: t('dbc.confirmWriteAction'),
          danger: true,
        });
        if (!ok) {
          toast.info(t('toast.dbWriteCancelled'));
          return;
        }
        const done2 = await api.databases.redisCommand(db.id, text, true);
        setCmdResult(isPreviewResult(done2) ? null : done2.result);
        toast.success(t('toast.dbRedisDone', { command: r.command }));
        // ค่าที่โชว์อยู่/รายการ key อาจเปลี่ยนไปแล้วหลังเขียน
        await scan('0', true);
        if (selected) await openKey(selected);
        return;
      }

      setCmdResult(r.result);
    } catch (e: any) {
      setCmdError(e.message);
      setCmdResult(null);
    } finally {
      setCmdRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ===== key browser ===== */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={match}
            onChange={(e) => setMatch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            aria-label={t('dbc.matchLabel')}
            placeholder={t('dbc.matchPlaceholder')}
            className="min-w-[180px] flex-1 rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <button
            onClick={search}
            className="rounded-lg border border-border-alt px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
          >
            <i className="ph ph-magnifying-glass mr-1" />
            {t('dbc.scan')}
          </button>
        </div>

        {loadError && <ErrorBanner className="mb-3" message={loadError} onRetry={retryLoad} retrying={retrying} />}
        {!keys && !loadError && <p className="text-[14.5px] text-muted">{t('common.loading')}</p>}

        {keys && keys.length === 0 && (
          <EmptyState card icon="ph ph-key" title={t('dbc.noKeysTitle')} body={t('dbc.noKeysBody')} />
        )}

        {keys && keys.length > 0 && (
          <div className="overflow-clip rounded-[11px] border border-border-alt bg-surface">
            {keys.map((row, i) => (
              <button
                key={row.key}
                onClick={() => openKey(row.key)}
                className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-left ${
                  i < keys.length - 1 ? 'border-b border-border-alt' : ''
                } ${selected === row.key ? 'bg-[rgba(74,144,226,.06)]' : 'hover:bg-page/60'}`}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-ink">{row.key}</span>
                <span className="flex-none rounded-md border border-border-alt bg-page px-1.5 py-px text-[11.5px] font-semibold uppercase text-muted">
                  {row.type}
                </span>
                <span className="flex-none text-[12.5px] text-muted-3">{ttlLabel(row.ttl, t)}</span>
              </button>
            ))}
          </div>
        )}

        {keys && keys.length > 0 && !done && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-2 rounded-lg border border-border-alt px-3.5 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <i className={`ph ${loadingMore ? 'ph-spinner gk-spin' : 'ph-arrow-down'} mr-1`} />
            {t('dbc.loadMore')}
          </button>
        )}
        {keys && keys.length > 0 && done && <p className="mt-2 text-[12.5px] text-muted-3">{t('dbc.scanDone')}</p>}
      </div>

      {/* ===== ค่าใน key ที่เลือก ===== */}
      {selected && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="break-all font-mono text-[14px] font-semibold text-ink">{selected}</span>
            {value && (
              <span className="text-[12.5px] text-muted-3">
                {value.type} · {ttlLabel(value.ttl, t)}
              </span>
            )}
          </div>
          {valueError && <ErrorBanner message={valueError} />}
          {!value && !valueError && <p className="text-[14.5px] text-muted">{t('common.loading')}</p>}
          {value && (
            <div className="rounded-[10px] border border-border-alt bg-surface p-3">
              <ValueBody data={value} />
              {value.truncated && (
                <p className="mt-2 text-[12.5px] text-muted-3">
                  <i className="ph ph-scissors mr-1" />
                  {t('dbc.truncatedValue')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== command runner ===== */}
      <div>
        <label htmlFor="gk-redis-cmd" className="mb-1.5 block text-[13px] font-semibold text-muted">
          {t('dbc.commandLabel')}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="gk-redis-cmd"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runCommand()}
            spellCheck={false}
            placeholder={t('dbc.commandPlaceholder')}
            className="min-w-[220px] flex-1 rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <button
            onClick={runCommand}
            disabled={cmdRunning || !command.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <i className={`ph ${cmdRunning ? 'ph-spinner gk-spin' : 'ph-play'} mr-1`} />
            {cmdRunning ? t('dbc.running') : t('dbc.run')}
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-muted-3">
          <i className="ph ph-shield-check mr-1" />
          {t('dbc.redisGuardHint')}
        </p>

        {cmdError && <ErrorBanner className="mt-3" message={cmdError} />}
        {cmdResult !== null && !cmdError && (
          <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-all rounded-[10px] border border-border-alt bg-surface p-3 font-mono text-[13px] text-ink-soft">
            {typeof cmdResult === 'object' ? JSON.stringify(cmdResult, null, 2) : String(cmdResult)}
          </pre>
        )}
      </div>
    </div>
  );
}
