'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { GitAppRegistration } from '@/types';
import CopyField from '@/components/ui/CopyField';
import { ArrowLeft, Github, CheckCircle2 } from 'lucide-react';

const GITHUB_REPO_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;
const RUNTIMES = ['node', 'python', 'static', 'docker'];

export default function RegisterGitAppPage() {
  const [projectName, setProjectName] = useState('');
  const [repoUrl, setRepoUrl]         = useState('');
  const [branch, setBranch]           = useState('main');
  const [runtime, setRuntime]         = useState('node');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<GitAppRegistration | null>(null);

  const submit = async () => {
    setError('');
    const trimmedUrl = repoUrl.trim();
    if (!trimmedUrl) { setError('กรุณากรอก Repository URL'); return; }
    if (!GITHUB_REPO_RE.test(trimmedUrl)) {
      setError('Repository URL ต้องอยู่ในรูปแบบ https://github.com/<owner>/<repo>');
      return;
    }
    setLoading(true);
    try {
      const res = await api.registerGitApp({
        repoUrl: trimmedUrl,
        branch: branch.trim() || 'main',
        runtime,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setProjectName('');
    setRepoUrl('');
    setBranch('main');
    setRuntime('node');
  };

  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <Link href="/" className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <span className="text-border">|</span>
        <span className="text-sm font-mono font-semibold flex items-center gap-1.5">
          <Github size={14} /> Register Git App
        </span>
      </header>

      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          {!result ? (
            <div className="bg-panel border border-border rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-base">App Details</h2>

              <Field label="Project Name">
                <input value={projectName} onChange={e => setProjectName(e.target.value)}
                  placeholder="my-awesome-app"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent placeholder:text-muted" />
              </Field>

              <Field label="Repository URL *">
                <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Branch">
                  <input value={branch} onChange={e => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
                </Field>
                <Field label="Runtime">
                  <select value={runtime} onChange={e => setRuntime(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                    {RUNTIMES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>

              {error && <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">{error}</p>}

              <button onClick={submit} disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-accent text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {loading ? 'กำลังลงทะเบียน…' : 'Register App →'}
              </button>
            </div>
          ) : (
            <div className="bg-panel border border-green/50 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green" size={20} />
                <span className="font-mono font-bold text-base text-green">ลงทะเบียนสำเร็จ</span>
              </div>
              <p className="text-xs font-mono text-sub">
                {projectName ? `${projectName} — ` : ''}{result.repoFullName} @ {result.branch}
              </p>

              <div className="space-y-3">
                <CopyField label="Webhook URL" value={result.webhookUrl} />
                <CopyField label="Webhook Secret" value={result.webhookSecret} />
              </div>

              <div className="bg-surface border border-border rounded-lg px-3 py-2 space-y-1">
                <p className="text-[10px] font-mono text-sub uppercase tracking-wider">ตั้งค่าใน GitHub</p>
                <p className="text-[11px] font-mono text-muted">Settings → Webhooks → Add webhook</p>
                <p className="text-[11px] font-mono text-muted">Content type: {result.contentType}</p>
                <p className="text-[11px] font-mono text-muted">Events: {result.events.join(', ')}</p>
              </div>

              <p className="text-[10px] text-yellow font-mono bg-yellow/10 border border-yellow/30 rounded-lg px-3 py-2">
                ⚠ เก็บ secret นี้ไว้ให้ดี ระบบจะไม่แสดงซ้ำอีกครั้ง
              </p>

              <button onClick={reset}
                className="w-full text-sm text-sub hover:text-text border border-border rounded-lg py-2 font-mono">
                ลงทะเบียนแอปใหม่
              </button>
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
