'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/shell/TopBar';
import { Card, CardHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { AccountMe, GithubStatus, UsageSummary } from '@/types';

const USAGE_POLL_MS = 10_000;

function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'allow' | 'danger' }) {
  const valueColor = tone === 'allow' ? 'text-allow-text' : tone === 'danger' ? 'text-danger-text' : 'text-ink';
  return (
    <div className="flex-1 rounded-[9px] border border-border bg-page-alt px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
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
          className={`h-full rounded-full ${critical ? 'bg-[rgba(214,109,82,.75)]' : 'bg-[rgba(60,56,48,.45)]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted">
        {usedMb}/{limitMb} MB
      </span>
    </div>
  );
}

function UsageCard() {
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
      <CardHeader title="Usage" subtitle="ผลการใช้งานของบัญชีนี้ · CPU/RAM สดต่อแอป และสถิติ deploy" />
      {!usage && !failed && <p className="text-[12.5px] text-muted">กำลังโหลด…</p>}
      {failed && !usage && <p className="text-[12.5px] text-danger-text">โหลดข้อมูลการใช้งานไม่สำเร็จ</p>}
      {usage && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2.5">
            <StatTile label="Deploy ทั้งหมด" value={usage.deploys.total} />
            <StatTile label="ผ่าน" value={usage.deploys.allowed} tone="allow" />
            <StatTile label="ถูกบล็อก" value={usage.deploys.blocked} tone="danger" />
          </div>

          {usage.deploys.months.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11.5px] text-muted">รายเดือน (ล่าสุดก่อน)</div>
              <div className="flex flex-col gap-1">
                {usage.deploys.months.map((m) => (
                  <div key={m.month} className="flex items-center justify-between text-[12px]">
                    <span className="tabular-nums text-ink-soft">{m.month}</span>
                    <span className="tabular-nums text-muted">
                      {m.total} ครั้ง · ผ่าน {m.allowed} · บล็อก {m.blocked}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[11.5px] text-muted">โควต้าทรัพยากรของบัญชี (ผลรวมเพดานทุกแอป+addon)</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-soft">RAM</span>
                <MemBar usedMb={usage.quota.memoryUsedMb} limitMb={usage.quota.memoryQuotaMb} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-soft">CPU</span>
                <span className="text-[11px] tabular-nums text-muted">
                  {usage.quota.cpuUsed}/{usage.quota.cpuQuota} cores
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11.5px] text-muted">Resource ต่อแอป (สดจาก container)</div>
            {usage.apps.length === 0 && <p className="text-[12.5px] text-muted">ยังไม่มีแอปที่ลงทะเบียนไว้</p>}
            <div className="flex flex-col gap-2">
              {usage.apps.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${a.running ? 'bg-[#73A98C]' : 'bg-[#C9C4B8]'}`}
                    />
                    <span className="truncate text-[12.5px] font-semibold">{a.name}</span>
                    <span className="shrink-0 text-[10.5px] text-muted">{a.running ? 'running' : a.cpuPercent === null ? 'ยังไม่ deploy' : 'stopped'}</span>
                  </div>
                  {a.running && a.memUsedMb !== null && a.memLimitMb !== null ? (
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[11px] tabular-nums text-muted">CPU {a.cpuPercent}%</span>
                      <MemBar usedMb={a.memUsedMb} limitMb={a.memLimitMb} />
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted">—</span>
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
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="text-[11px] text-muted">{desc}</div>
        {hint && <div className="mt-0.5 text-[10.5px] text-danger-text">{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[40px] flex-none rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-[#D8D3C8]'
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
      <CardHeader title="Security" subtitle="เพิ่มระดับความปลอดภัยด้วยการยืนยันตัวตนสองขั้นตอน" />
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold">
            Two-Factor Authentication (2FA)
            {enabled && (
              <span className="rounded-md border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.1)] px-1.5 py-px text-[10px] font-bold text-allow-text">
                เปิดอยู่
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted">
            {enabled
              ? 'ทุกครั้งที่ login ต้องกรอกรหัสที่ส่งไปที่อีเมลด้วย'
              : 'ป้องกันการเข้าถึงที่ไม่ได้รับอนุญาต แม้รหัสผ่านจะถูกขโมย — ยืนยันด้วยรหัสทางอีเมล'}
          </div>
          {me && !me.mailConfigured && (
            <div className="mt-0.5 text-[10.5px] text-danger-text">ยังไม่ได้ตั้งค่า SMTP บนเซิร์ฟเวอร์ — ใช้ 2FA ไม่ได้</div>
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
            {busy ? 'กำลังส่งรหัส…' : enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </button>
        )}
      </div>

      {codeSent && (
        <div className="mt-3 border-t border-[#F0EDE6] pt-3">
          <div className="mb-1.5 text-[11.5px] text-muted">
            ส่งรหัส 6 หลักไปที่อีเมลของคุณแล้ว — กรอกเพื่อยืนยัน{enabled ? 'การปิด' : 'การเปิด'} 2FA
          </div>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="w-[120px] rounded-[7px] border border-border bg-page-alt px-3 py-2 font-mono text-[13px] tabular-nums outline-none focus:border-primary"
            />
            <button
              onClick={confirmCode}
              disabled={busy || !code.trim()}
              className="rounded-[7px] bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              ยืนยัน
            </button>
            <button
              onClick={() => {
                setCodeSent(false);
                setError('');
              }}
              className="px-2 py-2 text-xs font-medium text-muted hover:text-ink"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2.5 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[12px] text-danger-text">
          {error}
        </div>
      )}
    </Card>
  );
}

function PrefRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-center justify-between opacity-60">
      <div>
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="text-[11px] text-muted">{desc}</div>
      </div>
      <span className="rounded-full border border-border bg-page-alt px-2 py-0.5 text-[10px] font-semibold text-muted">
        เร็วๆ นี้
      </span>
    </div>
  );
}

export default function SettingsPage() {
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
    } catch {
      setMe(prev);
    }
  };

  const disconnectGithub = async () => {
    if (!confirm('ยกเลิกการเชื่อมต่อ GitHub?')) return;
    await api.github.disconnect().catch(() => undefined);
    setGh({ connected: false });
  };

  return (
    <>
      <TopBar variant="title" title="Settings" titleIcon="ph ph-sliders" />

      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-6">
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          <Card>
            <CardHeader title="Preferences" subtitle="ตั้งค่าการแสดงผลและพฤติกรรมของระบบ" />
            <div className="flex flex-col gap-4">
              <ToggleRow
                title="Email Notifications"
                desc="รับการแจ้งเตือนทางอีเมลเมื่อ pipeline รันล้มเหลว หรือถูกบล็อก (in-app แจ้งเสมอ)"
                checked={me?.notifyEmail ?? false}
                disabled={!me || !me.mailConfigured}
                hint={me && !me.mailConfigured ? 'ยังไม่ได้ตั้งค่า SMTP บนเซิร์ฟเวอร์ — เปิดใช้ไม่ได้' : undefined}
                onChange={toggleNotifyEmail}
              />
              <PrefRow title="Auto-deploy (GitHub)" desc="เปิดอยู่เสมอเมื่อเชื่อม repo ผ่าน picker — ยังไม่มีสวิตช์แยกปิด" />
            </div>
          </Card>

          {/* plan */}
          <Card>
            <CardHeader
              title="Current Plan"
              subtitle="รายละเอียดแพ็กเกจที่คุณกำลังใช้งาน"
              divider={false}
              right={
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(115,169,140,.3)] bg-[rgba(115,169,140,.12)] px-3 py-[5px] text-[11.5px] font-bold text-allow-text">
                  <i className="ph-fill ph-star" /> {plan.toUpperCase()}
                </span>
              }
            />
            <div className="mt-4 border-t border-[#F0EDE6] pt-3.5">
              <div className="mb-[7px] text-[11.5px] text-muted">Allowed Runtimes</div>
              <div className="text-[13px] font-semibold">Node.js, Static</div>
            </div>
          </Card>

          {/* usage — CPU/RAM สดต่อแอป + สถิติ deploy ของบัญชีนี้ */}
          <UsageCard />

          {/* connected accounts */}
          <Card>
            <CardHeader title="Connected Accounts" subtitle="จัดการบัญชีผู้ให้บริการภายนอก · token เข้ารหัส AES-256-GCM" />
            {!gh && <p className="text-[12.5px] text-muted">กำลังตรวจสอบ…</p>}
            {gh && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <i className="ph-fill ph-github-logo text-[30px]" />
                  <div>
                    <div className="text-[13px] font-semibold">GitHub</div>
                    <div className="text-[11.5px] text-muted">
                      {gh.connected ? (
                        <>Connected as <span className="font-semibold text-ink">{gh.username}</span></>
                      ) : (
                        'ยังไม่ได้เชื่อมต่อ'
                      )}
                    </div>
                  </div>
                </div>
                {gh.connected ? (
                  <button onClick={disconnectGithub} className="rounded-[7px] border border-[rgba(214,109,82,.35)] bg-surface px-3.5 py-2 text-xs font-medium text-danger-text">
                    Disconnect
                  </button>
                ) : (
                  <a href="/deploy" className="rounded-[7px] border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft">
                    เชื่อมต่อ
                  </a>
                )}
              </div>
            )}
          </Card>

          {/* security — 2FA แบบรหัสทางอีเมล (เปิด/ปิดต้องยืนยันรหัสจากอีเมลทั้งคู่) */}
          <TwoFactorCard me={me} setMe={setMe} />
        </div>
      </div>
    </>
  );
}
