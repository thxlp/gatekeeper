'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

// ── กล่องยืนยันของแอปเอง (แทน window.confirm) ────────────────────────────────────
//
// confirm() ของเบราว์เซอร์แต่งไม่ได้ หลุดจากระบบดีไซน์ทั้งหมด และ "กด Enter รัวๆ ก็ผ่าน"
// ซึ่งอันตรายกับงานที่กู้คืนไม่ได้ (ลบโปรเจกต์ = แอปที่รันอยู่ตายถาวร)
//
// เรียกใช้เหมือน confirm เดิมเป๊ะ — await ได้ค่า boolean:
//   const ok = await confirm({ body: '…', danger: true });
//   if (!ok) return;
// งานที่ย้อนกลับไม่ได้จริงๆ ใส่ typeToConfirm: '<ชื่อ>' เพื่อบังคับให้พิมพ์ชื่อยืนยันก่อน

export interface ConfirmOptions {
  title?: string;
  body?: string;
  /** ข้อความเสริมใต้ body — ใช้กับคำเตือนที่ต้องเน้น */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** ปุ่มยืนยันเป็นสีแดง + ไอคอนเตือน */
  danger?: boolean;
  /** บังคับให้พิมพ์ข้อความนี้ให้ตรงก่อนถึงจะกดยืนยันได้ */
  typeToConfirm?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

const FOCUSABLE = 'button:not([disabled]), input, a[href], [tabindex]:not([tabindex="-1"])';

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  // เก็บ resolver ไว้นอก state — จะได้ไม่ต้อง resolve ใน setState updater (React StrictMode
  // เรียก updater ซ้ำตอน dev)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (next) =>
      new Promise<boolean>((resolve) => {
        // ถ้ามีกล่องเก่าค้างอยู่ ถือว่าถูกยกเลิก — ไม่ปล่อย promise ค้างตลอดกาล
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setTyped('');
        setOpts(next);
      }),
    [],
  );

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // typeToConfirm → โฟกัสช่องพิมพ์, ไม่งั้นโฟกัสปุ่มยกเลิก (ปลอดภัยกว่าโฟกัสปุ่มลบ)
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // focus trap — วน Tab อยู่ในกล่อง ไม่หลุดไปหน้าเบื้องหลังที่กดไม่ได้
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [opts, close]);

  const needsTyping = !!opts?.typeToConfirm;
  const canConfirm = !needsTyping || typed.trim() === opts?.typeToConfirm;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {opts && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && close(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gk-confirm-title"
            className="gk-toast-in w-full max-w-[440px] rounded-xl border border-border bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
                  opts.danger
                    ? 'bg-[rgba(214,109,82,.12)] text-danger-text'
                    : 'bg-[rgba(74,144,226,.1)] text-primary'
                }`}
              >
                <i className={`ph-fill ${opts.danger ? 'ph-warning' : 'ph-question'} text-[19px]`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="gk-confirm-title" className="text-[16px] font-bold text-ink">
                  {opts.title || t('confirm.defaultTitle')}
                </h2>
                {opts.body && (
                  <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">
                    {opts.body}
                  </p>
                )}
                {opts.note && (
                  <p className="mt-2 rounded-lg bg-[rgba(214,109,82,.07)] px-3 py-2 text-[13px] leading-relaxed text-danger-text">
                    {opts.note}
                  </p>
                )}
              </div>
            </div>

            {needsTyping && (
              <div className="mt-4">
                <label htmlFor="gk-confirm-type" className="mb-1.5 block text-[13px] text-muted">
                  {t('confirm.typeToConfirm', { name: opts.typeToConfirm as string })}
                </label>
                <input
                  id="gk-confirm-type"
                  data-autofocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canConfirm) close(true);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-input-border bg-page-alt px-3 py-2 font-mono text-[14px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                data-autofocus={needsTyping ? undefined : true}
                onClick={() => close(false)}
                className="rounded-lg border border-border px-4 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-page-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {opts.cancelLabel || t('common.cancel')}
              </button>
              <button
                onClick={() => close(true)}
                disabled={!canConfirm}
                className={`rounded-lg px-4 py-2 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  opts.danger
                    ? 'bg-danger-text hover:brightness-95 focus-visible:outline-danger-text'
                    : 'bg-primary hover:bg-primary-hover focus-visible:outline-primary'
                }`}
              >
                {opts.confirmLabel || t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
