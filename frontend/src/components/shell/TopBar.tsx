import Link from 'next/link';
import { ReactNode } from 'react';
import NotificationsBell from './NotificationsBell';

// The top bar has two forms across the app:
//  - dashboard: search input + primary actions
//  - sub-pages: a title (often with a back arrow) + optional right slot
export default function TopBar({
  variant = 'actions',
  title,
  titleIcon,
  backHref,
  right,
}: {
  variant?: 'actions' | 'title';
  title?: ReactNode;
  titleIcon?: string;
  backHref?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 flex-none items-center gap-3.5 border-b border-border bg-surface px-6">
      {variant === 'actions' ? (
        <>
          <div className="hidden w-60 items-center gap-2 rounded-[7px] border border-border bg-page-alt px-3 py-[7px] text-[15px] text-muted-3 sm:flex">
            <i className="ph ph-magnifying-glass" /> ค้นหาโปรเจกต์…
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <NotificationsBell />
            <Link
              href="/deploy"
              className="hidden items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[15px] font-medium text-ink-soft hover:bg-page-alt sm:flex"
            >
              <i className="ph ph-upload-simple" /> Manual Deploy
            </Link>
            <Link
              href="/deploy"
              className="flex items-center gap-1.5 rounded-[7px] bg-primary px-4 py-2 text-[15px] font-semibold text-white hover:bg-primary-hover"
            >
              <i className="ph-fill ph-github-logo" /> Deploy from GitHub
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
            <NotificationsBell />
          </div>
        </>
      )}
    </header>
  );
}
