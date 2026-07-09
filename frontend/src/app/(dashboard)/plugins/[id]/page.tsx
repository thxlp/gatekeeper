'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import TopBar from '@/components/shell/TopBar';
import { Card } from '@/components/ui/primitives';
import StatusBadge from '@/components/ui/StatusBadge';
import FindingsList from '@/components/ui/FindingsList';
import { api } from '@/lib/api';
import { AuditEntry, GitAppSummary, Plugin } from '@/types';

const RegisterPluginModal = dynamic(() => import('@/components/plugins/RegisterPluginModal'), { ssr: false });

type Tab = 'overview' | 'findings' | 'proxy' | 'logs';

type LifecycleState = 'done' | 'active' | 'pending';
interface LifecycleStep {
  key: string;
  label: string;
  caption: string;
  state: LifecycleState;
}

function deriveLifecycle(p: Plugin): LifecycleStep[] {
  const screened = p.status !== 'pending';
  const screening = p.status === 'screening' || p.status === 'generating';
  return [
    { key: 'register', label: 'Register', caption: new Date(p.created_at).toLocaleDateString('th-TH'), state: 'done' },
    {
      key: 'screen',
      label: 'Screen',
      caption: p.risk_score !== undefined ? `score ${p.risk_score}` : 'scan + decide',
      state: screening ? 'active' : screened ? 'done' : 'pending',
    },
    {
      key: 'verify',
      label: 'Verify',
      caption: p.last_verified_at ? new Date(p.last_verified_at).toLocaleDateString('th-TH') : 'ยังไม่ verify',
      state: p.last_verified_at ? 'done' : 'pending',
    },
    {
      key: 'handshake',
      label: 'Handshake',
      caption: p.last_handshake_at ? new Date(p.last_handshake_at).toLocaleDateString('th-TH') : 'ยังไม่ handshake',
      state: p.last_handshake_at ? 'done' : 'pending',
    },
    { key: 'proxy', label: 'Proxy', caption: p.status === 'active' ? 'active' : 'ไม่พร้อมใช้งาน', state: p.status === 'active' ? 'active' : 'pending' },
  ];
}

const tagKindClass: Record<'primary' | 'allow' | 'danger' | 'muted', string> = {
  primary: 'bg-[rgba(74,144,226,.08)] text-primary',
  allow: 'bg-[rgba(115,169,140,.12)] text-allow-text',
  danger: 'bg-[rgba(214,109,82,.1)] text-danger-text',
  muted: 'bg-[rgba(150,144,140,.15)] text-muted',
};

function decisionKind(d: string): 'primary' | 'allow' | 'danger' | 'muted' {
  if (d === 'ALLOW') return 'allow';
  if (d === 'BLOCK') return 'danger';
  if (d === 'QUARANTINE') return 'primary';
  return 'muted';
}

