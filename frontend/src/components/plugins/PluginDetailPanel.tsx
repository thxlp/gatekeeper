'use client';
import { useState } from 'react';
import { Plugin, AuditEntry } from '@/types';
import { api } from '@/lib/api';
import StatusBadge from '../ui/StatusBadge';
import FindingsList from '../ui/FindingsList';
import {
  Shield, Wifi, Zap, Trash2, ClipboardList, X,
  ChevronDown, ChevronRight, ExternalLink, Copy, Check
} from 'lucide-react';

interface Props {
  plugin: Plugin;
  onClose: () => void;
  onRefresh: () => void;
}

type Tab = 'overview' | 'findings' | 'proxy' | 'logs';

export default function PluginDetailPanel({ plugin, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState('');
  const [proxyResult, setProxyResult] = useState<any>(null);
  const [credential, setCredential] = useState('');
  const [selectedEp, setSelectedEp] = useState(plugin.endpoints[0]?.path || '');
  const [proxyBody, setProxyBody] = useState('{}');
  const [copied, setCopied] = useState(false);

  const run = async (action: string, fn: () => Promise<any>) => {
    setLoading(action);
    try { await fn(); onRefresh(); } finally { setLoading(''); }
  };

  const copySignature = () => {
    if (!plugin.signature) return;
    navigator.clipboard.writeText(plugin.signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProxy = async () => {
    setLoading('proxy');
    try {
      const ep = plugin.endpoints.find(e => e.path === selectedEp);
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
      setLoading('');
    }
  };

  const loadLogs = async () => {
    setTab('logs');
    setLoading('logs');
    try { setLogs(await api.getPluginLogs(plugin.id)); } finally { setLoading(''); }
  };

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview',  icon: Shield },
    { key: 'findings', label: 'Findings',  icon: Zap },
    { key: 'proxy',    label: 'Proxy',     icon: Wifi },
    { key: 'logs',     label: 'Audit Log', icon: ClipboardList },
  ];

  const decisionColor = (d: string) =>
    d === 'ALLOW' ? 'text-green' : d === 'BLOCK' ? 'text-red' : d === 'QUARANTINE' ? 'text-yellow' : 'text-sub';

  return (
    <div className="flex flex-col h-full w-80 bg-panel border-l border-border text-text text-sm overflow-hidden">
      {/* header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-base truncate">{plugin.name}</h2>
          <p className="text-sub text-xs font-mono mt-0.5 truncate">{plugin.id}</p>
        </div>
        <button onClick={onClose} className="text-sub hover:text-text mt-0.5 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* status + actions */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={plugin.status} />
          {plugin.risk_score !== undefined && (
            <span className={`text-xs font-mono ${plugin.risk_score >= 50 ? 'text-red' : plugin.risk_score > 0 ? 'text-yellow' : 'text-green'}`}>
              score {plugin.risk_score}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Step 3 */}
          <ActionBtn label="Re-scan" icon={Shield} loading={loading === 'screen'}
            onClick={() => run('screen', () => api.screenPlugin(plugin.id))} />
          {/* Step 6 */}
          <ActionBtn label="Verify" icon={Check} loading={loading === 'verify'}
            onClick={() => run('verify', () => api.verifyPlugin(plugin.id))} />
          {/* Step 7 */}
          <ActionBtn label="Handshake" icon={Wifi} loading={loading === 'handshake'}
            onClick={() => run('handshake', () => api.handshakePlugin(plugin.id))} />
          {/* Step 9 */}
          {plugin.status === 'active' && (
            <ActionBtn label="Revoke" icon={Trash2} loading={loading === 'revoke'} danger
              onClick={() => run('revoke', () => api.revokePlugin(plugin.id))} />
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => t.key === 'logs' ? loadLogs() : setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-mono transition-colors
              ${tab === t.key ? 'text-accent border-b-2 border-accent' : 'text-sub hover:text-text'}`}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {tab === 'overview' && (
          <>
            <Field label="Base URL">
              <a href={plugin.base_url} target="_blank" rel="noreferrer"
                className="text-accent hover:underline font-mono text-xs flex items-center gap-1 truncate">
                {plugin.base_url} <ExternalLink size={10} />
              </a>
            </Field>
            <Field label="Auth Type">
              <span className="font-mono text-xs text-purple">{plugin.auth_type}</span>
            </Field>
            <Field label="Endpoints">
              <ul className="space-y-1 mt-1">
                {plugin.endpoints.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs font-mono">
                    <span className={`text-[10px] font-bold ${e.method === 'GET' ? 'text-green' : e.method === 'POST' ? 'text-accent' : 'text-yellow'}`}>
                      {e.method}
                    </span>
                    <span className="text-sub">{e.path}</span>
                  </li>
                ))}
              </ul>
            </Field>
            {/* Step 5: signature */}
            {plugin.signature && (
              <Field label="Code Signature (Step 5)">
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-[10px] font-mono text-green truncate flex-1 bg-surface px-2 py-1 rounded">
                    {plugin.signature.slice(0, 24)}…
                  </code>
                  <button onClick={copySignature} className="text-sub hover:text-text shrink-0">
                    {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                  </button>
                </div>
              </Field>
            )}
            {/* connection file (Step 4) */}
            {plugin.connection_file && (
              <Field label="Connection File (Step 4)">
                <pre className="text-[10px] font-mono text-sub bg-surface rounded p-2 overflow-auto max-h-32 mt-1">
                  {JSON.stringify(plugin.connection_file, null, 2)}
                </pre>
              </Field>
            )}
            {plugin.last_handshake_at && (
              <Field label="Last Handshake">
                <span className="font-mono text-xs text-sub">{new Date(plugin.last_handshake_at).toLocaleString('th-TH')}</span>
              </Field>
            )}
          </>
        )}

        {tab === 'findings' && (
          <FindingsList findings={plugin.findings || []} />
        )}

        {tab === 'proxy' && (
          <div className="space-y-3">
            <p className="text-xs text-sub">Step 8: ยิง request ผ่าน Gatekeeper proxy</p>

            <div>
              <label className="text-xs text-sub block mb-1">Endpoint</label>
              <select value={selectedEp} onChange={e => setSelectedEp(e.target.value)}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-accent">
                {plugin.endpoints.map((e, i) => (
                  <option key={i} value={e.path}>[{e.method}] {e.path}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-sub block mb-1">Credential (ไม่ถูก store)</label>
              <input type="password" value={credential} onChange={e => setCredential(e.target.value)}
                placeholder="Bearer token / API key"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
            </div>

            {plugin.endpoints.find(e => e.path === selectedEp)?.method !== 'GET' && (
              <div>
                <label className="text-xs text-sub block mb-1">Request Body (JSON)</label>
                <textarea rows={4} value={proxyBody} onChange={e => setProxyBody(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-accent resize-none" />
              </div>
            )}

            <button onClick={handleProxy} disabled={plugin.status !== 'active' || !!loading}
              className="w-full flex items-center justify-center gap-2 bg-accent/10 border border-accent/30 text-accent rounded-lg px-3 py-2 text-xs font-mono hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading === 'proxy' ? 'กำลังส่ง…' : <><Zap size={12} /> Execute Proxy Call</>}
            </button>

            {proxyResult && (
              <div>
                <p className="text-[10px] text-sub mb-1 font-mono">Response:</p>
                <pre className={`text-[10px] font-mono rounded p-2 overflow-auto max-h-48 ${proxyResult.ok === false ? 'bg-red/10 text-red' : 'bg-surface text-green'}`}>
                  {JSON.stringify(proxyResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-2">
            {loading === 'logs' && <p className="text-xs text-sub font-mono">กำลังโหลด…</p>}
            {!loading && logs.length === 0 && <p className="text-xs text-sub font-mono">ยังไม่มี log</p>}
            {logs.map((l, i) => (
              <div key={i} className="border border-border rounded-lg p-2 text-[10px] font-mono space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${decisionColor(l.decision)}`}>{l.decision}</span>
                  <span className="text-sub">{l.stage}</span>
                  <span className="ml-auto text-muted">{new Date(l.ts).toLocaleTimeString('th-TH')}</span>
                </div>
                {l.reason && <div className="text-sub">{l.reason}</div>}
                {l.score !== undefined && <div className="text-sub">score: {l.score}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-sub font-mono uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}

function ActionBtn({ label, icon: Icon, onClick, loading, danger }: {
  label: string; icon: any; onClick: () => void; loading: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-mono transition-colors disabled:opacity-40
        ${danger
          ? 'border-red/40 text-red hover:bg-red/10'
          : 'border-border text-sub hover:text-text hover:border-muted'
        }`}>
      <Icon size={11} />
      {loading ? '…' : label}
    </button>
  );
}
