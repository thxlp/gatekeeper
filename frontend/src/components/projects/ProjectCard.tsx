'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { GitAppSummary } from '@/types';
import {
  Activity,
  Box,
  ExternalLink,
  GitBranch,
  Github,
  Package,
  RotateCw,
  Trash2,
} from 'lucide-react';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  idle: { label: 'Idle', cls: 'bg-border/20 text-sub border-border', dot: 'bg-sub' },
  deploying: { label: 'Deploying…', cls: 'bg-accent/10 text-accent border-accent/30', dot: 'bg-accent pulse-green' },
  success: { label: 'Live', cls: 'bg-green/10 text-green border-green/30', dot: 'bg-green' },
  failed: { label: 'Failed', cls: 'bg-red/10 text-red border-red/30', dot: 'bg-red' },
};

// การ์ดโปรเจกต์แบบ Railway บนหน้าหลัก — 1 การ์ด = 1 app (git หรือ manual) พร้อมปุ่ม deploy/ลบ
export default function ProjectCard({ app, onChanged }: { app: GitAppSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isGit = app.sourceType === 'git';
  const meta = STATUS_META[app.pipelineStatus || 'idle'] || STATUS_META.idle;
  const name = app.projectName || app.repoFullName || app.id;
  const canVisit = app.pipelineStatus === 'success' && !!app.liveUrl;
  const deploying = app.pipelineStatus === 'deploying';

  // git app สั่ง deploy ใหม่ได้ทันทีจากการ์ด (backend ตอบเร็วแล้ววิ่ง pipeline ต่อเบื้องหลัง —
  // สถานะบนการ์ดขยับผ่าน poll ของหน้าหลัก) ส่วน manual app ต้องแนบไฟล์ใหม่ เลยพาไป /deploy แทน
  const deployNow = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deployGitApp(app.id);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const warn = isGit ? 'webhook auto-deploy ของ repo นี้จะถูกยกเลิกด้วย' : '';
    if (!confirm(`ลบ ${name} ออกจากระบบ? ${warn}`)) return;
    setBusy(true);
    try {
      await api.deleteGitApp(app.id);
      onChanged();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col bg-panel border border-border rounded-2xl p-4 gap-3 hover:border-muted transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono
              ${isGit ? 'border-accent/30 text-accent bg-accent/10' : 'border-purple/30 text-purple bg-purple/10'}`}>
              {isGit ? <Github size={10} /> : <Package size={10} />}
              {isGit ? 'git' : 'manual'}
            </span>
          </div>
          <p className="font-mono font-semibold text-sm truncate" title={name}>{name}</p>
          {isGit && app.projectName && app.repoFullName && (
            <p className="text-[10px] font-mono text-sub truncate">{app.repoFullName}</p>
          )}
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono font-medium ${meta.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-sub font-mono">
        {isGit && app.branch && (
          <span className="flex items-center gap-1"><GitBranch size={11} /> {app.branch}</span>
        )}
        {app.runtime && <span className="flex items-center gap-1"><Box size={11} /> {app.runtime}</span>}
        {app.updatedAt && <span className="ml-auto">{new Date(app.updatedAt).toLocaleString('th-TH')}</span>}
      </div>

      {error && (
        <p className="text-[10px] text-red font-mono bg-red/10 border border-red/30 rounded-lg px-2 py-1 break-all">{error}</p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">
        {isGit ? (
          <button onClick={deployNow} disabled={busy || deploying}
            className="flex items-center gap-1.5 text-[11px] font-mono text-sub hover:text-text border border-border rounded-lg px-2.5 py-1.5 disabled:opacity-40 transition-colors">
            <RotateCw size={12} className={deploying ? 'animate-spin' : ''} />
            {deploying ? 'Deploying…' : 'Deploy'}
          </button>
        ) : (
          <Link href={`/deploy?appId=${app.id}`}
            className="flex items-center gap-1.5 text-[11px] font-mono text-sub hover:text-text border border-border rounded-lg px-2.5 py-1.5 transition-colors">
            <RotateCw size={12} /> Redeploy
          </Link>
        )}

        {app.dashboardUrl && (
          <a href={app.dashboardUrl} target="_blank" rel="noreferrer" title="View Pipeline"
            className="flex items-center gap-1.5 text-[11px] font-mono text-sub hover:text-text border border-border rounded-lg px-2.5 py-1.5 transition-colors">
            <Activity size={12} />
          </a>
        )}

        {canVisit && (
          <a href={app.liveUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-mono text-green hover:opacity-80 border border-green/30 bg-green/10 rounded-lg px-2.5 py-1.5 transition-opacity">
            <ExternalLink size={12} /> Live
          </a>
        )}

        <button onClick={remove} disabled={busy} title="ลบ"
          className="ml-auto text-sub hover:text-red disabled:opacity-40 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
