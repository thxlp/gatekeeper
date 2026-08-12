'use client';

import { useLang } from '@/lib/i18n';

// ปุ่มไอคอนสำหรับ icon rail — กดทีเดียวสลับไทย↔อังกฤษ (คู่กับ ThemeToggleButton)
// `label` แสดงตอน rail กางออก ส่ง opacity class ผ่าน `labelClassName` เหมือนปุ่มธีม
export function LanguageToggleButton({
  className = '',
  label,
  labelClassName = '',
}: {
  className?: string;
  label?: string;
  labelClassName?: string;
}) {
  const { lang, setLang, t } = useLang();
  const next = lang === 'th' ? 'en' : 'th';
  return (
    <button
      onClick={() => setLang(next)}
      aria-label={t('lang.switchTo')}
      title={t('lang.switchTo')}
      className={className}
    >
      <span className="flex w-[34px] flex-none items-center justify-center">
        <i className="ph ph-translate text-lg" />
      </span>
      {label && <span className={`truncate text-[14px] font-medium ${labelClassName}`}>{label}</span>}
    </button>
  );
}

// segmented control 2 ช่องสำหรับหน้า Settings → Preferences (ทรงเดียวกับ ThemeSegmentedControl)
export function LanguageSegmentedControl() {
  const { lang, setLang, t } = useLang();
  const options = [
    { value: 'th' as const, label: t('lang.thai') },
    { value: 'en' as const, label: t('lang.english') },
  ];
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-page-alt p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLang(opt.value)}
          className={`gk-tap gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            lang === opt.value ? 'bg-surface text-ink shadow-card-soft' : 'text-muted hover:text-ink'
          }`}
        >
          <i className="ph ph-translate" /> {opt.label}
        </button>
      ))}
    </div>
  );
}
