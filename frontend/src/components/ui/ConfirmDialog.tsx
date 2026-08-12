'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useLang } from '@/lib/i18n';

// ── กล่องยืนยันของแอปเอง (แทน window.confirm) ────────────────────────────────────
//
// confirm() ของเบราว์เซอร์แต่งไม่ได้ หลุดจากระบบดีไซน์ทั้งหมด และ "กด Enter รัวๆ ก็ผ่าน"
// ซึ่งอันตรายกับงานที่กู้คืนไม่ได้ (ลบโปรเจกต์ = แอปที่รันอยู่ตายถาวร)
//
// เรียกใช้เหมือน confirm เดิมเป๊ะ — await ได้ค่า boolean:
//   const ok = await confirm({ body: '…', danger: true });
//   if (!ok) return;
// งานที่ย้อนกลับไม่ได้จริงๆ ใส่ confirmTwice: true — ปุ่มยืนยันจะต้องกด 2 ครั้ง โดยครั้งแรก
// เปลี่ยนเป็น "กดอีกครั้งเพื่อยืนยัน" และล็อกปุ่มไว้ครู่หนึ่งกันกดรัว/ค้าง Enter ทะลุ

export interface ConfirmOptions {
  title?: string;
  body?: string;
  /** ข้อความเสริมใต้ body — ใช้กับคำเตือนที่ต้องเน้น */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** ปุ่มยืนยันเป็นสีแดง + ไอคอนเตือน */
  danger?: boolean;
  /** ต้องกดปุ่มยืนยัน 2 ครั้ง — ใช้กับงานที่กู้คืนไม่ได้ */
  confirmTwice?: boolean;
}

/** หน่วงปุ่มยืนยันขั้นที่ 2 (ms) — กันคลิกรัวๆ / ค้าง Enter แล้วผ่านทั้งสองจังหวะรวดเดียว */
const ARM_DELAY_MS = 700;

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}


export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  // ขั้นที่ 2 ของ confirmTwice: armed = กดยืนยันไปหนึ่งครั้งแล้ว, arming = ยังหน่วงปุ่มอยู่
  const [armed, setArmed] = useState(false);
  const [arming, setArming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // เก็บ resolver ไว้นอก state — จะได้ไม่ต้อง resolve ใน setState updater (React StrictMode
  // เรียก updater ซ้ำตอน dev)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
  }, []);

  useEffect(() => clearArmTimer, [clearArmTimer]);

  const confirm = useCallback<ConfirmFn>(
    (next) =>
      new Promise<boolean>((resolve) => {
        // ถ้ามีกล่องเก่าค้างอยู่ ถือว่าถูกยกเลิก — ไม่ปล่อย promise ค้างตลอดกาล
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        clearArmTimer();
        setArmed(false);
        setArming(false);
        setOpts(next);
      }),
    [clearArmTimer],
  );

  const close = useCallback(
    (ok: boolean) => {
      clearArmTimer();
      resolverRef.current?.(ok);
      resolverRef.current = null;
      setOpts(null);
    },
    [clearArmTimer],
  );

  // ปุ่มยืนยัน: ถ้าเป็น confirmTwice ครั้งแรกแค่ "ง้างปุ่ม" ไว้ ครั้งที่สองถึงจะลบจริง
  // (ช่วงหน่วงไม่ใช้ disabled เพราะปุ่มที่ถูก disable ตอนกำลังโฟกัสอยู่จะทำโฟกัสหลุดออกนอกกล่อง
  //  — กันคลิกรัวด้วยการเมินคลิกแทน)
  const onConfirmClick = useCallback(() => {
    if (!opts?.confirmTwice) {
      close(true);
      return;
    }
    if (armed) {
      if (!arming) close(true);
      return;
    }
    setArmed(true);
    setArming(true);
    clearArmTimer();
    armTimerRef.current = setTimeout(() => setArming(false), ARM_DELAY_MS);
  }, [opts, armed, arming, close, clearArmTimer]);

  // Escape / focus trap / คืนโฟกัสตอนปิด — ใช้ hook ตัวเดียวกับ StarterFilesModal
  // ([data-autofocus] อยู่ที่ปุ่มยกเลิก ซึ่งปลอดภัยกว่าปุ่มลบ)
  const cancel = useCallback(() => close(false), [close]);
  useModalA11y(panelRef, cancel, !!opts);

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

            {armed && (
              <p
                role="status"
                className="mt-4 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.07)] px-3 py-2 text-[13px] font-semibold leading-relaxed text-danger-text"
              >
                {t('confirm.pressAgainHint')}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                data-autofocus
                onClick={() => close(false)}
                className="rounded-lg border border-border px-4 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-page-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {opts.cancelLabel || t('common.cancel')}
              </button>
              <button
                onClick={onConfirmClick}
                aria-disabled={arming || undefined}
                className={`rounded-lg px-4 py-2 text-[14px] font-semibold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  arming ? 'cursor-not-allowed opacity-50' : ''
                } ${
                  opts.danger
                    ? 'bg-danger-text hover:brightness-95 focus-visible:outline-danger-text'
                    : 'bg-primary hover:bg-primary-hover focus-visible:outline-primary'
                }`}
              >
                {armed ? t('confirm.pressAgain') : opts.confirmLabel || t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
