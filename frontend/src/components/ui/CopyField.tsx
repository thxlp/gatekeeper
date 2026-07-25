'use client';
import { useState } from 'react';

export default function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard อาจถูกบล็อกโดย browser permission — เงียบไว้ ผู้ใช้เลือกข้อความเองได้
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-ink">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-page-alt px-3 py-2">
        <code className="flex-1 select-all truncate font-mono text-xs text-ink-soft">{value}</code>
        <button
          onClick={copy}
          title="Copy"
          className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-primary"
        >
          {copied ? (
            <span className="text-allow-text">คัดลอกแล้ว</span>
          ) : (
            <i className="ph ph-copy" />
          )}
        </button>
      </div>
    </div>
  );
}
