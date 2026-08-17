'use client';

import { useCallback, useEffect, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import DbTablesTab from '@/components/shell/DbTablesTab';
import DbQueryTab from '@/components/shell/DbQueryTab';
import DbRedisTab from '@/components/shell/DbRedisTab';
import { EmptyState, ErrorBanner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { ManagedDbSummary } from '@/types';
import { engineMeta } from '@/lib/db-engines';
import { useLang, type MsgKey } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';

/**
 * Console ของฐานข้อมูลหนึ่งตัว — ดูตาราง/รันคิวรี (postgres, mysql) หรือ browse key +
 * รันคำสั่ง (redis)
 *
 * ตัวกันความปลอดภัยทั้งหมดอยู่ฝั่ง backend (allowlist คำสั่ง, read-only transaction,
 * ยืนยันสองจังหวะก่อน commit) — หน้านี้ทำหน้าที่ "บอกให้ผู้ใช้รู้ตัวก่อนกด" เท่านั้น
 * ห้ามคิดว่ากล่องยืนยันตรงนี้คือด่านกัน มันเป็นแค่ด่านสุดท้ายที่มองเห็น
 */

type SqlTab = 'tables' | 'query';
const SQL_TABS: { key: SqlTab; label: MsgKey; icon: string }[] = [
  { key: 'tables', label: 'dbc.tabTables', icon: 'ph-table' },
  { key: 'query', label: 'dbc.tabQuery', icon: 'ph-terminal-window' },
];

export default function DatabaseConsolePage({ params }: { params: { id: string } }) {
  const { t } = useLang();
  const [db, setDb] = useState<ManagedDbSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState<SqlTab>('tables');
  // SQL ที่ส่งข้ามจากแท็บ Tables ไปแท็บ Query (nonce เปลี่ยนทุกครั้งเพื่อให้ส่งค่าเดิมซ้ำได้)
  const [seedSql, setSeedSql] = useState('');
  const [seedNonce, setSeedNonce] = useState(0);

  useDocumentTitle(db?.name || t('nav.databases'));

  // ยังไม่มี endpoint ดึงฐานข้อมูลตัวเดียว — ดึงรายการของบัญชีแล้วหาตัวที่ตรง id
  // (รายการต่อบัญชีมีไม่กี่ตัว) ownership ถูกบังคับฝั่ง backend อยู่แล้วทุก endpoint
  const load = useCallback(async () => {
    try {
      const list = await api.databases.list();
      const found = list.find((d) => d.id === params.id) || null;
      setDb(found);
      setNotFound(!found);
      setLoadError('');
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // deep-link ?tab=query (ใช้กับ redis ไม่ได้ — redis มีหน้าเดียว)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q === 'query' || q === 'tables') setTab(q);
  }, []);

  const changeTab = (next: SqlTab) => {
    setTab(next);
    const u = new URL(window.location.href);
    if (next === 'tables') u.searchParams.delete('tab');
    else u.searchParams.set('tab', next);
    window.history.replaceState(null, '', u.toString());
  };

  const openInQuery = (sql: string) => {
    setSeedSql(sql);
    setSeedNonce((n) => n + 1);
    changeTab('query');
  };

  const retryLoad = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  const meta = db ? engineMeta(db.engine) : null;
  const isRedis = db?.engine === 'redis';

  return (
    <>
      <TopBar
        variant="title"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{db?.name || t('dbc.title')}</span>
            {meta && <span className="hidden text-xs font-normal text-muted-3 sm:inline">{meta.label}</span>}
          </span>
        }
        titleIcon={meta ? `ph ${meta.icon}` : 'ph ph-database'}
        backHref="/databases"
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[900px]">
          {loadError && <ErrorBanner className="mb-4" message={loadError} onRetry={retryLoad} retrying={retrying} />}
          {!db && !loadError && !notFound && <p className="text-[14.5px] text-muted">{t('common.loading')}</p>}

          {notFound && (
            <EmptyState
              icon="ph ph-database"
              title={t('dbc.notFoundTitle')}
              body={t('dbc.notFoundBody')}
              action={{ label: t('nav.databases'), href: '/databases', icon: 'ph ph-arrow-left' }}
            />
          )}

          {db && db.status !== 'running' && (
            <EmptyState
              card
              icon="ph ph-pause-circle"
              title={t('dbc.notRunningTitle')}
              body={db.lastError || t('dbc.notRunningBody')}
              action={{ label: t('common.retry'), onClick: retryLoad, icon: 'ph ph-arrow-clockwise' }}
            />
          )}

          {db && db.status === 'running' && (
            <>
              <div className="mb-4 font-mono text-[12.5px] text-muted-3">
                {db.connection.host}:{db.connection.port}
                {db.connection.dbName ? ` / ${db.connection.dbName}` : ''}
              </div>

              {isRedis ? (
                <DbRedisTab db={db} />
              ) : (
                <>
                  <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border-alt">
                    {SQL_TABS.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => changeTab(item.key)}
                        className={`-mb-px flex flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-[14px] font-semibold ${
                          tab === item.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
                        }`}
                      >
                        <i className={`ph ${item.icon} text-[16px]`} />
                        {t(item.label)}
                      </button>
                    ))}
                  </div>

                  {/* ซ่อนด้วย CSS ไม่ใช่ unmount — สลับไปดูรายชื่อตารางแล้วกลับมา SQL ที่พิมพ์ค้างไว้
                      กับผลลัพธ์ต้องยังอยู่ (unmount = พิมพ์ใหม่ทุกรอบ) */}
                  <div className={tab === 'tables' ? '' : 'hidden'}>
                    <DbTablesTab db={db} onOpenInQuery={openInQuery} />
                  </div>
                  <div className={tab === 'query' ? '' : 'hidden'}>
                    <DbQueryTab db={db} seedSql={seedSql} seedNonce={seedNonce} />
                  </div>
                </>
              )}

              <p className="mt-6 text-[12.5px] text-muted-3">
                <i className="ph ph-note-pencil mr-1" />
                {t('dbc.auditNote')}
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
