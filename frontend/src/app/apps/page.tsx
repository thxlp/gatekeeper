'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { GitAppSummary } from '@/types';
import CopyField from '@/components/ui/CopyField';
import { ArrowLeft, Github, Plus, GitBranch, Box } from 'lucide-react';

export default function GitAppsListPage() {
  const [apps, setApps]       = useState<GitAppSummary[] | null>(null);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.listGitApps()
      .then(setApps)
      .catch((e: any) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <Link href="/" className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <span className="text-border">|</span>
        <span className="text-sm font-mono font-semibold flex items-center gap-1.5">
          <Github size={14} /> Git Apps
        </span>
        <Link href="/apps/register"
          className="ml-auto flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors">
          <Plus size={12} /> Register App
        </Link>
      </header>

      <div className="flex-1 p-6">
        <div className="w-full max-w-3xl mx-auto space-y-3">
          {error && (
            <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">{error}</p>
          )}

          {!apps && !error && (
            <p className="text-xs text-sub font-mono">กำลังโหลด…</p>
          )}

          {apps && apps.length === 0 && (
            <div className="bg-panel border border-border rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-sub font-mono">ยังไม่มี Git App ที่ลงทะเบียน</p>
              <Link href="/apps/register"
                className="inline-flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors">
                <Plus size={12} /> Register App แรกของคุณ
              </Link>
            </div>
          )}

          {apps?.map((app) => (
            <div key={app.id} className="bg-panel border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-sm">{app.repoFullName}</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono font-medium ${
                  app.enabled
                    ? 'bg-green/10 text-green border-green/30'
                    : 'bg-red/10 text-red border-red/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${app.enabled ? 'bg-green' : 'bg-red'}`} />
                  {app.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-sub font-mono">
                <span className="flex items-center gap-1"><GitBranch size={12} /> {app.branch}</span>
                {app.runtime && <span className="flex items-center gap-1"><Box size={12} /> {app.runtime}</span>}
                {app.createdAt && <span>ลงทะเบียนเมื่อ {new Date(app.createdAt).toLocaleString('th-TH')}</span>}
              </div>

              <CopyField label="Webhook URL" value={app.webhookUrl} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
