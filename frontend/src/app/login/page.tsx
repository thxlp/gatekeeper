'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, AuthResult } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import AuthShell, { AuthForm, Field, PrimaryButton, OAuthButtons } from '@/components/shell/AuthShell';
import { useLang, type MsgKey } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';

// เหตุที่ถูกพากลับมาหน้านี้ (จาก AuthProvider idle timer / api.ts ดัก 401) → คีย์ข้อความ
const REASON_NOTICES: Record<string, MsgKey> = {
  idle: 'auth.noticeIdle',
  expired: 'auth.noticeExpired',
  mfa: 'auth.noticeMfa',
};

const RESEND_COOLDOWN_S = 60;

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  useDocumentTitle(t('auth.login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<MsgKey | ''>('');
  // 2FA: 'otp' = ผ่าน Supabase (first factor) แล้ว รอรหัสจากอีเมล — เก็บ access token ไว้ใช้
  // เรียก verify/resend (ยังไม่มี gk_session cookie จนกว่ารหัสจะถูก)
  const [stage, setStage] = useState<'credentials' | 'otp'>('credentials');
  const [accessToken, setAccessToken] = useState('');
  const [otp, setOtp] = useState('');
  const [resendLeft, setResendLeft] = useState(0);

  // อ่าน ?reason= จาก URL ตรงๆ ใน effect แทน useSearchParams — เลี่ยงข้อบังคับ Suspense
  // boundary ของ Next ตอน prerender หน้า client component
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason') || '';
    if (REASON_NOTICES[reason]) setNotice(REASON_NOTICES[reason]);
    // ถูกส่งกลับมาจาก use-api-key (เช่น OAuth landing แล้วเจอ mfaRequired) — Supabase session
    // ยังอยู่ใน localStorage ดึงมาเข้าหน้ากรอกรหัสได้เลย (backend ส่งรหัสให้แล้วตอน /auth/session)
    if (reason === 'mfa') {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setAccessToken(data.session.access_token);
          setStage('otp');
          setResendLeft(RESEND_COOLDOWN_S);
        }
      });
    }
  }, []);

  // countdown ปุ่ม "ส่งรหัสอีกครั้ง"
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);

  const finishLogin = (res: AuthResult) => {
    localStorage.setItem('gk_authed', '1');
    localStorage.setItem('gk_key_prefix', res.keyPrefix);
    localStorage.setItem('gk_plan', res.plan);
    localStorage.setItem('gk_email', res.email);
    localStorage.setItem('gk_last_activity', String(Date.now()));
    router.push('/');
  };

  // หลัง Supabase auth สำเร็จ (มี access token จริงในมือ) ไปแลกเป็น gatekeeper api_key —
  // backend เซ็ต key จริงผ่าน httpOnly cookie เอง (ดู lib/api.ts) เราเก็บแค่ flag ไม่ลับ
  // "gk_authed" ไว้บอก UI/idle-timer ว่า login แล้ว — บัญชีที่เปิด 2FA จะได้ mfaRequired
  // กลับมาแทน ต้องกรอกรหัสจากอีเมลก่อนถึงได้ cookie
  const syncAndEnter = async (token: string) => {
    const res = await api.auth.syncSession(token);
    if ('mfaRequired' in res) {
      setAccessToken(token);
      setStage('otp');
      setOtp('');
      setResendLeft(RESEND_COOLDOWN_S);
      return;
    }
    finishLogin(res);
  };

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError(t('auth.errRequired'));
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
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setError('');
    if (!otp.trim()) {
      setError(t('auth.mfaErrCodeRequired'));
      return;
    }
    setLoading(true);
    try {
      finishLogin(await api.auth.verifyOtp(accessToken, otp.trim()));
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setError('');
    try {
      await api.auth.resendOtp(accessToken);
      setResendLeft(RESEND_COOLDOWN_S);
    } catch (e: any) {
      setError(e.message || t('common.error'));
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

  if (stage === 'otp') {
    return (
      <AuthShell>
        <div className="mb-2 flex items-center text-xl font-semibold">{t('auth.mfaTitle')}</div>
        <p className="mb-5 text-[14.5px] text-muted">{t('auth.mfaSubtitle')}</p>

        <AuthForm onSubmit={submitOtp}>
          <Field
            label={t('auth.mfaCodeLabel')}
            type="text"
            autoComplete="one-time-code"
            placeholder="000000"
            value={otp}
            onChange={setOtp}
          />

          {error && (
            <div className="mb-4 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14.5px] text-danger-text">
              {error}
            </div>
          )}

          <PrimaryButton className="mt-2" type="submit" disabled={loading}>
            {loading ? t('auth.mfaChecking') : t('common.confirm')} <i className="ph ph-arrow-right" />
          </PrimaryButton>
        </AuthForm>

        <div className="mt-4 flex justify-between text-[15px]">
          <button
            onClick={resendOtp}
            disabled={resendLeft > 0}
            className="font-medium text-primary disabled:cursor-not-allowed disabled:text-muted"
          >
            {resendLeft > 0 ? t('auth.mfaResendIn', { n: resendLeft }) : t('auth.mfaResend')}
          </button>
          <button
            onClick={() => {
              setStage('credentials');
              setError('');
            }}
            className="font-medium text-primary"
          >
            {t('auth.backToLoginPage')}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6 flex items-center text-xl font-semibold">{t('auth.login')}</div>

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-page-alt px-3 py-2.5">
          <i className="ph ph-clock mt-0.5 shrink-0 text-muted" />
          <p className="text-xs text-ink-soft">{t(notice as MsgKey)}</p>
        </div>
      )}

      <AuthForm onSubmit={submit}>
        <Field label={t('auth.email')} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <Field
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
        />

        {error && (
          <div className="mb-4 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14.5px] text-danger-text">
            {error}
          </div>
        )}

        <PrimaryButton className="mt-2" type="submit" disabled={loading}>
          {loading ? t('auth.loggingIn') : t('auth.login')} <i className="ph ph-arrow-right" />
        </PrimaryButton>
      </AuthForm>
      <div className="mt-4 flex justify-between text-[15px]">
        <Link href="/forgot-password" className="font-medium text-primary">
          {t('auth.forgotPassword')}
        </Link>
        <Link href="/register" className="font-medium text-primary">
          {t('auth.noAccountYet')}
        </Link>
      </div>
      <OAuthButtons onOAuth={oauth} />
    </AuthShell>
  );
}
