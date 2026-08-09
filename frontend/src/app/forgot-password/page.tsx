'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AuthShell, { AuthForm, Field, PrimaryButton } from '@/components/shell/AuthShell';
import { useLang } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';

export default function ForgotPasswordPage() {
  const { t } = useLang();
  useDocumentTitle(t('auth.forgotTitle'));
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim()) {
      setError(t('auth.errEmailRequired'));
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
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div className="mb-2 flex items-center gap-2 text-xl font-semibold text-allow-text">
          <i className="ph-fill ph-envelope-simple-open" /> {t('auth.forgotSentTitle')}
        </div>
        <p className="mb-6 text-[14.5px] leading-relaxed text-muted-2">
          {t('auth.forgotSentBody', { email: email.trim() })}
        </p>
        <Link
          href="/login"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-input-border bg-surface py-2.5 text-sm font-medium text-ink-alt hover:bg-page-alt"
        >
          <i className="ph ph-arrow-left" /> {t('auth.backToLogin')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-2 flex items-center text-xl font-semibold">
        <i className="ph ph-key mr-2 text-primary" /> {t('auth.forgotTitle')}
      </div>
      <div className="mb-6 text-[14.5px] leading-relaxed text-muted-2">{t('auth.forgotSubtitle')}</div>
      <AuthForm onSubmit={submit}>
        <Field label={t('auth.email')} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} />

        {error && (
          <div className="mb-4 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14.5px] text-danger-text">
            {error}
          </div>
        )}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? t('auth.forgotSending') : t('auth.forgotSubmit')} <i className="ph ph-paper-plane-tilt" />
        </PrimaryButton>
      </AuthForm>
      <div className="mt-5 flex justify-center text-[15px]">
        <Link href="/login" className="flex items-center gap-1.5 font-medium text-primary">
          <i className="ph ph-arrow-left" /> {t('auth.backToLogin')}
        </Link>
      </div>
    </AuthShell>
  );
}
