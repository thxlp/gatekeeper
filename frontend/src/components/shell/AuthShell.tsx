'use client';

import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { useLang } from '@/lib/i18n';

// Full-bleed dark auth background with teal aura + tech photo composite,
// centered white card. Shared by login / register / forgot-password.
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 text-ink"
      style={{
        backgroundColor: '#0a0f14',
        backgroundImage:
          "radial-gradient(circle at 50% -20%,rgba(45,212,191,.25) 0%,transparent 60%),linear-gradient(rgba(10,15,20,.6),rgba(10,15,20,.95)),url('https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2000&auto=format&fit=crop')",
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
      }}
    >
      <Link href="/" className="absolute left-6 top-5 flex items-center gap-2 text-base font-bold text-white">
        <i className="ph-fill ph-lock-key text-xl text-primary" /> Gatekeeper
      </Link>
      <div className="w-[380px] max-w-full rounded-xl border border-input-border bg-surface p-8 shadow-auth">
        {children}
      </div>
    </div>
  );
}

/**
 * ฟอร์มของหน้า auth — ครอบด้วย <form> เสมอเพื่อให้ "กด Enter ในช่องกรอก = ส่งฟอร์ม"
 * (เดิมทั้งสามหน้าเป็น div เปล่า ผู้ใช้ต้องเอื้อมไปกดปุ่มอย่างเดียว) และเบราว์เซอร์/
 * password manager ถึงจะรู้จักว่านี่คือฟอร์ม login จริงแล้วเสนอบันทึกรหัสผ่านให้
 */
export function AuthForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

let fieldSeq = 0;

export function Field({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  name,
  autoComplete,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  error?: string;
  name?: string;
  /** บอกเบราว์เซอร์ว่าช่องนี้คืออะไร (email / current-password / new-password …) */
  autoComplete?: string;
}) {
  // ผูก label เข้ากับ input จริงๆ — เดิม label เป็น <div> ลอยๆ screen reader อ่านไม่รู้ว่าคู่กัน
  // และคลิกที่ข้อความก็ไม่โฟกัสช่องกรอก
  const [id] = useState(() => `f${++fieldSeq}`);
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`w-full rounded-md border bg-input-fill px-3 py-2.5 text-sm text-ink placeholder:text-muted-3 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          error ? 'border-danger-text' : 'border-input-border'
        }`}
      />
      {error && (
        <div id={`${id}-err`} className="mt-1 text-[13px] text-danger-text">
          {error}
        </div>
      )}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = '',
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-[11px] text-[15.5px] font-medium text-white hover:bg-primary-hover disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function OAuthButtons({ onOAuth }: { onOAuth?: (provider: 'github' | 'google') => void }) {
  const { t } = useLang();
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-2">
        <div className="flex-1 border-b border-input-border" />
        {t('common.or')}
        <div className="flex-1 border-b border-input-border" />
      </div>
      <button
        onClick={() => onOAuth?.('github')}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-input-border bg-surface px-4 py-2.5 text-sm font-medium text-ink-alt hover:bg-page-alt"
      >
        <i className="ph-fill ph-github-logo text-lg" /> {t('auth.continueWithGithub')}
      </button>
      <button
        onClick={() => onOAuth?.('google')}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-input-border bg-surface px-4 py-2.5 text-sm font-medium text-ink-alt hover:bg-page-alt"
      >
        <i className="ph-fill ph-google-logo text-lg text-[#35eae1]" /> {t('auth.continueWithGoogle')}
      </button>
    </>
  );
}
