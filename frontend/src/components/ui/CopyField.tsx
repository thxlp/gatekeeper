'use client';
import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useLang } from '@/lib/i18n';

export default function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useLang();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard ถูกบล็อกด้วย permission ของเบราว์เซอร์ — เดิมเงียบสนิท ผู้ใช้กดแล้วนึกว่าค้าง
      toast.error(t('toast.copyFailed'));
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-ink">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-page-alt px-3 py-2">
        <code className="flex-1 select-all truncate font-mono text-xs text-ink-soft">{value}</code>
        <button
          onClick={copy}
          title={t('common.copy')}
          className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-primary"
        >
          {copied ? (
            <span className="text-allow-text">{t('common.copied')}</span>
          ) : (
            <i className="ph ph-copy" />
          )}
        </button>
      </div>
    </div>
  );
}
