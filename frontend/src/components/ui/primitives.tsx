import { ReactNode } from 'react';

// Status kind → tailwind classes for the small pill badges used across
// dashboard / audit / plugin views. Ported from gatemock/components/ui.tsx.
export const pillClasses: Record<'allow' | 'warn' | 'danger' | 'primary' | 'purple' | 'muted', string> = {
  allow: 'bg-[rgba(115,169,140,.12)] text-allow-text',
  warn: 'bg-[rgba(224,185,118,.15)] text-warn-text',
  danger: 'bg-[rgba(214,109,82,.1)] text-danger-text',
  primary: 'bg-[rgba(74,144,226,.08)] text-primary',
  purple: 'bg-[rgba(139,92,246,.1)] text-purple',
  muted: 'bg-[rgba(150,144,140,.15)] text-muted',
};

export function Pill({
  kind,
  children,
  className = '',
}: {
  kind: keyof typeof pillClasses;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold ${pillClasses[kind]} ${className}`}
    >
      {children}
    </span>
  );
}

// Row-tint helper: faint background by status (~4-5% opacity)
export const rowTint: Record<'allow' | 'warn' | 'danger', string> = {
  allow: '',
  warn: 'bg-[rgba(224,185,118,.05)]',
  danger: 'bg-[rgba(214,109,82,.04)]',
};

export const statusDot: Record<'allow' | 'warn' | 'danger', string> = {
  allow: 'bg-allow-dot',
  warn: 'bg-warn-dot',
  danger: 'bg-danger-dot',
};

// Green pill toggle. `on` slides thumb to border.
export function Toggle({ on = true, onClick }: { on?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`relative h-5 w-[34px] flex-none rounded-[10px] ${onClick ? 'cursor-pointer' : ''} ${
        on ? 'bg-allow-dot' : 'bg-[#D6CFC4]'
      }`}
    >
      <div
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          on ? 'right-0.5' : 'left-0.5'
        }`}
      />
    </div>
  );
}

// Section card used on settings / account / detail pages.
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-5 ${className}`}>{children}</div>
  );
}

export function CardHeader({
  title,
  subtitle,
  divider = true,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  divider?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className={`${divider ? 'mb-3.5 border-b border-[#F0EDE6] pb-3.5' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold text-ink">{title}</div>
          {subtitle && <div className="mt-1 text-[11.5px] text-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}
