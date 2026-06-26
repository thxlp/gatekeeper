'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import FindingsList from '@/components/ui/FindingsList';
import { ArrowLeft, Upload, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function DeployPage() {
  const [runtime, setRuntime]   = useState('node');
  const [feature, setFeature]   = useState('basic-deploy');
  const [files,   setFiles]     = useState<{ path: string; content_base64: string }[]>([]);
  const [result,  setResult]    = useState<any>(null);
  const [loading, setLoading]   = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const encoded = await Promise.all(
      picked.map(async f => {
        const buf = await f.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return { path: f.name, content_base64: b64 };
      }),
    );
    setFiles(encoded);
  };

  const handleDeploy = async () => {
    if (!files.length) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await api.deploy({ runtime, feature, files });
      setResult(r);
    } catch (e: any) {
      setResult({ decision: 'BLOCK', reason: e.message });
    } finally {
      setLoading(false);
    }
  };

  const decisionIcon = result?.decision === 'ALLOW'
    ? <CheckCircle className="text-green" size={20} />
    : result?.decision === 'QUARANTINE'
    ? <Clock className="text-yellow" size={20} />
    : result ? <XCircle className="text-red" size={20} /> : null;

  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      {/* topbar */}
      <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <Link href="/" className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <span className="text-border">|</span>
        <span className="text-sm font-mono font-semibold">Deploy Artifact</span>
      </header>

      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-xl space-y-6">
          {/* config */}
          <div className="bg-panel border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-base">Pipeline Config</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-sub font-mono block mb-1">Runtime</label>
                <select value={runtime} onChange={e => setRuntime(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                  {['node', 'python', 'static', 'docker'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-sub font-mono block mb-1">Feature</label>
                <select value={feature} onChange={e => setFeature(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                  {['basic-deploy', 'custom-domain', 'cron-jobs'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            {/* file upload */}
            <div>
              <label className="text-xs text-sub font-mono block mb-2">Files</label>
              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-4 py-8 cursor-pointer transition-colors
                ${files.length ? 'border-green/50 bg-green/5' : 'border-border hover:border-muted'}`}>
                <Upload size={24} className={files.length ? 'text-green' : 'text-sub'} />
                <span className="mt-2 text-sm font-mono text-sub">
                  {files.length ? `${files.length} ไฟล์เลือกแล้ว` : 'คลิกหรือลากไฟล์มาวาง'}
                </span>
                {files.length > 0 && (
                  <ul className="mt-2 space-y-0.5 w-full max-w-xs">
                    {files.map((f, i) => (
                      <li key={i} className="text-[10px] font-mono text-sub truncate text-center">{f.path}</li>
                    ))}
                  </ul>
                )}
                <input type="file" multiple className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            <button onClick={handleDeploy} disabled={loading || !files.length}
              className="w-full flex items-center justify-center gap-2 bg-accent text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading ? 'กำลังตรวจสอบ…' : 'Deploy →'}
            </button>
          </div>

          {/* pipeline stages diagram */}
          <div className="bg-panel border border-border rounded-2xl p-5">
            <p className="text-xs text-sub font-mono mb-3 uppercase tracking-wider">Security Pipeline</p>
            <div className="flex items-center gap-1 text-[10px] font-mono overflow-x-auto pb-1">
              {['Auth', 'Entitlement', 'SecretScan', 'HeuristicScan', 'Risk Engine', 'Ticket', 'Orchestrator', 'Audit'].map((s, i, arr) => (
                <span key={s} className="flex items-center gap-1 shrink-0">
                  <span className="bg-surface border border-border rounded px-2 py-1 text-sub">{s}</span>
                  {i < arr.length - 1 && <span className="text-muted">→</span>}
                </span>
              ))}
            </div>
          </div>

          {/* result */}
          {result && (
            <div className={`bg-panel border rounded-2xl p-5 space-y-3
              ${result.decision === 'ALLOW' ? 'border-green/50' : result.decision === 'QUARANTINE' ? 'border-yellow/50' : 'border-red/50'}`}>
              <div className="flex items-center gap-2">
                {decisionIcon}
                <span className={`font-mono font-bold text-lg
                  ${result.decision === 'ALLOW' ? 'text-green' : result.decision === 'QUARANTINE' ? 'text-yellow' : 'text-red'}`}>
                  {result.decision}
                </span>
                {result.score !== undefined && (
                  <span className="ml-auto text-sub text-xs font-mono">risk score: {result.score}</span>
                )}
              </div>

              {result.reason && (
                <p className="text-xs font-mono text-sub">{result.reason}</p>
              )}
              {result.message && (
                <p className="text-xs font-mono text-yellow">{result.message}</p>
              )}
              {result.deployedPath && (
                <p className="text-xs font-mono text-green">✓ deployed: {result.deployedPath}</p>
              )}
              {result.requestId && (
                <p className="text-[10px] font-mono text-muted">request: {result.requestId}</p>
              )}

              {result.findings?.length > 0 && (
                <div>
                  <p className="text-xs text-sub font-mono mb-2">Findings:</p>
                  <FindingsList findings={result.findings} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
