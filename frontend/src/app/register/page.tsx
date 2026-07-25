'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import AuthShell, { Field, PrimaryButton, OAuthButtons } from '@/components/shell/AuthShell';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const syncAndEnter = async (accessToken: string) => {
    const res = await api.auth.syncSession(accessToken);
    // บัญชีสมัครใหม่ยังไม่มีทางเปิด 2FA — กันไว้เชิง type/ขอบเคส (เช่น email เดิม re-register)
    if ('mfaRequired' in res) {
      router.push('/login?reason=mfa');
      return;
    }
    localStorage.setItem('gk_authed', '1');
    localStorage.setItem('gk_key_prefix', res.keyPrefix);
    localStorage.setItem('gk_plan', res.plan);
    localStorage.setItem('gk_email', res.email);
    localStorage.setItem('gk_last_activity', String(Date.now()));
    router.push('/');
  };

  const submit = async () => {
    setError('');
    setCheckEmail(false);
    if (!email.trim() || !password) {
      setError('กรุณากรอก email และ password');
      return;
    }
    if (password.length < 8 || !/\d/.test(password)) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }
    setLoading(true);
    try {
      // full_name เก็บเป็น Supabase user_metadata — gatekeeper account (backend) ยังไม่มี
      // ฟิลด์ชื่อ ใช้แสดงผลฝั่ง Supabase/อนาคตเท่านั้น
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() || undefined } },
      });
      if (err) throw err;
      if (!data.session) {
        // โปรเจกต์ Supabase เปิด "Confirm email" ไว้ — ต้องกดยืนยันในอีเมลก่อนถึงจะ login ได้
        setCheckEmail(true);
        return;
      }
      await syncAndEnter(data.session.access_token);
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: 'github' | 'google') => {
    setError('');
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
  };

  if (checkEmail) {
    return (
      <AuthShell>
        <div className="mb-2 flex items-center gap-2 text-xl font-semibold text-allow-text">
          <i className="ph-fill ph-envelope-simple-open" /> เช็คอีเมลของคุณ
        </div>
        <p className="mb-6 text-[14.5px] leading-relaxed text-muted-2">
          ส่งลิงก์ยืนยันไปที่ {email.trim()} แล้ว — กดยืนยันก่อนถึงจะเข้าสู่ระบบได้
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
      <div className="mb-6 flex items-center text-xl font-semibold">สมัครสมาชิก</div>
      <Field label="Full Name" placeholder="Studio Dup" value={fullName} onChange={setFullName} />
      <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
      <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={setPassword} />
      <div className="mb-2">
        <Field
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
      </div>
      <div className="my-1 text-[13px] text-muted-2">ต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข</div>

      {error && (
        <div className="mt-3 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14.5px] text-danger-text">
          {error}
        </div>
      )}

      <PrimaryButton className="mt-3" onClick={submit} disabled={loading}>
        {loading ? 'กำลังสมัครสมาชิก…' : 'สมัครสมาชิก'} <i className="ph ph-arrow-right" />
      </PrimaryButton>
      <div className="mt-4 text-center text-[15px] text-muted-2">
        มีบัญชีอยู่แล้ว?{' '}
        <Link href="/login" className="font-medium text-primary">
          เข้าสู่ระบบ
        </Link>
      </div>
      <OAuthButtons onOAuth={oauth} />
    </AuthShell>
  );
}
