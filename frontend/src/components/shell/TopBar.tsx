'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';
import NotificationsBell from './NotificationsBell';
import StarterFilesModal from './StarterFilesModal';
import { useLang } from '@/lib/i18n';

// The top bar has two forms across the app:
//  - dashboard: search input + primary actions
//  - sub-pages: a title (often with a back arrow) + optional right slot
export default function TopBar({
  variant = 'actions',
  title,
  titleIcon,
  backHref,
  right,
  search,
  onSearchChange,
}: {
  variant?: 'actions' | 'title';
  title?: ReactNode;
  titleIcon?: string;
  backHref?: string;
  right?: ReactNode;
  /** ค่าคำค้นปัจจุบัน — ส่งคู่กับ onSearchChange เพื่อเปิดช่องค้นหา (variant 'actions') */
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const { t } = useLang();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = variant === 'actions' && !!onSearchChange;
  const [startersOpen, setStartersOpen] = useState(false);

  // มือถือไม่มี IconRail (ซ่อนที่ <sm) ของที่อยู่แต่ใน rail จึงเข้าไม่ถึงเลยบนจอเล็ก
  // ย้ายมาไว้แถบบนแทน วางทั้งสอง variant เพื่อให้กดได้ทุกหน้าเหมือน rail ฝั่ง desktop
  //
  // ปุ่มบัญชีสำคัญเป็นพิเศษ: /account ถูกลิงก์จาก IconRail ที่เดียว และปุ่ม "ออกจากระบบ"
  // อยู่ในหน้านั้น — ก่อนหน้านี้ผู้ใช้มือถือจึงออกจากระบบไม่ได้เลย
  const mobileRailButtons = (
    <>
      <button
        onClick={() => setStartersOpen(true)}
        aria-label={t('nav.starterFiles')}
        className="flex flex-none items-center justify-center rounded-[7px] p-1.5 text-muted transition-colors hover:bg-page-alt hover:text-ink sm:hidden"
      >
        <i className="ph ph-download-simple text-xl" />
      </button>
      <Link
        href="/account"
        aria-label={t('nav.account')}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-white sm:hidden"
      >
        <i className="ph-fill ph-user text-sm" />
      </Link>
    </>
  );

  // "/" = โฟกัสช่องค้นหา (ตามธรรมเนียม GitHub/Slack) — ข้ามไปถ้ากำลังพิมพ์ในช่องอื่นอยู่
  useEffect(() => {
    if (!searchable) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchable]);

  return (
    <header className="flex h-14 flex-none items-center gap-3.5 border-b border-border bg-surface px-6">
      {variant === 'actions' ? (
        <>
          {searchable && (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-border bg-page-alt px-3 py-[7px] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 sm:w-60 sm:flex-none">
              <i className="ph ph-magnifying-glass flex-none text-muted-3" />
              <input
                ref={searchRef}
                type="search"
                value={search ?? ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onSearchChange?.('');
                    e.currentTarget.blur();
                  }
                }}
                placeholder={t('nav.searchProjects')}
                title={t('search.shortcutHint')}
                aria-label={t('nav.searchProjects')}
                // appearance-none ปิดกากบาทของ type=search ที่เบราว์เซอร์วาดเอง (สีไม่เข้าธีม)
                className="min-w-0 flex-1 appearance-none bg-transparent text-[15px] text-ink outline-none placeholder:text-muted-3 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {search ? (
                <button
                  onClick={() => {
                    onSearchChange?.('');
                    searchRef.current?.focus();
                  }}
                  aria-label={t('search.clear')}
                  className="-mr-1 flex-none rounded p-0.5 text-muted-3 transition-colors hover:text-ink"
                >
                  <i className="ph ph-x text-[13px]" />
                </button>
              ) : (
                <kbd className="hidden flex-none rounded border border-border px-1 font-mono text-[11px] text-muted-3 sm:block">
                  /
                </kbd>
              )}
            </div>
          )}
          <div className="ml-auto flex flex-none items-center gap-2.5">
            {mobileRailButtons}
            <NotificationsBell />
            {/* ?tab=manual — ไม่งั้นไปตกแท็บ GitHub Repo ซึ่งไม่ตรงกับชื่อปุ่ม */}
            <Link
              href="/deploy?tab=manual"
              className="hidden items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[15px] font-medium text-ink-soft hover:bg-page-alt sm:flex"
            >
              <i className="ph ph-upload-simple" /> {t('nav.manualDeploy')}
            </Link>
            {/* มือถือซ่อนปุ่มนี้ — ปุ่มลอย (FAB) ใน MobileTabBar พาไป /deploy อยู่แล้ว
                และคืนที่ให้ช่องค้นหาซึ่งเดิมถูกซ่อนทั้งแถบบนจอเล็ก */}
            <Link
              href="/deploy"
              className="hidden items-center gap-1.5 rounded-[7px] bg-primary px-4 py-2 text-[15px] font-semibold text-white hover:bg-primary-hover sm:flex"
            >
              <i className="ph-fill ph-github-logo" /> {t('nav.deployFromGithub')}
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            {backHref && (
              <Link href={backHref} className="text-muted hover:text-ink">
                <i className="ph ph-arrow-left text-lg" />
              </Link>
            )}
            <span className="flex items-center gap-2 text-base font-bold text-ink">
              {titleIcon && <i className={`${titleIcon} text-[19px]`} />}
              {title}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {right}
            {mobileRailButtons}
            <NotificationsBell />
          </div>
        </>
      )}

      {startersOpen && <StarterFilesModal onClose={() => setStartersOpen(false)} />}
    </header>
  );
}
