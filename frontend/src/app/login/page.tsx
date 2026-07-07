'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Github, CheckCircle2, Lock, Mail, Clock } from 'lucide-react';

type Mode = 'login' | 'register';

// ข้อความแจ้งเหตุที่ถูกพากลับมาหน้านี้ (จาก AuthProvider idle timer / api.ts ดัก 401)
const REASON_NOTICES: Record<string, string> = {
  idle: 'ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานเกิน 15 นาที — เข้าสู่ระบบใหม่อีกครั้ง',
  expired: 'เซสชันหมดอายุแล้ว — เข้าสู่ระบบใหม่อีกครั้ง',
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [notice, setNotice] = useState('');

  // อ่าน ?reason= จาก URL ตรงๆ ใน effect แทน useSearchParams — เลี่ยงข้อบังคับ Suspense
  // boundary ของ Next ตอน prerender หน้า client component
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason') || '';
    if (REASON_NOTICES[reason]) setNotice(REASON_NOTICES[reason]);
  }, []);

  // หลัง Supabase auth สำเร็จ (มี access token จริงในมือ) ไปแลกเป็น gatekeeper api_key
  // ที่ backend สร้าง/หาให้ตาม supabase_user_id แล้วเก็บไว้ใช้เรียก API ตัวอื่นๆ ต่อ
  const syncAndEnter = async (accessToken: string) => {
    const res = await api.auth.syncSession(accessToken);
    localStorage.setItem('gk_api_key', res.apiKey);
    // เริ่มนับ idle ใหม่จากตอน login — ถ้าปล่อย stamp เก่าค้างไว้ (เช่นแช่หน้า login นาน)
    // AuthProvider จะเตะออกทันทีที่เข้า dashboard
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
    setLoading(true);
    try {
      if (mode === 'register') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (!data.session) {
          // โปรเจกต์ Supabase เปิด "Confirm email" ไว้ — ต้องกดยืนยันในอีเมลก่อนถึงจะ login ได้
          setCheckEmail(true);
          return;
        }
        await syncAndEnter(data.session.access_token);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        await syncAndEnter(data.session.access_token);
      }
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
    <div className="min-h-screen bg-surface text-text flex flex-col">
      <header className="flex items-center gap-2 px-4 h-12 border-b border-border bg-panel">
        <span className="text-accent font-mono font-bold text-sm">🔐 Gatekeeper</span>
      </header>

      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {notice && !checkEmail && (
            <div className="flex items-start gap-2 bg-panel border border-border rounded-xl px-3 py-2.5">
              <Clock size={14} className="text-sub mt-0.5 shrink-0" />
              <p className="text-xs font-mono text-sub">{notice}</p>
            </div>
          )}
          {checkEmail ? (
            <div className="bg-panel border border-green/50 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Mail className="text-green" size={20} />
                <span className="font-mono font-bold text-base text-green">เช็คอีเมลของคุณ</span>
              </div>
              <p className="text-xs font-mono text-sub">
                ส่งลิงก์ยืนยันไปที่ {email.trim()} แล้ว — กดยืนยันก่อนถึงจะเข้าสู่ระบบได้
              </p>
              <button
                onClick={() => { setCheckEmail(false); setMode('login'); }}
                className="w-full text-sm text-sub hover:text-text border border-border rounded-lg py-2 font-mono"
              >
                กลับไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          ) : (
            <div className="bg-panel border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Lock size={14} className="text-sub" />
                <h2 className="font-semibold text-base">
                  {mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                </h2>
              </div>

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent placeholder:text-muted"
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'อย่างน้อย 6 ตัวอักษร' : '••••••••'}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent placeholder:text-muted"
                />
              </Field>

              {error && (
                <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={submit}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-accent text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? 'กำลังดำเนินการ…'
                  : mode === 'login'
                    ? 'เข้าสู่ระบบ →'
                    : 'สมัครสมาชิก →'}
              </button>

              <button
                onClick={() => {
                  setError('');
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
                className="w-full text-xs text-sub hover:text-text font-mono text-center"
              >
                {mode === 'login' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ'}
              </button>

              <div className="flex items-center gap-2 text-[10px] text-muted font-mono">
                <div className="flex-1 h-px bg-border" />
                หรือ
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => oauth('github')}
                  className="w-full flex items-center justify-center gap-2 bg-surface border border-border rounded-xl py-2.5 text-sm font-mono hover:border-muted transition-colors"
                >
                  <Github size={16} /> Continue with GitHub
                </button>
                <button
                  onClick={() => oauth('google')}
                  className="w-full flex items-center justify-center gap-2 bg-surface border border-border rounded-xl py-2.5 text-sm font-mono hover:border-muted transition-colors"
                >
                  <GoogleIcon /> Continue with Google
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-sub font-mono block mb-1">{label}</label>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
