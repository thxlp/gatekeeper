'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { NotificationFeed, NotificationItem } from '@/types';

const POLL_MS = 30_000;

// สี dot ตามชนิดเหตุการณ์ — โทนเดียวกับ badge ในหน้า pipeline
function dotClass(type: string): string {
  if (type === 'deploy_success' || type === 'rollback_success') return 'bg-allow-dot';
  if (type === 'deploy_failed' || type === 'deploy_blocked' || type === 'rollback_failed') return 'bg-danger-dot';
  return 'bg-muted-3';
}

function timeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'เมื่อครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/**
 * กระดิ่งแจ้งเตือนบน TopBar — poll GET /notifications ทุก 30s (แพทเทิร์น polling เดียวกับ
 * ทั้งแอป ไม่มี SSE/WebSocket) เปิด dropdown = mark อ่านทั้งหมด (badge หายทันที)
 */
export default function NotificationsBell() {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.notifications
        .list()
        .then((f) => alive && setFeed(f))
        .catch(() => undefined); // เงียบ — กระดิ่งพังต้องไม่รบกวนหน้าหลัก
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // ปิด dropdown เมื่อคลิกนอกกรอบ
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && feed && feed.unread > 0) {
      // เปิดดู = อ่านแล้ว — mark ฝั่ง server แล้วเคลียร์ badge ฝั่งเราเลยไม่รอ poll รอบถัดไป
      setFeed({ ...feed, unread: 0, items: feed.items.map((x) => ({ ...x, read: true })) });
      api.notifications.markRead().catch(() => undefined);
    }
  };

  const items: NotificationItem[] = feed?.items ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        aria-label="การแจ้งเตือน"
        className="relative flex h-9 w-9 items-center justify-center rounded-[7px] border border-border bg-surface text-ink-soft hover:bg-page-alt"
      >
        <i className="ph ph-bell text-[17px]" />
        {(feed?.unread ?? 0) > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger-dot px-1 text-[12px] font-bold text-white">
            {feed!.unread > 9 ? '9+' : feed!.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[320px] rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-2.5 text-[14.5px] font-bold">การแจ้งเตือน</div>
          {items.length === 0 && (
            <p className="px-4 py-5 text-center text-[14px] text-muted">ยังไม่มีการแจ้งเตือน</p>
          )}
          <div className="max-h-[360px] overflow-auto">
            {items.map((n) => {
              const appId = typeof n.meta?.appId === 'string' ? n.meta.appId : undefined;
              const row = (
                <div className="flex gap-2.5 px-4 py-2.5 hover:bg-page-alt">
                  <span className={`mt-[5px] inline-block h-[7px] w-[7px] shrink-0 rounded-full ${dotClass(n.type)}`} />
                  <div className="min-w-0">
                    <div className={`truncate text-[14px] ${n.read ? 'font-medium text-ink-soft' : 'font-bold'}`}>
                      {n.title}
                    </div>
                    {n.body && <div className="truncate text-[13px] text-muted">{n.body}</div>}
                    <div className="mt-px text-[12.5px] text-muted-3">{timeLabel(n.createdAt)}</div>
                  </div>
                </div>
              );
              return appId ? (
                <Link key={n.id} href={`/apps/${appId}`} onClick={() => setOpen(false)} className="block">
                  {row}
                </Link>
              ) : (
                <div key={n.id}>{row}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
