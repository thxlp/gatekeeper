'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EnvVarSummary } from '@/types';

export default function VariablesTab({
  appId,
  onRequestRedeploy,
}: {
  appId: string;
  onRequestRedeploy: () => void;
}) {
  const [vars, setVars] = useState<EnvVarSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsRedeploy, setNeedsRedeploy] = useState(false);

  // add form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  // แก้ค่าทีละ row (เก็บ key ที่กำลังแก้ + ค่าใหม่ — ค่าเดิมไม่เคยรู้ ต้องพิมพ์ใหม่)
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // import .env
  const [importOpen, setImportOpen] = useState(false);
  const [importRaw, setImportRaw] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.env
      .list(appId)
      .then((r) => !cancelled && setVars(r.vars))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const run = async (fn: () => Promise<{ vars: EnvVarSummary[]; needsRedeploy?: boolean }>) => {
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      setVars(r.vars);
      if (r.needsRedeploy) setNeedsRedeploy(true);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addVar = async () => {
    if (!newKey.trim()) return;
    const ok = await run(() => api.env.set(appId, newKey.trim(), newValue));
    if (ok) {
      setNewKey('');
      setNewValue('');
    }
  };

  const saveEdit = async (key: string) => {
    const ok = await run(() => api.env.set(appId, key, editValue));
    if (ok) {
      setEditKey(null);
      setEditValue('');
    }
  };

  const removeVar = async (key: string) => {
    if (!confirm(`ลบตัวแปร ${key}?`)) return;
    await run(() => api.env.remove(appId, key));
  };

  const doImport = async () => {
    if (!importRaw.trim()) return;
    const ok = await run(() => api.env.importRaw(appId, importRaw));
    if (ok) {
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
          <div className="min-w-0 flex-1 text-[13.5px] text-ink-soft">
            ตัวแปรถูกบันทึกแล้ว แต่จะ<span className="font-semibold">มีผลเมื่อ deploy รอบถัดไป</span> — ค่า env ถูกฝังตอนสร้าง container
          </div>
          <button
            onClick={onRequestRedeploy}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-primary-hover"
          >
            <i className="ph ph-rocket-launch mr-1" /> Redeploy ตอนนี้
          </button>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-bold">Environment Variables</div>
          <div className="text-[13px] text-muted">ค่าถูกเข้ารหัสเก็บไว้ · ระบบไม่แสดงค่าจริงอีกหลังบันทึก</div>
        </div>
        <button
          onClick={() => setImportOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-alt px-3 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
        >
          <i className="ph ph-upload-simple" /> Import .env
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[13.5px] text-danger-text">
          {error}
        </div>
      )}

      {/* import .env */}
      {importOpen && (
        <div className="mb-4 rounded-xl border border-border-alt bg-surface p-3">
          <textarea
            value={importRaw}
            onChange={(e) => setImportRaw(e.target.value)}
            placeholder={'วางเนื้อหา .env ที่นี่\nDATABASE_URL=postgres://...\nAPI_KEY=sk_live_...'}
            rows={5}
            className="w-full resize-y rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={doImport}
              disabled={busy || !importRaw.trim()}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              Import (merge)
            </button>
            <button
              onClick={() => {
                setImportOpen(false);
                setImportRaw('');
              }}
              className="rounded-lg border border-border-alt px-3.5 py-1.5 text-[13.5px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
            >
              ยกเลิก
            </button>
            <span className="text-[12.5px] text-muted-3">ทับค่าเดิมที่ชื่อชนกัน · ตัวอื่นคงไว้</span>
          </div>
        </div>
      )}

      {/* ตารางตัวแปร */}
      <div className="overflow-hidden rounded-xl border border-border-alt bg-surface">
        {vars === null ? (
          <div className="px-4 py-6 text-[13.5px] text-muted">กำลังโหลด…</div>
        ) : vars.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13.5px] text-muted">
            <i className="ph ph-key mb-1 block text-2xl text-muted-3" />
            ยังไม่มีตัวแปร — เพิ่มด้านล่างหรือ Import .env
          </div>
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
                      placeholder="ค่าใหม่ (พิมพ์ทับ — ค่าเดิมไม่แสดง)"
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
                      บันทึก
                    </button>
                    <button
                      onClick={() => {
                        setEditKey(null);
                        setEditValue('');
                      }}
                      className="rounded-md border border-border-alt px-2.5 py-1 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
                    >
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      title="แก้ค่า"
                      onClick={() => {
                        setEditKey(v.key);
                        setEditValue('');
                      }}
                      className="rounded-md p-1.5 text-muted hover:bg-page hover:text-primary"
                    >
                      <i className="ph ph-pencil-simple text-[15px]" />
                    </button>
                    <button
                      title="ลบ"
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
        <div className="mb-2 text-[13.5px] font-semibold text-ink-soft">เพิ่มตัวแปร</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="KEY"
            className="w-[200px] rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <span className="text-muted">=</span>
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVar()}
            placeholder="value"
            className="min-w-[200px] flex-1 rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <button
            onClick={addVar}
            disabled={busy || !newKey.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <i className="ph ph-plus mr-1" /> เพิ่ม
          </button>
        </div>
        <div className="mt-2 text-[12.5px] text-muted-3">
          ชื่อ: ขึ้นต้นตัวอักษรหรือ _ แล้วตามด้วย A-Z a-z 0-9 _ เท่านั้น
        </div>
      </div>
    </div>
  );
}
