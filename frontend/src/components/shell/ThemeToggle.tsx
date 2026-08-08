'use client';

import { useTheme } from '@/lib/use-theme';
import { useLang, type MsgKey } from '@/lib/i18n';

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
  const { t } = useLang();
  const goingDark = resolved === 'light';
  return (
    <button
      onClick={() => setTheme(goingDark ? 'dark' : 'light')}
      aria-label={goingDark ? t('theme.toDark') : t('theme.toLight')}
      title={goingDark ? t('theme.dark') : t('theme.light')}
      className={className}
    >
      <span className="flex w-[34px] flex-none items-center justify-center">
        <i className={`ph ${goingDark ? 'ph-moon' : 'ph-sun'} text-lg`} />
      </span>
      {label && <span className={`truncate text-[14px] font-medium ${labelClassName}`}>{label}</span>}
    </button>
  );
}

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: MsgKey; icon: string }[] = [
  { value: 'light', label: 'theme.optLight', icon: 'ph-sun' },
  { value: 'dark', label: 'theme.optDark', icon: 'ph-moon' },
  { value: 'system', label: 'theme.optSystem', icon: 'ph-circle-half' },
];

// Full 3-way segmented control for Settings → Preferences.
export function ThemeSegmentedControl() {
  const { theme, setTheme } = useTheme();
  const { t } = useLang();
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
          <i className={`ph ${opt.icon}`} /> {t(opt.label)}
        </button>
      ))}
    </div>
  );
}
