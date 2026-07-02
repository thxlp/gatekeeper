'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

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
      <label className="text-xs text-sub font-mono block mb-1">{label}</label>
      <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
        <code className="flex-1 text-xs font-mono text-text truncate select-all">{value}</code>
        <button
          onClick={copy}
          title="Copy"
          className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-sub hover:text-accent transition-colors"
        >
          {copied ? (
            <>
              <Check size={13} className="text-green" />
              <span className="text-green">Copied</span>
            </>
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
    </div>
  );
}
