'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import StarterFilesModal from './StarterFilesModal';
import { ThemeToggleButton } from './ThemeToggle';
import { LanguageToggleButton } from './LanguageToggle';
import { useLang, type MsgKey } from '@/lib/i18n';

interface RailItem {
  href: string;
  icon: string;
  activeIcon: string;
  match: (path: string) => boolean;
  label: MsgKey;
}

const items: RailItem[] = [
  {
    href: '/',
    icon: 'ph ph-squares-four',
    activeIcon: 'ph-fill ph-squares-four',
    match: (p) => p === '/' || p.startsWith('/apps'),
    label: 'nav.projects',
  },
  {
    href: '/deploy',
    icon: 'ph ph-rocket-launch',
    activeIcon: 'ph-fill ph-rocket-launch',
    match: (p) => p.startsWith('/deploy'),
    label: 'nav.deploys',
  },
  {
    href: '/databases',
    icon: 'ph ph-database',
    activeIcon: 'ph-fill ph-database',
    match: (p) => p.startsWith('/databases'),
    label: 'nav.databases',
  },
  {
    href: '/audit',
    icon: 'ph ph-scroll',
    activeIcon: 'ph-fill ph-scroll',
    match: (p) => p.startsWith('/audit'),
    label: 'nav.auditLog',
  },
];

// แถบกางค้างตลอด ป้ายกำกับจึงแสดงตรงๆ ไม่มี opacity/transition แล้ว (เดิมแถบหุบอยู่ที่
// 58px แล้วกางตอน hover — ป้ายต้อง fade เข้าทีหลังกันตัวหนังสือเลอะระหว่างแถบกำลังกาง)
const LABEL_CLASS = 'truncate text-[14px] font-medium';

// ช่อง icon กว้างคงที่ = footprint ของกล่องโลโก้ (34px) → glyph เดี่ยวจัดกลางในแถบตอนหุบ
// และป้าย label เรียงตรงกับป้ายโลโก้ตอนกาง
const ICON_SLOT = 'flex w-[34px] flex-none items-center justify-center';

export default function IconRail() {
  const pathname = usePathname();
  const { t } = useLang();
  const [startersOpen, setStartersOpen] = useState(false);
  const settingsActive = pathname.startsWith('/settings');
  const accountActive = pathname.startsWith('/account');

  const rowClass = (active: boolean) =>
    `flex h-[38px] w-full flex-none items-center gap-3 rounded-[9px] pl-[10px] pr-3 transition-colors ${
      active ? 'bg-[rgba(255,255,255,.12)] text-white' : 'text-rail-idle hover:text-white'
    }`;

  return (
    <>
      {/* แถบกางค้างที่ 208px ตลอด ไม่หุบ ไม่มี hover-to-expand แล้ว — จึงเป็นสมาชิกปกติของ
          flex ใน layout ไม่ต้องลอยทับแล้วมี div เปล่าจองที่ไว้ให้เหมือนเดิมอีก

          เปิดที่ lg (1024px) ไม่ใช่ sm: 208px บนหน้าต่าง 640px คือกินพื้นที่ไปหนึ่งในสาม
          ช่วง 640–1024px จึงใช้แถบแท็บล่างแทน (breakpoint เดียวกับที่ตาราง/การ์ดสลับกัน) */}
      <nav className="hidden w-[208px] flex-none bg-rail py-3.5 lg:block">
        <div className="flex h-full flex-col overflow-hidden">
          <Link href="/" aria-label={t('nav.home')} className="mb-3 flex h-[38px] w-full flex-none items-center gap-3 pl-[10px] text-white">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-primary">
              <i className="ph-fill ph-lock-key text-lg" />
            </span>
            <span className={`${LABEL_CLASS} font-bold`}>Gatekeeper</span>
          </Link>

          <div className="flex flex-col gap-1.5">
            {items.map((it) => {
              const active = it.match(pathname);
              return (
                <Link key={it.href} href={it.href} aria-label={t(it.label)} className={rowClass(active)}>
                  <span className={ICON_SLOT}>
                    <i className={`${active ? it.activeIcon : it.icon} text-lg`} />
                  </span>
                  <span className={LABEL_CLASS}>{t(it.label)}</span>
                </Link>
              );
            })}

            <button onClick={() => setStartersOpen(true)} aria-label={t('nav.starterFiles')} className={rowClass(startersOpen)}>
              <span className={ICON_SLOT}>
                <i className={`${startersOpen ? 'ph-fill' : 'ph'} ph-download-simple text-lg`} />
              </span>
              <span className={LABEL_CLASS}>{t('nav.starterFiles')}</span>
            </button>
          </div>

          <div className="mt-auto flex flex-col gap-1.5">
            <LanguageToggleButton className={rowClass(false)} label={t('nav.language')} labelClassName={LABEL_CLASS} />
            <ThemeToggleButton className={rowClass(false)} label={t('nav.theme')} labelClassName={LABEL_CLASS} />
            <Link href="/settings" aria-label={t('nav.settings')} className={rowClass(settingsActive)}>
              <span className={ICON_SLOT}>
                <i className={`${settingsActive ? 'ph-fill ph-gear' : 'ph ph-gear'} text-lg`} />
              </span>
              <span className={LABEL_CLASS}>{t('nav.settings')}</span>
            </Link>
            <Link href="/account" aria-label={t('nav.account')} className={rowClass(accountActive)}>
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white ${
                  accountActive ? 'outline outline-2 outline-offset-2 outline-white' : ''
                }`}
              >
                <i className="ph-fill ph-user text-sm" />
              </span>
              <span className={LABEL_CLASS}>{t('nav.account')}</span>
            </Link>
          </div>
        </div>
      </nav>

      {startersOpen && <StarterFilesModal onClose={() => setStartersOpen(false)} />}
    </>
  );
}
