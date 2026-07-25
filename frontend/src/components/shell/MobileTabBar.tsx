'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', icon: 'ph-squares-four', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/apps') },
  { href: '/deploy', icon: 'ph-rocket-launch', label: 'Deploys', match: (p: string) => p.startsWith('/deploy') },
  { href: '/audit', icon: 'ph-scroll', label: 'Audit', match: (p: string) => p.startsWith('/audit') },
  { href: '/settings', icon: 'ph-gear', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <>
      {/* floating New Deploy button above the bar */}
      <Link
        href="/deploy"
        aria-label="New deploy"
        className="fixed bottom-[72px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg sm:hidden"
      >
        <i className="ph ph-plus text-2xl" />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] items-stretch border-t border-border bg-surface sm:hidden">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px] ${
                active ? 'text-primary' : 'text-muted'
              }`}
            >
              <i className={`${active ? 'ph-fill' : 'ph'} ${t.icon} text-lg`} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
