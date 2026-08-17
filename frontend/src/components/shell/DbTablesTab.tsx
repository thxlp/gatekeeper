'use client';

import { useCallback, useEffect, useState } from 'react';
import DbResultTable from './DbResultTable';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { DbQueryResult, DbTableInfo, ManagedDbSummary } from '@/types';
import { useLang, localeTag } from '@/lib/i18n';

/** จำนวนแถวที่ดึงมาโชว์ตอนกดดูตาราง — ดูข้อมูลคร่าวๆ ไม่ใช่ดัมป์ทั้งตาราง */
const PREVIEW_ROWS = 100;

/**
 * ใส่ quote ให้ชื่อตาราง/สคีมาก่อนเอาไปต่อเป็น SQL
 *
 * ชื่อตารางมาจาก catalog ของ DB เอง (ไม่ใช่ที่ผู้ใช้พิมพ์) แต่ยังต้อง quote อยู่ดี เพราะชื่อที่มี
 * เว้นวรรค/ตัวพิมพ์ใหญ่/ตรงกับ reserved word จะพังถ้าไม่ quote — และการเบิ้ลตัว quote ข้างใน
 * ปิดช่องแหกออกจาก identifier ไปเป็นคำสั่งอื่นด้วย
 */
function quoteIdent(name: string, engine: string): string {
  if (engine === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

function tableRef(tbl: DbTableInfo, engine: string): string {
  const base = quoteIdent(tbl.name, engine);
  // postgres มีหลาย schema — ต้องระบุให้ครบ ไม่งั้นชนกับ search_path
  return engine === 'postgres' && tbl.schema ? `${quoteIdent(tbl.schema, engine)}.${base}` : base;
}

export default function DbTablesTab({
  db,
  onOpenInQuery,
}: {
  db: ManagedDbSummary;
  onOpenInQuery: (sql: string) => void;
}) {
  const { t, lang } = useLang();
  const [tables, setTables] = useState<DbTableInfo[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);
  // ตารางที่กำลังดูอยู่ + ผลของคิวรีพรีวิว (แยก error ออกจาก error ของการโหลดรายชื่อตาราง)
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<DbQueryResult | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTables(await api.databases.tables(db.id));
      setLoadError('');
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, [db.id]);

  useEffect(() => {
    load();
  }, [load]);

  const retryLoad = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  const openTable = async (tbl: DbTableInfo) => {
    const ref = tableRef(tbl, db.engine);
    setSelected(ref);
    setPreview(null);
    setPreviewError('');
    setPreviewing(true);
    try {
      setPreview(await api.databases.query(db.id, `SELECT * FROM ${ref} LIMIT ${PREVIEW_ROWS}`));
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div>
      {loadError && <ErrorBanner className="mb-4" message={loadError} onRetry={retryLoad} retrying={retrying} />}
      {!tables && !loadError && <p className="text-[14.5px] text-muted">{t('common.loading')}</p>}

      {tables && tables.length === 0 && (
        <EmptyState
          card
          icon="ph ph-table"
          title={t('dbc.noTablesTitle')}
          body={t('dbc.noTablesBody')}
          action={{ label: t('dbc.tabQuery'), onClick: () => onOpenInQuery(''), icon: 'ph ph-terminal-window' }}
        />
      )}

      {tables && tables.length > 0 && (
        <div className="overflow-clip rounded-[11px] border border-border-alt bg-surface">
          {tables.map((tbl, i) => {
            const ref = tableRef(tbl, db.engine);
            return (
              <div
                key={ref}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 ${
                  i < tables.length - 1 ? 'border-b border-border-alt' : ''
                } ${selected === ref ? 'bg-[rgba(74,144,226,.06)]' : ''}`}
              >
                <button
                  onClick={() => openTable(tbl)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={t('dbc.previewRows', { n: PREVIEW_ROWS })}
                >
                  <i className="ph ph-table flex-none text-[16px] text-muted-3" />
                  <span className="truncate text-[14px] font-semibold text-ink">{tbl.name}</span>
                  {tbl.schema && tbl.schema !== 'public' && (
                    <span className="flex-none font-mono text-[12px] text-muted-3">{tbl.schema}</span>
                  )}
                </button>
                <span className="flex-none text-[12.5px] text-muted">
                  {t('dbc.approxRows', { n: tbl.rows.toLocaleString(localeTag(lang)) })}
                </span>
                <button
                  onClick={() => onOpenInQuery(`SELECT * FROM ${ref} LIMIT ${PREVIEW_ROWS}`)}
                  title={t('dbc.openInQuery')}
                  aria-label={t('dbc.openInQuery')}
                  className="gk-tap flex-none rounded-lg p-1.5 text-muted hover:bg-page hover:text-primary"
                >
                  <i className="ph ph-terminal-window text-[16px]" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ผลพรีวิวของตารางที่เลือก */}
      {selected && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[14px] font-semibold text-ink">{selected}</span>
            {preview && (
              <span className="text-[12.5px] text-muted-3">
                {t('dbc.rowsShown', { n: preview.rowCount, ms: preview.durationMs })}
              </span>
            )}
          </div>
          {previewError && <ErrorBanner message={previewError} />}
          {previewing && <p className="text-[14.5px] text-muted">{t('common.loading')}</p>}
          {preview && !previewing && (
            <DbResultTable columns={preview.columns} rows={preview.rows} truncated={preview.truncated} />
          )}
        </div>
      )}
    </div>
  );
}
