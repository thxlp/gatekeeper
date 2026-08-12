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
  // เดิมมีปุ่มลอย (FAB) ทับมุมขวาล่างพาไป /deploy — ถอดออกแล้วด้วยสองเหตุผล: มันบังปุ่ม
  // ในการ์ดใบสุดท้ายของลิสต์ (layout เว้นที่ให้แค่ความสูงแถบแท็บ) และมันไปที่เดียวกับแท็บ
  // "ดีพลอย" ที่อยู่ห่างกันไม่ถึงนิ้วอยู่แล้ว
  return (
    // h-[60px] คือความสูงของแถวแท็บจริง ส่วน gk-safe-bottom เติมพื้นที่ใต้แถวให้เท่ากับ
    // home indicator (box-content จึงไม่ไปบีบแถวแท็บให้เตี้ยลง) — ระยะรวมนี้ต้องตรงกับ
    // padding-bottom ของ (dashboard)/layout.tsx
    <nav className="gk-safe-bottom gk-safe-x fixed inset-x-0 bottom-0 z-40 box-content flex h-[60px] items-stretch border-t border-border bg-surface sm:hidden">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 ${
              active ? 'text-primary' : 'text-muted'
            }`}
          >
            <i className={`${active ? 'ph-fill' : 'ph'} ${tab.icon} flex-none text-lg`} />
            {/* จอ 320px เหลือแท็บละ ~64px — ป้ายไทยอย่าง "ฐานข้อมูล" จะตัดขึ้นบรรทัดใหม่
                แล้วดันไอคอนเบี้ยวทั้งแถว ตัดด้วย … แทนให้ความสูงคงที่เสมอ */}
            <span className="w-full truncate text-center text-[12px] leading-none">{t(tab.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
