'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ── Toast กลางของทั้งแอป ────────────────────────────────────────────────────────
// เดิมทุก action ที่สำเร็จเงียบสนิท (ลบโปรเจกต์ = แถวหายไปเฉยๆ) — ตัวนี้เป็นช่องทางเดียว
// สำหรับ "บอกผลลัพธ์" ให้ทุกหน้าใช้ร่วมกัน  ส่วน error ที่ต้องอยู่ค้างให้ผู้ใช้อ่านนานๆ
// (เช่น deploy ล้มเหลวพร้อม findings) ยังใช้ banner ในหน้าเหมือนเดิม toast ไว้กับเรื่องชั่วคราว

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const NOOP: ToastApi = { success: () => {}, error: () => {}, info: () => {} };
const ToastContext = createContext<ToastApi>(NOOP);

export function useToast() {
  return useContext(ToastContext);
}

const DURATION_MS: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  error: 6000, // error ให้เวลาอ่านนานกว่า
};
const MAX_VISIBLE = 4;

const KIND_STYLE: Record<ToastKind, { icon: string; ring: string; iconColor: string }> = {
  success: {
    icon: 'ph-fill ph-check-circle',
    ring: 'border-[rgba(115,169,140,.45)]',
    iconColor: 'text-allow-text',
  },
  error: {
    icon: 'ph-fill ph-x-circle',
    ring: 'border-[rgba(214,109,82,.45)]',
    iconColor: 'text-danger-text',
  },
  info: {
    icon: 'ph-fill ph-info',
    ring: 'border-[rgba(74,144,226,.45)]',
    iconColor: 'text-primary',
  },
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      if (!message) return;
      const id = ++seq.current;
      // เกิน MAX_VISIBLE ให้ตัวเก่าสุดหลุดออก (ตัวใหม่สำคัญกว่าเสมอ)
      setItems((prev) => [...prev, { id, kind, message }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[kind]),
      );
    },
    [dismiss],
  );

  // เก็บกวาด timer ที่ค้างตอน unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* มือถือ: ยกขึ้นเหนือ tab bar (60px) + FAB ไม่ให้ทับกัน */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-[132px] z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px]"
      >
        {items.map((item) => {
          const style = KIND_STYLE[item.kind];
          return (
            <div
              key={item.id}
              role={item.kind === 'error' ? 'alert' : 'status'}
              className={`gk-toast-in pointer-events-auto flex w-full items-start gap-2.5 rounded-[10px] border ${style.ring} bg-surface px-3.5 py-3 shadow-lg`}
            >
              <i className={`${style.icon} mt-px flex-none text-[17px] ${style.iconColor}`} />
              <div className="min-w-0 flex-1 whitespace-pre-line break-words text-[14px] leading-snug text-ink">
                {item.message}
              </div>
              <button
                onClick={() => dismiss(item.id)}
                aria-label="close"
                className="-m-1 flex-none rounded p-1 text-muted-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              >
                <i className="ph ph-x text-[13px]" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
