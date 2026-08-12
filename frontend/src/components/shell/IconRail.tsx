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

// Label fades in once the rail has mostly finished expanding, so text
// doesn't smear across the collapsed width mid-transition.
// group-focus-within คู่กับ group-hover เสมอ: คนที่ไล่ Tab เข้ามาในแถบต้องเห็นป้ายกำกับด้วย
// ไม่ใช่เห็นแค่กรอบโฟกัสวิ่งอยู่บนไอคอนเปล่าๆ (aria-label มีครบอยู่แล้ว แต่ช่วยเฉพาะ
// screen reader — คนตาดีที่ใช้คีย์บอร์ดไม่ได้อะไรเลย)
const LABEL_CLASS =
  'truncate text-[14px] font-medium opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-hover:delay-100 group-focus-within:opacity-100 group-focus-within:delay-100';

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
      {/* reserves the collapsed width in the layout so content never shifts
          when the rail expands — the rail itself floats on top as an overlay */}
      <div className="hidden w-[58px] flex-none sm:block" />

      <nav className="group absolute inset-y-0 left-0 z-30 hidden w-[58px] bg-rail py-3.5 transition-[width] duration-150 ease-out hover:w-[208px] hover:shadow-2xl focus-within:w-[208px] focus-within:shadow-2xl sm:block">
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
