'use client';

import { useEffect, useId, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { Card, CardHeader } from '@/components/ui/primitives';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthProvider';
import { useLang } from '@/lib/i18n';

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <div className="rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] text-muted">{value}</div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••••"
        className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

export default function AccountPage() {
  const { logout } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');
  // บัญชีที่สมัครด้วยอีเมลมี identity provider 'email' = มีรหัสผ่านให้ยืนยันได้
  // บัญชีที่มาจาก GitHub/Google ล้วนๆ ยังไม่มีรหัสผ่าน — ตั้งครั้งแรกได้เลย (ไม่มีอะไรให้ยืนยัน)
  // ถ้าอ่าน identities ไม่ได้ ให้ถือว่ามีรหัสผ่านไว้ก่อน = ฝั่งที่ปลอดภัยกว่า
  const [hasPassword, setHasPassword] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    setEmail(localStorage.getItem('gk_email') || '');
    setKeyPrefix(localStorage.getItem('gk_key_prefix') || '');
    // อีเมลจาก session เป็นค่าจริงกว่าที่ค้างใน localStorage — และต้องใช้ยืนยันรหัสเดิมด้วย
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (!user) return;
        if (user.email) setEmail(user.email);
        setHasPassword(!user.identities?.length || user.identities.some((i) => i.provider === 'email'));
      })
      .catch(() => undefined);
  }, []);

  const updatePassword = async () => {
    setPwError('');
    setPwSuccess(false);
    if (hasPassword && !currentPassword) {
      setPwError(t('account.errCurrentRequired'));
      return;
    }
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      setPwError(t('auth.errPasswordWeak'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t('auth.errPasswordMismatch'));
      return;
    }
    if (hasPassword && currentPassword === newPassword) {
      setPwError(t('account.errSameAsOld'));
      return;
    }
    setPwLoading(true);
    try {
      if (hasPassword) {
        if (!email) throw new Error(t('account.errNoSession'));
        // Supabase ไม่มี API ตรวจรหัสผ่านปัจจุบันโดยเฉพาะ — signInWithPassword คือวิธียืนยัน
        // สำเร็จ = ได้ session ใหม่ของ user เดิมทับใน localStorage (ไม่แตะ gk_session cookie
        // เพราะ 2FA/คุกกี้ของ gatekeeper อยู่คนละชั้น) ล้มเหลว = session เดิมไม่ถูกแตะต้อง
        const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        // แยกเคส "รหัสเดิมผิด" ออกจาก error อื่น (เช่น 429 rate limit) ที่ต้องเห็นข้อความจริง
        if (error) {
          const wrongPassword = error.code === 'invalid_credentials' || error.status === 400;
          throw new Error(wrongPassword ? t('account.errCurrentWrong') : error.message);
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setPwError(e.message || t('common.error'));
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
      <TopBar
        variant="title"
        title={t('account.title')}
        titleIcon="ph ph-user-circle"
        right={
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[14.5px] font-medium text-danger-text"
          >
            <i className="ph ph-sign-out" /> {t('auth.logout')}
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-6">
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          <Card>
            <CardHeader title={t('account.cardTitle')} subtitle={t('account.cardSubtitle')} />
            <ReadonlyField label={t('account.emailLabel')} value={email} />
          </Card>

          <Card>
            <CardHeader
              title={hasPassword ? t('account.changePassword') : t('account.setPassword')}
              subtitle={hasPassword ? t('account.changePasswordSub') : t('account.setPasswordSub')}
            />
            {hasPassword && (
              <div className="mb-3.5">
                <PasswordField
                  label={t('account.currentPassword')}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="mb-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <PasswordField
                label={t('account.newPassword')}
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
              <PasswordField
                label={t('auth.confirmPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
            </div>
            {pwError && (
              <div className="mb-3.5 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14px] text-danger-text">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="mb-3.5 rounded-md border border-allow-dot/30 bg-[rgba(115,169,140,.08)] px-3 py-2 text-[14px] text-allow-text">
                {t('account.updateSuccess')}
              </div>
            )}
            <button
              onClick={updatePassword}
              disabled={pwLoading || !newPassword || (hasPassword && !currentPassword)}
              className="flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[14.5px] font-semibold text-ink disabled:opacity-50"
            >
              <i className="ph ph-key" />{' '}
              {pwLoading
                ? hasPassword
                  ? t('account.verifying')
                  : t('account.updating')
                : hasPassword
                  ? t('account.updatePassword')
                  : t('account.setPassword')}
            </button>
          </Card>

          {/* api key — เห็นได้แค่ prefix ของอุปกรณ์นี้ (ค่าเต็มไปทาง httpOnly cookie เท่านั้น
              ไม่มี endpoint แสดงรายการ key ทั้งหมดของบัญชี ณ ตอนนี้) */}
          <Card>
            <CardHeader title={t('account.apiKey')} subtitle={t('account.apiKeySub')} />
            <div className="flex items-center justify-between rounded-lg border border-border bg-page-alt px-3 py-[9px]">
              <span className="font-mono text-xs text-ink-soft">{keyPrefix || '—'}••••••••••••••••••••••••</span>
              <span className="rounded-[5px] bg-[rgba(74,144,226,.08)] px-1.5 py-0.5 text-[11.5px] font-bold text-primary">{t('account.thisDevice')}</span>
            </div>
          </Card>

          {/* danger zone — ไม่มี endpoint ลบบัญชีในระบบตอนนี้ */}
          <Card className="border-[rgba(214,109,82,.35)]">
            <CardHeader
              title={
                <span className="flex items-center gap-1.5 text-danger-text">
                  <i className="ph ph-warning" /> {t('account.dangerZone')}
                </span>
              }
              subtitle={t('account.dangerZoneSub')}
            />
            <div className="flex items-center justify-between opacity-60">
              <div>
                <div className="text-[14.5px] font-semibold">{t('account.deleteAccount')}</div>
                <div className="text-[13px] text-muted">{t('account.deleteAccountSub')}</div>
              </div>
              <span className="rounded-full border border-border bg-page-alt px-2 py-0.5 text-[12px] font-semibold text-muted">{t('account.comingSoon')}</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
