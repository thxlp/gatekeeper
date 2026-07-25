'use client';

import { useTheme } from '@/lib/use-theme';

// Compact icon button for the icon rail — always sets an explicit
// light/dark preference (ignores "system"), for a quick one-click switch.
// `label`, when passed, renders as a fade-in span next to the icon (for the
// rail's hover-to-expand state) — pass a group-hover opacity class via
// `labelClassName` to control when it reveals.
export function ThemeToggleButton({
  className = '',
  label,
  labelClassName = '',
}: {
  className?: string;
  label?: string;
  labelClassName?: string;
}) {
  const { resolved, setTheme } = useTheme();
  const goingDark = resolved === 'light';
  return (
    <button
      onClick={() => setTheme(goingDark ? 'dark' : 'light')}
      aria-label={goingDark ? 'สลับเป็นธีมมืด' : 'สลับเป็นธีมสว่าง'}
      title={goingDark ? 'ธีมมืด' : 'ธีมสว่าง'}
      className={className}
    >
      <span className="flex w-[34px] flex-none items-center justify-center">
        <i className={`ph ${goingDark ? 'ph-moon' : 'ph-sun'} text-lg`} />
      </span>
      {label && <span className={`truncate text-[14px] font-medium ${labelClassName}`}>{label}</span>}
    </button>
  );
}

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { value: 'light', label: 'สว่าง', icon: 'ph-sun' },
  { value: 'dark', label: 'มืด', icon: 'ph-moon' },
  { value: 'system', label: 'ตามระบบ', icon: 'ph-circle-half' },
];

// Full 3-way segmented control for Settings → Preferences.
export function ThemeSegmentedControl() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-page-alt p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            theme === opt.value ? 'bg-surface text-ink shadow-card-soft' : 'text-muted hover:text-ink'
          }`}
        >
          <i className={`ph ${opt.icon}`} /> {opt.label}
        </button>
      ))}
    </div>
  );
}