export default function PluginDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [gitApps, setGitApps] = useState<GitAppSummary[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  // proxy tab state
  const [selectedEp, setSelectedEp] = useState('');
  const [credential, setCredential] = useState('');
  const [proxyBody, setProxyBody] = useState('{}');
  const [proxyResult, setProxyResult] = useState<any>(null);

  const refresh = async () => {
    try {
      const [p, apps] = await Promise.all([api.getPlugin(params.id), api.listGitApps()]);
      setPlugin(p);
      setGitApps(apps);
      if (!selectedEp && p.endpoints[0]) setSelectedEp(p.endpoints[0].path);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const run = async (action: string, fn: () => Promise<any>) => {
    setBusy(action);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!plugin || !confirm(`ลบ ${plugin.name} ออกจากระบบถาวร? action นี้ย้อนกลับไม่ได้`)) return;
    setBusy('delete');
    try {
      await api.deletePlugin(plugin.id);
      router.push('/plugins');
    } finally {
      setBusy('');
    }
  };

  const loadLogs = async () => {
    setTab('logs');
    setBusy('logs');
    try {
      setLogs(await api.getPluginLogs(params.id));
    } finally {
      setBusy('');
    }
  };

  const runProxy = async () => {
    if (!plugin) return;
    setBusy('proxy');
    try {
      const ep = plugin.endpoints.find((e) => e.path === selectedEp);
      const result = await api.proxyCall(plugin.id, {
        endpoint_path: selectedEp,
        method: ep?.method || 'GET',
        credential: credential || undefined,
        body: ep?.method !== 'GET' ? JSON.parse(proxyBody) : undefined,
      });
      setProxyResult(result);
    } catch (e: any) {
      setProxyResult({ error: e.message });
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <>
        <TopBar variant="title" title="Plugins" backHref="/plugins" />
        <div className="p-6 text-[12.5px] text-danger-text">{error}</div>
      </>
    );
  }
  if (!plugin) {
    return (
      <>
        <TopBar variant="title" title="Plugins" backHref="/plugins" />
        <div className="p-6 text-[12.5px] text-muted">กำลังโหลด…</div>
      </>
    );
  }

  const lifecycle = deriveLifecycle(plugin);
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'ph-shield' },
    { key: 'findings', label: 'Findings', icon: 'ph-lightning' },
    { key: 'proxy', label: 'Proxy', icon: 'ph-wifi-high' },
    { key: 'logs', label: 'Audit Log', icon: 'ph-clipboard-text' },
  ];

  return (
    <>
      <TopBar
        variant="title"
        backHref="/plugins"
        title={
          <span className="flex items-center gap-2.5 text-[13px] font-normal text-muted">
            Plugins <span className="text-[#D9D5CC]">/</span>
            <span className="text-[15px] font-bold text-ink">{plugin.name}</span>
            <StatusBadge status={plugin.status} />
          </span>
        }
        right={
          <>
            <button
              onClick={() => run('screen', () => api.screenPlugin(plugin.id))}
              disabled={busy === 'screen'}
              className="rounded-[7px] border border-border bg-surface px-3.5 py-[7px] text-[12.5px] font-medium text-ink-soft disabled:opacity-50"
            >
              {busy === 'screen' ? '…' : 'Re-screen'}
            </button>
            {plugin.status === 'active' && (
              <button
                onClick={() => run('revoke', () => api.revokePlugin(plugin.id))}
                disabled={busy === 'revoke'}
                className="rounded-[7px] border border-[rgba(214,109,82,.4)] bg-surface px-3.5 py-[7px] text-[12.5px] font-semibold text-danger-text disabled:opacity-50"
              >
                {busy === 'revoke' ? '…' : 'Revoke'}
              </button>
            )}
            <button onClick={remove} disabled={busy === 'delete'} className="rounded-[7px] border border-border bg-surface px-3 py-[7px] text-ink-soft disabled:opacity-50">
              <i className="ph ph-trash" />
            </button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto p-6">
        <Card className="px-7 py-[22px]">
          <div className="mb-[18px] text-[10.5px] font-bold tracking-[.8px] text-muted-3">LIFECYCLE</div>
          <div className="flex items-center overflow-x-auto">
            {lifecycle.map((step, i) => {
              const last = i === lifecycle.length - 1;
              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex w-[110px] flex-none flex-col items-center gap-1.5">
                    <div
                      className={`flex h-[30px] w-[30px] items-center justify-center rounded-full ${
                        step.state === 'active'
                          ? 'border-2 border-primary bg-[#EFF4FB] text-primary'
                          : step.state === 'done'
                          ? 'bg-allow-dot text-white'
                          : 'border-[1.5px] border-border-alt bg-white text-[#C4BFB4]'
                      }`}
                    >
                      {step.state === 'active' ? (
                        <i className="ph-fill ph-arrows-left-right text-[14px]" />
                      ) : step.state === 'done' ? (
                        <i className="ph-bold ph-check text-[14px]" />
                      ) : (
                        <i className="ph ph-hourglass text-xs" />
                      )}
                    </div>
                    <span className={`text-[11px] font-semibold ${step.state === 'active' ? 'text-primary-hover' : ''}`}>{step.label}</span>
                    <span className={`text-[9.5px] ${step.state === 'active' ? 'text-primary' : 'text-muted-3'}`}>{step.caption}</span>
                  </div>
                  {!last && (
                    <div
                      className={`mx-[-22px] mb-[34px] h-0.5 min-w-[40px] flex-1 ${
                        lifecycle[i + 1].state !== 'pending' ? 'bg-allow-dot' : 'bg-border-alt'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex border-b border-[#EFEDE6]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => (t.key === 'logs' ? loadLogs() : setTab(t.key))}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-medium transition-colors ${
                  tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-ink'
                }`}
              >
                <i className={`ph ${t.icon}`} /> {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'overview' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => run('verify', () => api.verifyPlugin(plugin.id))}
                    disabled={!!busy}
                    className="rounded-[7px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft disabled:opacity-50"
                  >
                    {busy === 'verify' ? '…' : 'Verify'}
                  </button>
                  <button
                    onClick={() => run('handshake', () => api.handshakePlugin(plugin.id))}
                    disabled={!!busy}
                    className="rounded-[7px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft disabled:opacity-50"
                  >
                    {busy === 'handshake' ? '…' : 'Handshake'}
                  </button>
                  <button onClick={() => setShowEdit(true)} className="rounded-[7px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft">
                    Edit
                  </button>
                </div>

                <OverviewField label="Base URL">
                  <a href={plugin.base_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate font-mono text-xs text-primary hover:underline">
                    {plugin.base_url} <i className="ph ph-arrow-square-out" />
                  </a>
                </OverviewField>
                <OverviewField label="Auth Type">
                  <span className="font-mono text-xs text-purple">{plugin.auth_type}</span>
                </OverviewField>
                <OverviewField label="Project">
                  <span className="font-mono text-xs text-muted">
                    {gitApps.find((a) => a.id === plugin.project_id)?.repoFullName ||
                      gitApps.find((a) => a.id === plugin.project_id)?.projectName ||
                      '— ไม่ผูกโปรเจกต์ —'}
                  </span>
                </OverviewField>
                <OverviewField label="Endpoints">
                  <ul className="mt-1 flex flex-col gap-1">
                    {plugin.endpoints.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 font-mono text-xs">
                        <span className="font-bold text-primary">{e.method}</span>
                        <span className="text-muted">{e.path}</span>
                      </li>
                    ))}
                  </ul>
                </OverviewField>
                {plugin.signature && (
                  <OverviewField label="Code Signature">
                    <code className="truncate rounded bg-page-alt px-2 py-1 font-mono text-[10px] text-allow-text">
                      {plugin.signature.slice(0, 24)}…
                    </code>
                  </OverviewField>
                )}
              </div>
            )}

            {tab === 'findings' && <FindingsList findings={plugin.findings || []} />}

            {tab === 'proxy' && (
              <div className="flex flex-col gap-3">
                <p className="text-[12.5px] text-muted">ยิง request ผ่าน Gatekeeper proxy</p>
                <div>
                  <div className="mb-1 text-xs font-semibold">Endpoint</div>
                  <select
                    value={selectedEp}
                    onChange={(e) => setSelectedEp(e.target.value)}
                    className="w-full rounded-lg border border-border bg-page-alt px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {plugin.endpoints.map((e, i) => (
                      <option key={i} value={e.path}>[{e.method}] {e.path}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold">Credential (ไม่ถูก store)</div>
                  <input
                    type="password"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    placeholder="Bearer token / API key"
                    className="w-full rounded-lg border border-border bg-page-alt px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                {plugin.endpoints.find((e) => e.path === selectedEp)?.method !== 'GET' && (
                  <div>
                    <div className="mb-1 text-xs font-semibold">Request Body (JSON)</div>
                    <textarea
                      rows={4}
                      value={proxyBody}
                      onChange={(e) => setProxyBody(e.target.value)}
                      className="w-full resize-none rounded-lg border border-border bg-page-alt px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                )}
                <button
                  onClick={runProxy}
                  disabled={plugin.status !== 'active' || !!busy}
                  className="w-full rounded-lg border border-primary/30 bg-[rgba(74,144,226,.08)] py-2 text-xs font-semibold text-primary disabled:opacity-40"
                >
                  {busy === 'proxy' ? 'กำลังส่ง…' : 'Execute Proxy Call'}
                </button>
                {proxyResult && (
                  <pre
                    className={`overflow-auto rounded p-2 text-[10px] font-mono ${
                      proxyResult.ok === false ? 'bg-[rgba(214,109,82,.08)] text-danger-text' : 'bg-page-alt text-allow-text'
                    }`}
                  >
                    {JSON.stringify(proxyResult, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {tab === 'logs' && (
              <div className="flex flex-col">
                {busy === 'logs' && <p className="text-[12.5px] text-muted">กำลังโหลด…</p>}
                {busy !== 'logs' && logs.length === 0 && <p className="text-[12.5px] text-muted">ยังไม่มี log</p>}
                {logs.map((l, i) => (
                  <div key={i} className={`flex items-center gap-3 py-[9px] text-xs ${i < logs.length - 1 ? 'border-b border-[#F4F2EC]' : ''}`}>
                    <span className="w-[88px] flex-none font-mono text-[10.5px] text-muted-3">{new Date(l.ts).toLocaleTimeString('th-TH')}</span>
                    <span className={`flex-none rounded px-[7px] py-px text-[9.5px] font-bold ${tagKindClass[decisionKind(l.decision)]}`}>{l.decision}</span>
                    <span className="text-ink-soft">{l.stage}{l.reason ? ` · ${l.reason}` : ''}{l.score !== undefined ? ` · score ${l.score}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {showEdit && (
        <RegisterPluginModal plugin={plugin} gitApps={gitApps} onClose={() => setShowEdit(false)} onCreated={refresh} />
      )}
    </>
  );
}

function OverviewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-3">{label}</p>
      {children}
    </div>
  );
}
