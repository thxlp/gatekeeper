'use client';

import { useEffect, useRef, useState } from 'react';
import DbResultTable from './DbResultTable';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { DbQueryResult, ManagedDbSummary } from '@/types';
import { useLang } from '@/lib/i18n';

/**
 * แก้ข้อมูลตั้งแต่เท่านี้แถวขึ้นไปต้องกดยืนยันสองครั้ง — งานที่กระทบข้อมูลลูกค้าเป็นวงกว้าง
 * ย้อนกลับไม่ได้ (ระบบยังไม่มี backup/restore) ส่วนการแก้ทีละแถวสองสามแถวเป็นงานปกติ
 * ที่ให้กดยืนยันครั้งเดียวพอ ไม่งั้นผู้ใช้จะชินกับการกดผ่านไปเรื่อยๆ
 */
const DOUBLE_CONFIRM_ROWS = 10;

export default function DbQueryTab({
  db,
  seedSql,
  seedNonce,
}: {
  db: ManagedDbSummary;
  /** SQL ที่ส่งมาจากแท็บ Tables (กดไอคอน console ที่แถวตาราง) */
  seedSql: string;
  /** เปลี่ยนค่าทุกครั้งที่ส่ง seed ใหม่ — ให้ seed เดิมซ้ำก็ยังเติมลงช่องได้ */
  seedNonce: number;
}) {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<DbQueryResult | null>(null);
  // error ของคิวรี (syntax ผิด / ติด guard) โชว์ inline ใต้ช่องพิมพ์ — ไม่ใช่ toast เพราะ
  // ผู้ใช้ต้องอ่านมันคู่กับ SQL ที่เพิ่งพิมพ์เพื่อแก้
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!seedNonce) return;
    setSql(seedSql);
    setResult(null);
    setError('');
    boxRef.current?.focus();
  }, [seedSql, seedNonce]);

  const run = async (confirmWrite: boolean) => {
    const text = sql.trim();
    if (!text) return;
    setRunning(true);
    setError('');
    try {
      const r = await api.databases.query(db.id, text, confirmWrite);

      // รอบพรีวิวของคำสั่งเขียน — backend rollback ไปแล้ว บอกแค่ว่าจะกระทบกี่แถว
      if (r.preview) {
        setResult(r);
        const rows = r.affectedRows ?? 0;
        const ok = await confirm({
          title: t('dbc.confirmWriteTitle'),
          body: t('dbc.confirmWriteBody', { verb: r.verb, n: rows, db: db.name }),
          note: rows === 0 ? t('dbc.confirmWriteZero') : t('dbc.confirmWriteNote'),
          confirmLabel: t('dbc.confirmWriteAction'),
          danger: true,
          confirmTwice: rows >= DOUBLE_CONFIRM_ROWS,
        });
        if (!ok) {
          toast.info(t('toast.dbWriteCancelled'));
          return;
        }
        // ยิงซ้ำด้วย SQL ก้อนเดิมเป๊ะ (ตัวที่พรีวิวไป) ไม่ใช่ค่าในช่องพิมพ์ ณ ตอนนี้ —
        // ผู้ใช้อาจแก้ข้อความระหว่างที่กล่องยืนยันเปิดค้างอยู่
        setRunning(true);
        const done = await api.databases.query(db.id, text, true);
        setResult(done);
        toast.success(t('toast.dbWriteDone', { verb: done.verb, n: done.affectedRows ?? 0 }));
        return;
      }

      setResult(r);
      if (r.kind === 'write') toast.success(t('toast.dbWriteDone', { verb: r.verb, n: r.affectedRows ?? 0 }));
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <label htmlFor="gk-sql" className="mb-1.5 block text-[13px] font-semibold text-muted">
        {t('dbc.sqlLabel')}
      </label>
      <textarea
        id="gk-sql"
        ref={boxRef}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        // Ctrl/⌘+Enter = รัน (Enter เปล่าขึ้นบรรทัดใหม่ตามปกติของช่องหลายบรรทัด)
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void run(false);
          }
        }}
        rows={5}
        spellCheck={false}
        placeholder={t('dbc.sqlPlaceholder')}
        className="w-full resize-y rounded-lg border border-border-alt bg-page px-3 py-2.5 font-mono text-[13.5px] leading-relaxed text-ink outline-none focus:border-primary"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(false)}
          disabled={running || !sql.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          <i className={`ph ${running ? 'ph-spinner gk-spin' : 'ph-play'} mr-1`} />
          {running ? t('dbc.running') : t('dbc.run')}
        </button>
        <span className="text-[12.5px] text-muted-3">{t('dbc.runHint')}</span>
      </div>

      <p className="mt-2 text-[12.5px] text-muted-3">
        <i className="ph ph-shield-check mr-1" />
        {t('dbc.guardHint')}
      </p>

      {error && <ErrorBanner className="mt-4" message={error} />}

      {result && !error && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-md border border-border-alt bg-page px-2 py-0.5 font-mono font-semibold text-ink-soft">
              {result.verb}
            </span>
            {result.kind === 'write' ? (
              <span className={result.preview ? 'text-muted' : 'text-allow-text'}>
                {result.preview
                  ? t('dbc.writePreview', { n: result.affectedRows ?? 0 })
                  : t('dbc.writeApplied', { n: result.affectedRows ?? 0 })}
              </span>
            ) : (
              <span className="text-muted">{t('dbc.rowsShown', { n: result.rowCount, ms: result.durationMs })}</span>
            )}
          </div>
          <DbResultTable columns={result.columns} rows={result.rows} truncated={result.truncated} />
        </div>
      )}
    </div>
  );
}
