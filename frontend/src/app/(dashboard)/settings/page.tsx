'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { ThemeSegmentedControl } from '@/components/shell/ThemeToggle';
import { LanguageSegmentedControl } from '@/components/shell/LanguageToggle';
import { Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';
import { AccountMe, GitCredentialProvider, GitCredentialStatus, GithubStatus, UsageSummary } from '@/types';
import { useLang } from '@/lib/i18n';

const USAGE_POLL_MS = 10_000;

function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'allow' | 'danger' }) {
  const valueColor = tone === 'allow' ? 'text-allow-text' : tone === 'danger' ? 'text-danger-text' : 'text-ink';
  return (
    <div className="flex-1 rounded-[9px] border border-border bg-page-alt px-3 py-2.5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`text-[19px] font-bold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

// meter การใช้ RAM เทียบ limit ของ container — เกิน 90% เปลี่ยนเป็นโทนเตือน (มีตัวเลขกำกับเสมอ
// ไม่ได้สื่อด้วยสีอย่างเดียว)
function MemBar({ usedMb, limitMb }: { usedMb: number; limitMb: number }) {
  const pct = limitMb > 0 ? Math.min(100, (usedMb / limitMb) * 100) : 0;
  const critical = pct > 90;
  return (
    <div className="flex items-center gap-2">
      <div className="h-[6px] w-[110px] overflow-hidden rounded-full bg-page-alt">
        <div
          className={`h-full rounded-full ${critical ? 'bg-[rgba(214,109,82,.75)]' : 'bg-[rgba(60,56,48,.45)] dark:bg-[rgba(201,196,184,.45)]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[13px] tabular-nums text-muted">
        {usedMb}/{limitMb} MB
      </span>
    </div>
  );
}

// โครง shimmer ตอนโหลด usage — 3 stat tiles + แถบโควต้า + แถว resource ต่อแอป
function UsageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-[9px] border border-border bg-page-alt px-3 py-2.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-2 h-5 w-8" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-56" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className="h-[6px] w-[110px] rounded-full" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-48" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-[7px] w-[7px] rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-3.5 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageCard() {
  const { t } = useLang();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .usage()
        .then((u) => {
          if (!alive) return;
          setUsage(u);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    load();
    const timer = setInterval(load, USAGE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <Card>
      <CardHeader title={t('usage.title')} subtitle={t('usage.subtitle')} />
      {!usage && !failed && <UsageSkeleton />}
      {failed && !usage && <p className="text-[14.5px] text-danger-text">{t('usage.loadFailed')}</p>}
      {usage && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2.5">
            <StatTile label={t('usage.deploysTotal')} value={usage.deploys.total} />
            <StatTile label={t('usage.deploysAllowed')} value={usage.deploys.allowed} tone="allow" />
            <StatTile label={t('usage.deploysBlocked')} value={usage.deploys.blocked} tone="danger" />
          </div>

          {usage.deploys.months.length > 0 && (
            <div>
              <div className="mb-1.5 text-[13.5px] text-muted">{t('usage.monthly')}</div>
              <div className="flex flex-col gap-1">
                {usage.deploys.months.map((m) => (
                  <div key={m.month} className="flex items-center justify-between text-[14px]">
                    <span className="tabular-nums text-ink-soft">{m.month}</span>
                    <span className="tabular-nums text-muted">
                      {t('usage.monthlyRow', { total: m.total, allowed: m.allowed, blocked: m.blocked })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[13.5px] text-muted">{t('usage.quota')}</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-ink-soft">RAM</span>
                <MemBar usedMb={usage.quota.memoryUsedMb} limitMb={usage.quota.memoryQuotaMb} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-ink-soft">CPU</span>
                <span className="text-[13px] tabular-nums text-muted">
                  {usage.quota.cpuUsed}/{usage.quota.cpuQuota} cores
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13.5px] text-muted">{t('usage.perApp')}</div>
            {usage.apps.length === 0 && <p className="text-[14.5px] text-muted">{t('usage.noApps')}</p>}
            <div className="flex flex-col gap-2">
              {usage.apps.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${a.running ? 'bg-allow-dot' : 'bg-muted-3'}`}
                    />
                    <span className="truncate text-[14.5px] font-semibold">{a.name}</span>
                    <span className="shrink-0 text-[12.5px] text-muted">
                      {a.running ? t('usage.appRunning') : a.cpuPercent === null ? t('usage.appNotDeployed') : t('usage.appStopped')}
                    </span>
                  </div>
                  {a.running && a.memUsedMb !== null && a.memLimitMb !== null ? (
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[13px] tabular-nums text-muted">CPU {a.cpuPercent}%</span>
                      <MemBar usedMb={a.memUsedMb} limitMb={a.memLimitMb} />
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted">—</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// สวิตช์เปิด/ปิดแบบง่าย — disabled พร้อม hint ตอน backend ยังไม่พร้อม (เช่น SMTP ไม่ถูกตั้งค่า)
function ToggleRow({
  title,
  desc,
  checked,
  disabled,
  hint,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-60' : ''}`}>
      <div>
        <div className="text-[14.5px] font-semibold">{title}</div>
        <div className="text-[13px] text-muted">{desc}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-danger-text">{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[40px] flex-none rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-[#D8D3C8] dark:bg-[#46433A]'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${
            checked ? 'left-[21px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * การ์ด 2FA (Email OTP) — flow เดียวกันทั้งเปิดและปิด: ขอรหัสไปที่อีเมล → กรอกรหัส → ยืนยัน
 * (ปิดก็ต้องมีรหัส กัน session ที่ถูกขโมยแอบปิด 2FA เอง) ปุ่ม disabled ถ้า SMTP ยังไม่ถูกตั้งค่า
 */
function TwoFactorCard({ me, setMe }: { me: AccountMe | null; setMe: (m: AccountMe) => void }) {
  const { t } = useLang();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const enabled = me?.twoFactorEnabled ?? false;
  const intent: 'enable' | 'disable' = enabled ? 'disable' : 'enable';

  const requestCode = async () => {
    setError('');
    setBusy(true);
    try {
      await api.auth.request2faOtp(intent);
      setCodeSent(true);
      setCode('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!me || !code.trim()) return;
    setError('');
    setBusy(true);
    try {
      if (intent === 'enable') await api.auth.enable2fa(code.trim());
      else await api.auth.disable2fa(code.trim());
      setMe({ ...me, twoFactorEnabled: intent === 'enable' });
      setCodeSent(false);
      setCode('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('twofa.cardTitle')} subtitle={t('twofa.cardSubtitle')} />
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[14.5px] font-semibold">
            {t('twofa.name')}
            {enabled && (
              <span className="rounded-md border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.1)] px-1.5 py-px text-[12px] font-bold text-allow-text">
                {t('twofa.badgeOn')}
              </span>
            )}
          </div>
          <div className="text-[13px] text-muted">
            {enabled ? t('twofa.descOn') : t('twofa.descOff')}
          </div>
          {me && !me.mailConfigured && (
            <div className="mt-0.5 text-[12.5px] text-danger-text">{t('twofa.smtpMissing')}</div>
          )}
        </div>
        {!codeSent && (
          <button
            onClick={requestCode}
            disabled={!me || !me.mailConfigured || busy}
            className={`rounded-[7px] border px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled
                ? 'border-[rgba(214,109,82,.35)] bg-surface text-danger-text'
                : 'border-border bg-surface text-ink-soft hover:bg-page-alt'
            }`}
          >
            {busy ? t('twofa.sending') : enabled ? t('twofa.disable') : t('twofa.enable')}
          </button>
        )}
      </div>

      {codeSent && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-1.5 text-[13.5px] text-muted">
            {t(enabled ? 'twofa.codeSentDisable' : 'twofa.codeSentEnable')}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="w-[120px] rounded-[7px] border border-border bg-page-alt px-3 py-2 font-mono text-[15px] tabular-nums outline-none focus:border-primary"
            />
            <button
              onClick={confirmCode}
              disabled={busy || !code.trim()}
              className="rounded-[7px] bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('common.confirm')}
            </button>
            <button
              onClick={() => {
                setCodeSent(false);
                setError('');
              }}
              className="px-2 py-2 text-xs font-medium text-muted hover:text-ink"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2.5 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14px] text-danger-text">
          {error}
        </div>
      )}
    </Card>
  );
}

function ThemeRow() {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[14.5px] font-semibold">{t('settings.themeTitle')}</div>
        <div className="text-[13px] text-muted">{t('settings.themeDesc')}</div>
      </div>
      <ThemeSegmentedControl />
    </div>
  );
}

function LangRow() {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[14.5px] font-semibold">{t('settings.langTitle')}</div>
        <div className="text-[13px] text-muted">{t('settings.langDesc')}</div>
      </div>
      <LanguageSegmentedControl />
    </div>
  );
}

function PrefRow({ title, desc }: { title: string; desc: string }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between opacity-60">
      <div>
        <div className="text-[14.5px] font-semibold">{title}</div>
        <div className="text-[13px] text-muted">{desc}</div>
      </div>
      <span className="rounded-full border border-border bg-page-alt px-2 py-0.5 text-[12px] font-semibold text-muted">
        {t('account.comingSoon')}
      </span>
    </div>
  );
}

// GitLab/Bitbucket ไม่มี OAuth flow เหมือน GitHub — ผู้ใช้สร้าง token ที่ฝั่ง provider แล้ว paste เข้ามา
// เก็บเข้ารหัสฝั่ง backend และไม่มี endpoint ไหนคืนค่า token กลับมาอีก (UI จึงโชว์แค่ username)
const GIT_PROVIDERS: { provider: GitCredentialProvider; label: string; icon: string; hintKey: 'settings.gitlabHint' | 'settings.bitbucketHint' }[] = [
  { provider: 'gitlab', label: 'GitLab', icon: 'ph ph-gitlab-logo-simple', hintKey: 'settings.gitlabHint' },
  { provider: 'bitbucket', label: 'Bitbucket', icon: 'ph ph-git-branch', hintKey: 'settings.bitbucketHint' },
];

function GitProviderRows() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<GitCredentialStatus[] | null>(null);
  const [openFor, setOpenFor] = useState<GitCredentialProvider | null>(null);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.gitCredentials
      .status()
      .then((r) => setStatus(r.providers))
      .catch(() => setStatus(GIT_PROVIDERS.map((p) => ({ provider: p.provider, connected: false }))));
  }, []);

  const closeForm = () => {
    setOpenFor(null);
    setToken('');
    setUsername('');
  };

  const connect = async (provider: GitCredentialProvider) => {
    setBusy(true);
    try {
      const saved = await api.gitCredentials.connect({
        provider,
        token: token.trim(),
        username: provider === 'bitbucket' ? username.trim() : undefined,
      });
      setStatus((prev) => (prev ?? []).map((s) => (s.provider === provider ? saved : s)));
      toast.success(t('toast.gitProviderConnected', { provider: labelOf(provider) }));
      closeForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (provider: GitCredentialProvider) => {
    const ok = await confirm({
      title: t('settings.disconnectProviderTitle'),
      body: t('settings.disconnectProviderBody'),
      confirmLabel: t('settings.disconnect'),
      danger: true,
    });
    if (!ok) return;
    await api.gitCredentials.disconnect(provider).catch(() => undefined);
    setStatus((prev) => (prev ?? []).map((s) => (s.provider === provider ? { provider, connected: false } : s)));
    toast.success(t('toast.gitProviderDisconnected', { provider: labelOf(provider) }));
  };

  if (!status) return null;

  return (
    <>
      {GIT_PROVIDERS.map(({ provider, label, icon, hintKey }) => {
        const conn = status.find((s) => s.provider === provider);
        const open = openFor === provider;
        // bitbucket ต้องมีทั้ง username และ app password — gitlab ใช้แค่ token
        const canSubmit = !!token.trim() && (provider !== 'bitbucket' || !!username.trim());
        return (
          <div key={provider} className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <i className={`${icon} text-[30px]`} />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{label}</div>
                  <div className="truncate text-[13.5px] text-muted">
                    {conn?.connected ? (
                      <>
                        {t('settings.connectedAs')} <span className="font-semibold text-ink">{conn.username}</span>
                      </>
                    ) : (
                      t('settings.notConnected')
                    )}
                  </div>
                </div>
              </div>
              {conn?.connected ? (
                <button
                  onClick={() => disconnect(provider)}
                  className="flex-none rounded-[7px] border border-[rgba(214,109,82,.35)] bg-surface px-3.5 py-2 text-xs font-medium text-danger-text"
                >
                  {t('settings.disconnect')}
                </button>
              ) : (
                <button
                  onClick={() => (open ? closeForm() : (closeForm(), setOpenFor(provider)))}
                  className="flex-none rounded-[7px] border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft"
                >
                  {open ? t('common.cancel') : t('settings.connect')}
                </button>
              )}
            </div>

            {open && !conn?.connected && (
              <div className="mt-3 flex flex-col gap-2 rounded-[9px] border border-border bg-page-alt p-3">
                <p className="text-[13px] text-muted">{t(hintKey)}</p>
                {provider === 'bitbucket' && (
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('settings.usernamePlaceholder')}
                    autoComplete="off"
                    className="rounded-[7px] border border-border bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
                  />
                )}
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('settings.tokenPlaceholder')}
                  autoComplete="off"
                  className="rounded-[7px] border border-border bg-surface px-3 py-2 font-mono text-[14px] text-ink outline-none focus:border-primary"
                />
                <button
                  onClick={() => connect(provider)}
                  disabled={busy || !canSubmit}
                  className="self-start rounded-[7px] bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  {busy ? t('common.saving') : t('settings.connect')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function labelOf(provider: GitCredentialProvider): string {
  return GIT_PROVIDERS.find((p) => p.provider === provider)?.label ?? provider;
}

export default function SettingsPage() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [gh, setGh] = useState<GithubStatus | null>(null);
  const [plan, setPlan] = useState('free');
  const [me, setMe] = useState<AccountMe | null>(null);

  useEffect(() => {
    api.github.status().then(setGh).catch(() => setGh({ connected: false }));
    api.account.me().then(setMe).catch(() => undefined);
    setPlan(localStorage.getItem('gk_plan') || 'free');
  }, []);

  const toggleNotifyEmail = async (next: boolean) => {
    if (!me) return;
    const prev = me;
    setMe({ ...me, notifyEmail: next }); // optimistic — พลาดค่อย revert
    try {
      await api.account.updatePrefs({ notifyEmail: next });
      toast.success(t('common.saved'));
    } catch (e: any) {
      // revert แล้วบอกด้วยว่าทำไม — เดิม toggle เด้งกลับเองเงียบๆ เหมือนแอปค้าง
      setMe(prev);
      toast.error(e.message);
    }
  };

  const disconnectGithub = async () => {
    const ok = await confirm({
      title: t('confirm.disconnectGithubTitle'),
      body: t('confirm.disconnectGithubBody'),
      confirmLabel: t('settings.disconnect'),
      danger: true,
    });
    if (!ok) return;
    await api.github.disconnect().catch(() => undefined);
    setGh({ connected: false });
    toast.success(t('toast.githubDisconnected'));
  };

  return (
    <>
      <TopBar variant="title" title={t('settings.title')} titleIcon="ph ph-sliders" />

      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-6">
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          <Card>
            <CardHeader title={t('settings.prefs')} subtitle={t('settings.prefsSub')} />
            <div className="flex flex-col gap-4">
              <ThemeRow />
              <LangRow />
              <ToggleRow
                title={t('settings.emailNotif')}
                desc={t('settings.emailNotifDesc')}
                checked={me?.notifyEmail ?? false}
                disabled={!me || !me.mailConfigured}
                hint={me && !me.mailConfigured ? t('settings.smtpMissingToggle') : undefined}
                onChange={toggleNotifyEmail}
              />
              <PrefRow title={t('settings.autoDeployPref')} desc={t('settings.autoDeployPrefDesc')} />
            </div>
          </Card>

          {/* plan */}
          <Card>
            <CardHeader
              title={t('settings.currentPlan')}
              subtitle={t('settings.currentPlanSub')}
              divider={false}
              right={
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.12)] px-3 py-[5px] text-[13.5px] font-bold text-allow-text">
                  <i className="ph-fill ph-star" /> {plan.toUpperCase()}
                </span>
              }
            />
            <div className="mt-4 border-t border-border pt-3.5">
              <div className="mb-[7px] text-[13.5px] text-muted">{t('settings.allowedRuntimes')}</div>
              <div className="text-[15px] font-semibold">Node.js, Static</div>
            </div>
          </Card>

          {/* usage — CPU/RAM สดต่อแอป + สถิติ deploy ของบัญชีนี้ */}
          <UsageCard />

          {/* connected accounts */}
          <Card>
            <CardHeader title={t('settings.connectedAccounts')} subtitle={t('settings.connectedAccountsSub')} />
            {!gh && <p className="text-[14.5px] text-muted">{t('settings.checking')}</p>}
            {gh && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <i className="ph-fill ph-github-logo text-[30px]" />
                  <div>
                    <div className="text-[15px] font-semibold">GitHub</div>
                    <div className="text-[13.5px] text-muted">
                      {gh.connected ? (
                        <>{t('settings.connectedAs')} <span className="font-semibold text-ink">{gh.username}</span></>
                      ) : (
                        t('settings.notConnected')
                      )}
                    </div>
                  </div>
                </div>
                {gh.connected ? (
                  <button onClick={disconnectGithub} className="rounded-[7px] border border-[rgba(214,109,82,.35)] bg-surface px-3.5 py-2 text-xs font-medium text-danger-text">
                    {t('settings.disconnect')}
                  </button>
                ) : (
                  <a href="/deploy" className="rounded-[7px] border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft">
                    {t('settings.connect')}
                  </a>
                )}
              </div>
            )}

            {/* gitlab/bitbucket — ไม่มี OAuth flow ต้อง paste token เอง (ใช้ clone repo ส่วนตัว) */}
            <GitProviderRows />
          </Card>

          {/* security — 2FA แบบรหัสทางอีเมล (เปิด/ปิดต้องยืนยันรหัสจากอีเมลทั้งคู่) */}
          <TwoFactorCard me={me} setMe={setMe} />
        </div>
      </div>
    </>
  );
}
