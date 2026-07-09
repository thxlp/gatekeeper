'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import AuthShell, { Field, PrimaryButton, OAuthButtons } from '@/components/shell/AuthShell';

// ข้อความแจ้งเหตุที่ถูกพากลับมาหน้านี้ (จาก AuthProvider idle timer / api.ts ดัก 401)
const REASON_NOTICES: Record<string, string> = {
  idle: 'ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานเกิน 15 นาที — เข้าสู่ระบบใหม่อีกครั้ง',
  expired: 'เซสชันหมดอายุแล้ว — เข้าสู่ระบบใหม่อีกครั้ง',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  // อ่าน ?reason= จาก URL ตรงๆ ใน effect แทน useSearchParams — เลี่ยงข้อบังคับ Suspense
  // boundary ของ Next ตอน prerender หน้า client component
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason') || '';
    if (REASON_NOTICES[reason]) setNotice(REASON_NOTICES[reason]);
  }, []);

  // หลัง Supabase auth สำเร็จ (มี access token จริงในมือ) ไปแลกเป็น gatekeeper api_key —
  // backend เซ็ต key จริงผ่าน httpOnly cookie เอง (ดู lib/api.ts) เราเก็บแค่ flag ไม่ลับ
  // "gk_authed" ไว้บอก UI/idle-timer ว่า login แล้ว (ไม่ใช่ secret — อ่านค่านี้ไม่ช่วยปลอมตัว)
  const syncAndEnter = async (accessToken: string) => {
    const res = await api.auth.syncSession(accessToken);
    localStorage.setItem('gk_authed', '1');
    localStorage.setItem('gk_key_prefix', res.keyPrefix);
    localStorage.setItem('gk_plan', res.plan);
    localStorage.setItem('gk_email', res.email);
    localStorage.setItem('gk_last_activity', String(Date.now()));
    router.push('/');
  };

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('กรุณากรอก email และ password');
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
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
    // เบราว์เซอร์จะ redirect ออกจากหน้านี้ไปเลย — ไม่มีอะไรต้องทำต่อ
  };

  return (
    <AuthShell>
      <div className="mb-6 flex items-center text-xl font-semibold">เข้าสู่ระบบ</div>

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-page-alt px-3 py-2.5">
          <i className="ph ph-clock mt-0.5 shrink-0 text-muted" />
          <p className="text-xs text-ink-soft">{notice}</p>
        </div>
      )}

      <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
      <Field
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={setPassword}
      />

      {error && (
        <div className="mb-4 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </div>
      )}

      <PrimaryButton className="mt-2" onClick={submit} disabled={loading}>
        {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'} <i className="ph ph-arrow-right" />
      </PrimaryButton>
      <div className="mt-4 flex justify-between text-[13px]">
        <Link href="/forgot-password" className="font-medium text-primary">
          ลืมรหัสผ่าน?
        </Link>
        <Link href="/register" className="font-medium text-primary">
          ยังไม่มีบัญชี? สมัครสมาชิก
        </Link>
      </div>
      <OAuthButtons onOAuth={oauth} />
    </AuthShell>
  );
}
