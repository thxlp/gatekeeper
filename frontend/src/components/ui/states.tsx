'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * แบนเนอร์ error ของการ "โหลดข้อมูล" — มีปุ่มลองใหม่ติดมาเสมอ
 *
 * เดิมทุกหน้าโชว์ข้อความ error แล้วจบ ผู้ใช้ต้องรีเฟรชทั้งหน้าเอง ซึ่งทิ้งคำค้น/ตัวกรอง/
 * ฟอร์มที่พิมพ์ค้างไว้ทั้งหมด
 *
 * ใช้กับ error ของการโหลดเท่านั้น — error ของการกดปุ่ม (ลบ/บันทึก/เชื่อม) ให้ใช้ toast.error
 * ตามเดิม เพราะปุ่ม "ลองใหม่" ที่ไปโหลดรายการซ้ำไม่ตรงกับสิ่งที่ผู้ใช้เพิ่งกดพลาด
 */
export function ErrorBanner({
  message,
  onRetry,
  retrying = false,
  className = '',
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-2.5 rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[14.5px] text-danger-text ${className}`}
    >
      <i className="ph-fill ph-warning-circle flex-none text-[17px]" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="flex-none rounded-md border border-danger-text/40 bg-surface px-2.5 py-1 text-[13.5px] font-semibold text-danger-text hover:bg-[rgba(214,109,82,.1)] disabled:opacity-50"
        >
          <i className={`ph ph-arrow-clockwise mr-1 ${retrying ? 'gk-spin' : ''}`} />
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** ปุ่มบนหน้าว่าง — ใส่ href (ไปหน้าอื่น) หรือ onClick (ทำอะไรในหน้านี้) อันใดอันหนึ่ง */
export type EmptyAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: string;
};

const primaryCls =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[14.5px] font-semibold text-white hover:bg-primary-hover';
const secondaryCls =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-[14px] font-semibold text-ink-soft hover:border-primary hover:text-primary';

function ActionButton({ action, cls }: { action: EmptyAction; cls: string }) {
  const inner = (
    <>
      {action.icon && <i className={action.icon} />}
      {action.label}
    </>
  );
  return action.href ? (
    <Link href={action.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={action.onClick} className={cls}>
      {inner}
    </button>
  );
}

/**
 * หน้าว่าง — ไอคอน + หัวข้อ + คำอธิบาย + ปุ่มพาไปขั้นถัดไป
 *
 * ปุ่มคือหัวใจของคอมโพเนนต์นี้: หน้าว่างที่บอกแค่ว่า "ยังไม่มีอะไร" คือทางตัน ผู้ใช้ต้องเดาเอง
 * ว่าต้องไปกดที่ไหนต่อ — ทุกที่ที่ใช้ EmptyState ควรมี action เว้นแต่ทำอะไรต่อไม่ได้จริงๆ
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  secondary,
  card = false,
  className = '',
}: {
  icon: string;
  title: string;
  body?: ReactNode;
  action?: EmptyAction;
  secondary?: EmptyAction;
  /** ครอบด้วยการ์ด (ใช้ตอนหน้าว่างอยู่ในตำแหน่งของรายการ/ตารางที่มีกรอบ) */
  card?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-4 text-center ${
        card ? 'rounded-xl border border-border-alt bg-surface py-12' : 'py-20'
      } ${className}`}
    >
      <i className={`${icon} text-4xl text-muted-3`} />
      <div>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-[420px] text-[13.5px] text-muted">{body}</p>}
      </div>
      {(action || secondary) && (
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton action={action} cls={primaryCls} />}
          {secondary && <ActionButton action={secondary} cls={secondaryCls} />}
        </div>
      )}
    </div>
  );
}
