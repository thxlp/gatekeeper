'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { GitAppDetail } from '@/types';

function CopyRow({ label, value, sensitive = false }: { label: string; value: string; sensitive?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!sensitive); // ค่าลับ = ซ่อนไว้ก่อน ต้องกดลูกตาถึงเห็น
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-semibold text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border-alt bg-page px-3 py-2 font-mono text-[13px] text-ink">
          {shown ? value : '•'.repeat(28)}
        </code>
        {sensitive && (
          <button
            onClick={() => setShown((s) => !s)}
            title={shown ? 'ซ่อน' : 'แสดง'}
            aria-label={shown ? 'ซ่อนค่า' : 'แสดงค่า'}
            className="flex-none rounded-lg border border-border-alt px-2.5 py-2 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
          >
            <i className={`ph ${shown ? 'ph-eye-slash' : 'ph-eye'}`} />
          </button>
        )}
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="คัดลอก"
          className="flex-none rounded-lg border border-border-alt px-2.5 py-2 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
        >
          <i className={`ph ${copied ? 'ph-check' : 'ph-copy'}`} />
        </button>
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };

function instructions(provider: string): string[] {
  if (provider === 'gitlab')
    return ['GitLab repo → Settings → Webhooks', 'วาง URL + Secret token ด้านล่าง', 'ติ๊ก Trigger = "Push events" แล้ว Add webhook'];
  if (provider === 'bitbucket')
    return [
      'Bitbucket repo → Repository settings → Webhooks → Add webhook',
      'วาง URL ด้านล่าง (มี ?token=... ต่อท้ายให้แล้ว — Bitbucket ไม่เซ็น payload จึงยืนยันด้วย token ใน URL)',
      'ติ๊ก Trigger = "Repository push"',
    ];
  return [
    'GitHub repo → Settings → Webhooks → Add webhook',
    'วาง Payload URL + Secret ด้านล่าง, Content type = application/json',
    'เลือก "Just the push event" แล้ว Add webhook',
  ];
}

export default function DeploySettingsTab({ appId, detail }: { appId: string; detail: GitAppDetail }) {
  const [autoDeploy, setAutoDeploy] = useState(detail.autoDeploy !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const provider = detail.provider || 'github';
  const isGit = (detail.sourceType ?? 'git') === 'git';
  // Bitbucket ยืนยันด้วย token ใน URL — ประกอบ URL เต็มให้ก็อปวางได้เลย
  const webhookUrl =
    provider === 'bitbucket' && detail.webhookUrl && detail.webhookSecret
      ? `${detail.webhookUrl}?token=${detail.webhookSecret}`
      : detail.webhookUrl || '';

  const toggle = async () => {
    const next = !autoDeploy;
    setAutoDeploy(next);
    setBusy(true);
    setError('');
    try {
      await api.updateGitApp(appId, { autoDeploy: next });
    } catch (e: any) {
      setError(e.message);
      setAutoDeploy(!next); // revert
    } finally {
      setBusy(false);
    }
  };

  if (!isGit) {
    return (
      <div className="rounded-xl border border-border-alt bg-surface px-4 py-8 text-center text-[14px] text-muted">
        แอปนี้ deploy แบบอัปโหลด .zip — ไม่มี auto-deploy จาก git push
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-lg border border-danger-text/30 bg-[rgba(214,109,82,.06)] px-3 py-2 text-[13.5px] text-danger-text">
          {error}
        </div>
      )}

      {/* auto-deploy toggle */}
      <div className="rounded-xl border border-border-alt bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-bold">Auto-deploy on push</div>
            <div className="text-[13px] text-muted">
              deploy อัตโนมัติเมื่อ push เข้า branch <code className="font-mono">{detail.branch || 'main'}</code>
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={busy}
            role="switch"
            aria-checked={autoDeploy}
            className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${
              autoDeploy ? 'bg-primary' : 'bg-border-alt'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                autoDeploy ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-3">
          <i className="ph ph-clock-counter-clockwise" />
          {detail.lastAutoDeployAt
            ? `auto-deploy ล่าสุด: ${new Date(detail.lastAutoDeployAt).toLocaleString('th-TH')}`
            : 'ยังไม่เคย auto-deploy จาก push'}
        </div>
      </div>

      {/* webhook setup */}
      <div className="rounded-xl border border-border-alt bg-surface p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[15px] font-bold">Webhook setup</span>
          <span className="rounded-md border border-border-alt px-1.5 py-px text-[12px] font-semibold text-muted">
            {PROVIDER_LABEL[provider] || provider}
          </span>
        </div>
        <ol className="mb-3 ml-4 list-decimal text-[13px] text-muted">
          {instructions(provider).map((s, i) => (
            <li key={i} className="mb-0.5">
              {s}
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3">
          {/* Bitbucket ฝัง ?token=<secret> ใน URL → ถือเป็นความลับ ซ่อนเหมือน secret */}
          {webhookUrl && <CopyRow label="Payload / Webhook URL" value={webhookUrl} sensitive={provider === 'bitbucket'} />}
          {provider !== 'bitbucket' && detail.webhookSecret && (
            <CopyRow label={provider === 'gitlab' ? 'Secret token' : 'Secret'} value={detail.webhookSecret} sensitive />
          )}
        </div>
        {!detail.webhookSecret && (
          <div className="mt-2 text-[12.5px] text-muted-3">
            แอปนี้เชื่อมผ่าน GitHub (auto webhook) อยู่แล้ว — ระบบตั้ง webhook ให้ในรีโปโดยอัตโนมัติ
          </div>
        )}
      </div>
    </div>
  );
}
