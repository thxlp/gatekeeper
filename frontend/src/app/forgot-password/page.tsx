'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AuthShell, { Field, PrimaryButton } from '@/components/shell/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim()) {
      setError('กรุณากรอก email');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (err) throw err;
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div className="mb-2 flex items-center gap-2 text-xl font-semibold text-allow-text">
          <i className="ph-fill ph-envelope-simple-open" /> ส่งลิงก์แล้ว
        </div>
        <p className="mb-6 text-[12.5px] leading-relaxed text-muted-2">
          ถ้ามีบัญชีที่ใช้อีเมล {email.trim()} เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปให้แล้ว
        </p>
        <Link
          href="/login"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-input-border bg-surface py-2.5 text-sm font-medium text-ink-alt hover:bg-page-alt"
        >
          <i className="ph ph-arrow-left" /> กลับไปเข้าสู่ระบบ
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-2 flex items-center text-xl font-semibold">
        <i className="ph ph-key mr-2 text-primary" /> ลืมรหัสผ่าน
      </div>
      <div className="mb-6 text-[12.5px] leading-relaxed text-muted-2">
        กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้
      </div>
      <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />

      {error && (
        <div className="mb-4 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </div>
      )}

      <PrimaryButton onClick={submit} disabled={loading}>
        {loading ? 'กำลังส่ง…' : 'ส่งลิงก์รีเซ็ต'} <i className="ph ph-paper-plane-tilt" />
      </PrimaryButton>
      <div className="mt-5 flex justify-center text-[13px]">
        <Link href="/login" className="flex items-center gap-1.5 font-medium text-primary">
          <i className="ph ph-arrow-left" /> กลับไปเข้าสู่ระบบ
        </Link>
      </div>
    </AuthShell>
  );
}
