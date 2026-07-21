'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import StarterFilesModal from './StarterFilesModal';

interface RailItem {
  href: string;
  icon: string;
  activeIcon: string;
  match: (path: string) => boolean;
  label: string;
}

const items: RailItem[] = [
  {
    href: '/',
    icon: 'ph ph-squares-four',
    activeIcon: 'ph-fill ph-squares-four',
    match: (p) => p === '/' || p.startsWith('/apps'),
    label: 'Projects',
  },
  {
    href: '/deploy',
    icon: 'ph ph-rocket-launch',
    activeIcon: 'ph-fill ph-rocket-launch',
    match: (p) => p.startsWith('/deploy'),
    label: 'Deploys',
  },
  {
    href: '/audit',
    icon: 'ph ph-scroll',
    activeIcon: 'ph-fill ph-scroll',
    match: (p) => p.startsWith('/audit'),
    label: 'Audit Log',
  },
];

export default function IconRail() {
  const pathname = usePathname();
  const [startersOpen, setStartersOpen] = useState(false);
  const settingsActive = pathname.startsWith('/settings');
  const accountActive = pathname.startsWith('/account');

  const itemClass = (active: boolean) =>
    `flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors ${
      active ? 'bg-[rgba(255,255,255,.12)] text-white' : 'text-rail-idle hover:text-white'
    }`;

  return (
    <>
    <nav className="hidden w-[58px] flex-none flex-col items-center gap-1.5 bg-rail py-3.5 sm:flex">
      <Link
        href="/"
        aria-label="Gatekeeper home"
        className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary text-white"
      >
        <i className="ph-fill ph-lock-key text-lg" />
      </Link>

      {items.map((it) => {
        const active = it.match(pathname);
        return (
          <Link key={it.href} href={it.href} aria-label={it.label} className={itemClass(active)}>
            <i className={`${active ? it.activeIcon : it.icon} text-lg`} />
          </Link>
        );
      })}

      <button
        onClick={() => setStartersOpen(true)}
        aria-label="ไฟล์เริ่มงาน"
        title="ไฟล์เริ่มงาน"
        className={itemClass(startersOpen)}
      >
        <i className={`${startersOpen ? 'ph-fill' : 'ph'} ph-download-simple text-lg`} />
      </button>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <Link href="/settings" aria-label="Settings" className={itemClass(settingsActive)}>
          <i className={`${settingsActive ? 'ph-fill ph-gear' : 'ph ph-gear'} text-lg`} />
        </Link>
        <Link
          href="/account"
          aria-label="Account"
          className={`flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white ${
            accountActive ? 'outline outline-2 outline-offset-2 outline-white' : ''
          }`}
        >
          <i className="ph-fill ph-user text-sm" />
        </Link>
      </div>
    </nav>
    {startersOpen && <StarterFilesModal onClose={() => setStartersOpen(false)} />}
    </>
  );
}
