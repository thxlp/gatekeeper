'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import TopBar from '@/components/shell/TopBar';
import StatusBadge from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { buildProjectOptions } from '@/lib/projects';
import { CertifiedService, GitAppSummary, Plugin } from '@/types';

const PluginGraphCanvas = dynamic(() => import('@/components/graph/PluginGraphCanvas'), { ssr: false });
const RegisterPluginModal = dynamic(() => import('@/components/plugins/RegisterPluginModal'), { ssr: false });

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [certified, setCertified] = useState<CertifiedService[]>([]);
  const [gitApps, setGitApps] = useState<GitAppSummary[]>([]);
  const [projectId, setProjectId] = useState('');
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [showModal, setShowModal] = useState(false);
  const [keyPrefix, setKeyPrefix] = useState('');

  const refresh = useCallback(async () => {
    const [p, c, a] = await Promise.all([api.listPlugins(), api.getCertified(), api.listGitApps()]);
    setPlugins(p);
    setCertified(c);
    setGitApps(a);
  }, []);

  useEffect(() => {
    refresh();
    setKeyPrefix(localStorage.getItem('gk_key_prefix') || '');
  }, [refresh]);

  const projectOptions = buildProjectOptions(gitApps);
  const visiblePlugins = projectId ? plugins.filter((p) => p.project_id === projectId) : plugins;
  const hubLabel = projectId ? projectOptions.find((p) => p.id === projectId)?.label || 'Project' : 'Gatekeeper';

  const counts = {
    active: visiblePlugins.filter((p) => p.status === 'active').length,
    blocked: visiblePlugins.filter((p) => p.status === 'blocked' || p.status === 'revoked').length,
    quarantine: visiblePlugins.filter((p) => p.status === 'quarantine').length,
    pending: visiblePlugins.filter((p) => ['pending', 'screening', 'generating'].includes(p.status)).length,
  };
  const statusPills = [
    { dot: 'bg-allow-dot', label: `${counts.active} active` },
    { dot: 'bg-danger-dot', label: `${counts.blocked} blocked` },
    { dot: 'bg-warn-dot', label: `${counts.quarantine} quarantine` },
    { dot: 'bg-[#96908C]', label: `${counts.pending} pending` },
  ];

  return (
    <>
      <TopBar
        variant="title"
        title={
          <span className="flex items-center gap-3.5">
            Plugins
            <span className="hidden gap-1.5 md:flex">
              {statusPills.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium">
                  <span className={`h-[7px] w-[7px] rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              ))}
            </span>
          </span>
        }
        right={
          <>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-[7px] border border-border bg-surface px-2.5 py-2 text-[12.5px] text-ink-soft"
            >
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={() => setView((v) => (v === 'graph' ? 'list' : 'graph'))}
              className="flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-soft"
            >
              <i className={view === 'graph' ? 'ph ph-list' : 'ph ph-share-network'} /> {view === 'graph' ? 'List' : 'Graph'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-[7px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              <i className="ph ph-plus" /> Add Plugin
            </button>
          </>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-page">
        {view === 'graph' ? (
          <PluginGraphCanvas plugins={visiblePlugins} hubLabel={hubLabel} />
        ) : (
          <PluginListView plugins={visiblePlugins} />
        )}
      </div>

      {showModal && (
        <RegisterPluginModal
          certified={certified}
          gitApps={gitApps}
          onClose={() => setShowModal(false)}
          onCreated={refresh}
        />
      )}

      <div className="flex h-8 flex-none items-center justify-between border-t border-border bg-surface px-4 text-[11px]">
        <span>API Key: <span className="font-mono text-muted-3">{keyPrefix}…</span></span>
        <span className="text-muted-3">{visiblePlugins.length} plugins · {view} view</span>
      </div>
    </>
  );
}

function PluginListView({ plugins }: { plugins: Plugin[] }) {
  if (plugins.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
        <i className="ph ph-plugs text-4xl" />
        <p className="text-[13px]">ยังไม่มี plugin — กด Add Plugin เพื่อเริ่มต้น</p>
      </div>
    );
  }
  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
      {plugins.map((p) => (
        <Link
          key={p.id}
          href={`/plugins/${p.id}`}
          className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
            <StatusBadge status={p.status} />
          </div>
          <p className="mb-2 truncate font-mono text-xs text-muted-3">{p.base_url}</p>
          <div className="flex items-center gap-3 text-[10.5px] text-muted">
            <span>{p.auth_type}</span>
            <span>{p.endpoints.length} ep</span>
            {p.risk_score !== undefined && (
              <span className={p.risk_score >= 50 ? 'text-danger-text' : p.risk_score > 0 ? 'text-warn-text' : 'text-allow-text'}>
                score {p.risk_score}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
