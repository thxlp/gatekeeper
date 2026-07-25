'use client';

import IconRail from '@/components/shell/IconRail';
import MobileTabBar from '@/components/shell/MobileTabBar';
import { useApiKey } from '@/lib/use-api-key';

// Shared authenticated shell: left icon rail (desktop) + bottom tab bar
// (mobile). Individual pages render their own top bar + content, since the
// top bar varies (search/actions vs title/back) per screen.
//
// Auth gate lives here (not per-page like the old app did) since every
// dashboard route needs it — useApiKey() redirects to /login if there's no
// valid session, and resolves instantly from localStorage once one exists.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authChecked } = useApiKey();

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-page text-sm text-muted">
        กำลังตรวจสอบสถานะการเข้าสู่ระบบ…
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
