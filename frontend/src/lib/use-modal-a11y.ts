'use client';

import { RefObject, useEffect } from 'react';

const FOCUSABLE = 'button:not([disabled]), input, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * มารยาทพื้นฐานของ modal ที่ต้องมีทุกกล่อง — เดิมมีแต่ใน ConfirmDialog ส่วน StarterFilesModal
 * ดัก Escape อย่างเดียว (Tab หลุดไปโฟกัสของหลังกล่องที่กดไม่ได้ และปิดแล้วโฟกัสหายไปที่ body)
 *
 * - Escape = ปิด
 * - focus trap: Tab วนอยู่ในกล่อง ไม่หลุดไปข้างหลัง
 * - โฟกัสแรกไปที่ [data-autofocus] ถ้ามี
 * - ล็อก scroll ของหน้าเบื้องหลังระหว่างเปิด
 * - ปิดแล้วคืนโฟกัสกลับให้ element ที่กดเปิด (คนใช้คีย์บอร์ดไม่หลงว่าตัวเองอยู่ตรงไหน)
 */
export function useModalA11y(panelRef: RefObject<HTMLElement>, onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
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
  }, [panelRef, onClose, active]);
}
