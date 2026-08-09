'use client';

import { usePathname } from 'next/navigation';
import IconRail from '@/components/shell/IconRail';
import MobileTabBar from '@/components/shell/MobileTabBar';
import { useApiKey } from '@/lib/use-api-key';
import { useLang, type MsgKey } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';

// ชื่อบนแท็บเบราว์เซอร์ของแต่ละหน้า — ใช้ key เดียวกับป้ายบนแถบเมนูซ้าย ชื่อบนแท็บกับเมนู
// จะได้ตรงกันเสมอ (และแปลตามภาษาที่ผู้ใช้เลือก) ตั้งรวมที่ layout ที่เดียวเพราะทุกหน้าใน
// แดชบอร์ดเป็น client component — ตั้งตรงนี้ทีเดียวครอบได้หมดและรีเซ็ตทุกครั้งที่เปลี่ยน path
const TITLE_KEYS: Array<[prefix: string, key: MsgKey]> = [
  ['/deploy', 'nav.deploys'],
  ['/databases', 'nav.databases'],
  ['/audit', 'nav.auditLog'],
  ['/settings', 'nav.settings'],
  ['/account', 'nav.account'],
];

function titleKeyFor(pathname: string): MsgKey | null {
  if (pathname === '/') return 'nav.projects';
  // /apps/[id] ตั้งชื่อเอง (ใช้ชื่อแอปจริงที่โหลดมา) — คืน null ไม่ให้ layout ไปทับ
  if (pathname.startsWith('/apps')) return null;
  return TITLE_KEYS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null;
}

// Shared authenticated shell: left icon rail (desktop) + bottom tab bar
// (mobile). Individual pages render their own top bar + content, since the
// top bar varies (search/actions vs title/back) per screen.
//
// Auth gate lives here (not per-page like the old app did) since every
// dashboard route needs it — useApiKey() redirects to /login if there's no
// valid session, and resolves instantly from localStorage once one exists.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authChecked } = useApiKey();
  const { t } = useLang();
  const key = titleKeyFor(usePathname() || '/');
  useDocumentTitle(key && t(key));

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-page text-sm text-muted">
        {t('shell.checkingAuth')}
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-page-alt text-ink">
      <IconRail />
      <div className="flex min-w-0 flex-1 flex-col pb-[60px] sm:pb-0">{children}</div>
      <MobileTabBar />
    </div>
  );
}
