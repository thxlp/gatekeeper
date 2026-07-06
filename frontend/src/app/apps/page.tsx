'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { GitAppSummary } from '@/types';
import CopyField from '@/components/ui/CopyField';
import {
  ArrowLeft,
  Github,
  Plus,
  GitBranch,
  Box,
  Pencil,
  Trash2,
  X,
  Check,
  Package,
  RotateCw,
  ExternalLink,
  Activity,
} from 'lucide-react';

const RUNTIMES = ['node', 'python', 'static', 'docker'];

const PIPELINE_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  idle: { label: 'Idle', cls: 'bg-border/20 text-sub border-border', dot: 'bg-sub' },
  deploying: { label: 'Deploying…', cls: 'bg-accent/10 text-accent border-accent/30', dot: 'bg-accent pulse-green' },
  success: { label: 'Live', cls: 'bg-green/10 text-green border-green/30', dot: 'bg-green' },
  failed: { label: 'Failed', cls: 'bg-red/10 text-red border-red/30', dot: 'bg-red' },
};

export default function AppsListPage() {
  const [apps, setApps] = useState<GitAppSummary[] | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => {
    api.listGitApps().then(setApps).catch((e: any) => setError(e.message));
  };

  useEffect(load, []);

  const remove = async (app: GitAppSummary) => {
    const label = app.sourceType === 'git' ? app.repoFullName : app.projectName || app.id;
    if (!confirm(`ลบ ${label} ออกจากระบบ? ${app.sourceType === 'git' ? 'webhook นี้จะ auto-deploy ไม่ได้อีก' : ''}`)) return;
    try {
      await api.deleteGitApp(app.id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <Link href="/" className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <span className="text-border">|</span>
        <span className="text-sm font-mono font-semibold flex items-center gap-1.5">
          <Github size={14} /> Apps
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/deploy"
            className="flex items-center gap-1.5 bg-surface border border-border text-text text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:border-accent transition-colors"
          >
            <Package size={12} /> Manual Deploy
          </Link>
          <Link
            href="/apps/register"
            className="flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors"
          >
            <Plus size={12} /> Register Git Repo
          </Link>
        </div>
      </header>

      <div className="flex-1 p-6">
        <div className="w-full max-w-3xl mx-auto space-y-3">
          {error && (
            <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">{error}</p>
          )}

          {!apps && !error && <p className="text-xs text-sub font-mono">กำลังโหลด…</p>}

          {apps && apps.length === 0 && (
            <div className="bg-panel border border-border rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-sub font-mono">ยังไม่มีแอปที่ deploy ไว้</p>
              <div className="flex items-center justify-center gap-2">
                <Link
                  href="/deploy"
                  className="inline-flex items-center gap-1.5 bg-surface border border-border text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:border-accent transition-colors"
                >
                  <Package size={12} /> Manual Deploy
                </Link>
                <Link
                  href="/apps/register"
                  className="inline-flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors"
                >
                  <Plus size={12} /> Register Git Repo
                </Link>
              </div>
            </div>
          )}

          {apps?.map((app) =>
            editingId === app.id ? (
              <EditCard
                key={app.id}
                app={app}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
              />
            ) : (
              <AppRow key={app.id} app={app} onEdit={() => setEditingId(app.id)} onRemove={() => remove(app)} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function AppRow({ app, onEdit, onRemove }: { app: GitAppSummary; onEdit: () => void; onRemove: () => void }) {
  const isGit = app.sourceType === 'git';
  const statusMeta = PIPELINE_STATUS_META[app.pipelineStatus || 'idle'] || PIPELINE_STATUS_META.idle;
  const canVisit = app.pipelineStatus === 'success' && !!app.liveUrl;

  return (
    <div className="bg-panel border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono
            ${isGit ? 'border-accent/30 text-accent bg-accent/10' : 'border-purple/30 text-purple bg-purple/10'}`}
          >
            {isGit ? <Github size={10} /> : <Package size={10} />}
            {isGit ? 'git' : 'manual'}
          </span>
          <span className="font-mono font-semibold text-sm">
            {isGit ? app.repoFullName : app.projectName || app.id}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono font-medium ${statusMeta.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
          {isGit && (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono font-medium ${
                app.enabled ? 'bg-green/10 text-green border-green/30' : 'bg-red/10 text-red border-red/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${app.enabled ? 'bg-green' : 'bg-red'}`} />
              {app.enabled ? 'Active' : 'Disabled'}
            </span>
          )}
          {isGit && (
            <button onClick={onEdit} className="text-sub hover:text-accent transition-colors" title="แก้ไข">
              <Pencil size={13} />
            </button>
          )}
          <button onClick={onRemove} className="text-sub hover:text-red transition-colors" title="ลบ">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-sub font-mono">
        {isGit && app.branch && (
          <span className="flex items-center gap-1">
            <GitBranch size={12} /> {app.branch}
          </span>
        )}
        {app.runtime && (
          <span className="flex items-center gap-1">
            <Box size={12} /> {app.runtime}
          </span>
        )}
        {app.createdAt && <span>สร้างเมื่อ {new Date(app.createdAt).toLocaleString('th-TH')}</span>}
      </div>

      {isGit && app.webhookUrl && <CopyField label="Webhook URL" value={app.webhookUrl} />}

      <div className="flex items-center gap-2 pt-1">
        {app.dashboardUrl && (
          <a
            href={app.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-mono text-sub hover:text-text border border-border rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Activity size={12} /> View Pipeline
          </a>
        )}
        {!isGit && (
          <Link
            href={`/deploy?appId=${app.id}`}
            className="flex items-center gap-1.5 text-[11px] font-mono text-sub hover:text-text border border-border rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <RotateCw size={12} /> Redeploy
          </Link>
        )}
        {canVisit && (
          <a
            href={app.liveUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-mono text-green hover:opacity-80 border border-green/30 bg-green/10 rounded-lg px-2.5 py-1.5 transition-opacity"
          >
            <ExternalLink size={12} /> Visit Live Site
          </a>
        )}
      </div>
    </div>
  );
}

function EditCard({
  app,
  onCancel,
  onSaved,
}: {
  app: GitAppSummary;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [branch, setBranch] = useState(app.branch || 'main');
  const [runtime, setRuntime] = useState(app.runtime || 'node');
  const [enabled, setEnabled] = useState(app.enabled);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setError('');
    setLoading(true);
    try {
      await api.updateGitApp(app.id, { branch: branch.trim() || 'main', runtime, enabled });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-panel border border-accent/50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-sm">{app.repoFullName}</span>
        <button onClick={onCancel} className="text-sub hover:text-text">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-sub font-mono block mb-1">Branch</label>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-sub font-mono block mb-1">Runtime</label>
          <select
            value={runtime}
            onChange={(e) => setRuntime(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent"
          >
            {RUNTIMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs font-mono text-sub cursor-pointer w-fit">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-accent" />
        เปิดใช้งาน (auto-deploy เมื่อมี push เข้า branch นี้)
      </label>

      {error && <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCancel} className="text-sm text-sub hover:text-text border border-border rounded-lg py-2 font-mono">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 text-sm bg-accent text-surface font-semibold rounded-lg py-2 font-mono hover:bg-accent/90 disabled:opacity-40 transition-colors"
        >
          {loading ? 'กำลังบันทึก…' : (
            <>
              <Check size={13} /> Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
