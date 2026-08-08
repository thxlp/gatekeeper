'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang, type MsgKey } from '@/lib/i18n';

const tabs: { href: string; icon: string; label: MsgKey; match: (p: string) => boolean }[] = [
  { href: '/', icon: 'ph-squares-four', label: 'nav.projects', match: (p) => p === '/' || p.startsWith('/apps') },
  { href: '/deploy', icon: 'ph-rocket-launch', label: 'nav.deploys', match: (p) => p.startsWith('/deploy') },
  { href: '/databases', icon: 'ph-database', label: 'nav.databases', match: (p) => p.startsWith('/databases') },
  { href: '/audit', icon: 'ph-scroll', label: 'nav.audit', match: (p) => p.startsWith('/audit') },
  { href: '/settings', icon: 'ph-gear', label: 'nav.settings', match: (p) => p.startsWith('/settings') },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useLang();
  return (
    <>
      {/* floating New Deploy button above the bar */}
      <Link
        href="/deploy"
        aria-label={t('nav.newDeploy')}
        className="fixed bottom-[72px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg sm:hidden"
      >
        <i className="ph ph-plus text-2xl" />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] items-stretch border-t border-border bg-surface sm:hidden">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px] ${
                active ? 'text-primary' : 'text-muted'
              }`}
            >
              <i className={`${active ? 'ph-fill' : 'ph'} ${tab.icon} text-lg`} />
              {t(tab.label)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
