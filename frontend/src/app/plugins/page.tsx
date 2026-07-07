'use client';
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { Plugin, CertifiedService, GitAppSummary } from '@/types';
import { buildProjectOptions } from '@/lib/projects';
import { useApiKey } from '@/lib/use-api-key';
import StatusBadge from '@/components/ui/StatusBadge';
import NavTabs from '@/components/ui/NavTabs';
import { useAuth } from '@/components/auth/AuthProvider';
import { Plus, Activity, LayoutGrid, LogOut, Boxes } from 'lucide-react';

const PluginGraphCanvas   = dynamic(() => import('@/components/graph/PluginGraphCanvas'),   { ssr: false });
const PluginDetailPanel   = dynamic(() => import('@/components/plugins/PluginDetailPanel'), { ssr: false });
const RegisterPluginModal = dynamic(() => import('@/components/plugins/RegisterPluginModal'),{ ssr: false });

// หน้ากราฟ plugin (dashboard เดิมทั้งหน้า) — ย้ายจาก / มาอยู่ที่ /plugins ตอนเปลี่ยนหน้าหลัก
// เป็น Projects (deploy แบบ Railway) เนื้อหาข้างในเหมือนเดิมทุกอย่าง
export default function PluginsPage() {
  const { keyPrefix, authChecked } = useApiKey();
  const { logout } = useAuth();
  const [plugins,     setPlugins]     = useState<Plugin[]>([]);
  const [certified,   setCertified]   = useState<CertifiedService[]>([]);
  const [gitApps,     setGitApps]     = useState<GitAppSummary[]>([]);
  const [projectId,   setProjectId]   = useState(''); // '' = ทุกโปรเจกต์ (All)
  const [selected,    setSelected]    = useState<Plugin | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const [view,        setView]        = useState<'graph' | 'list'>('graph');
  const [loading,     setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    if (!authChecked) return;
    setLoading(true);
    try {
      const [p, c, a] = await Promise.all([api.listPlugins(), api.getCertified(), api.listGitApps()]);
      setPlugins(p);
      setCertified(c);
      setGitApps(a);
      // refresh selected plugin ถ้ามี
      if (selected) {
        const fresh = p.find(pl => pl.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (e) {
      // จะ throw ถ้า key ไม่ถูก — ไม่ต้อง handle เพิ่ม
    } finally {
      setLoading(false);
    }
  }, [authChecked, selected?.id]);

  useEffect(() => { refresh(); }, [authChecked]);

  // กรอง plugin ตามโปรเจกต์ที่เลือกใน dropdown ('' = แสดงทุกโปรเจกต์เหมือนเดิม)
  const projectOptions = buildProjectOptions(gitApps);
  const visiblePlugins = projectId ? plugins.filter(p => p.project_id === projectId) : plugins;
  const hubLabel = projectId
    ? projectOptions.find(p => p.id === projectId)?.label || 'Project'
    : '🔐 Gatekeeper';

  // stats
  const counts = {
    total:      visiblePlugins.length,
    active:     visiblePlugins.filter(p => p.status === 'active').length,
    blocked:    visiblePlugins.filter(p => p.status === 'blocked' || p.status === 'revoked').length,
    quarantine: visiblePlugins.filter(p => p.status === 'quarantine').length,
    pending:    visiblePlugins.filter(p => ['pending','screening','generating'].includes(p.status)).length,
  };

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface text-sub font-mono text-sm">
        กำลังตรวจสอบสถานะการเข้าสู่ระบบ…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface text-text">
      {/* ── Topbar ─────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <div className="flex items-center gap-2 mr-2">
          <span className="text-accent font-mono font-bold text-sm">🔐 Gatekeeper</span>
          <span className="text-muted text-xs font-mono">v0.2</span>
        </div>

        <NavTabs active="plugins" />

        {/* project selector */}
        <div className="flex items-center gap-1.5">
          <Boxes size={12} className="text-sub shrink-0" />
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="bg-surface border border-border rounded-lg px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent max-w-[180px]">
            <option value="">All Projects</option>
            {projectOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {/* stats pills */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <Pill label="active"     value={counts.active}     color="text-green" />
          <Pill label="blocked"    value={counts.blocked}    color="text-red" />
          <Pill label="quarantine" value={counts.quarantine} color="text-yellow" />
          <Pill label="pending"    value={counts.pending}    color="text-purple" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* view toggle */}
          <button onClick={() => setView(v => v === 'graph' ? 'list' : 'graph')}
            className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono border border-border rounded-lg px-2 py-1">
            {view === 'graph' ? <><LayoutGrid size={12}/> List</> : <><Activity size={12}/> Graph</>}
          </button>

          {/* add plugin */}
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors">
            <Plus size={12}/> Add Plugin
          </button>
        </div>
      </header>

      {/* ── Main area ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph / List */}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-panel border border-border rounded-full px-3 py-1 text-xs font-mono text-sub">
              กำลังโหลด…
            </div>
          )}

          {view === 'graph' ? (
            <PluginGraphCanvas plugins={visiblePlugins} hubLabel={hubLabel} onSelectPlugin={setSelected} />
          ) : (
            <PluginListView plugins={visiblePlugins} onSelect={setSelected} selected={selected} />
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <PluginDetailPanel
            plugin={selected}
            gitApps={gitApps}
            onClose={() => setSelected(null)}
            onRefresh={refresh}
          />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <RegisterPluginModal
          certified={certified}
          gitApps={gitApps}
          onClose={() => setShowModal(false)}
          onCreated={refresh}
        />
      )}

      {/* footer: API key (read-only) + logout */}
      <footer className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-t border-border bg-panel">
        <span className="text-[10px] text-sub font-mono">
          API Key: <span className="text-muted">{keyPrefix}…</span>
        </span>
        <button onClick={logout}
          className="flex items-center gap-1 text-[10px] font-mono text-sub hover:text-red transition-colors">
          <LogOut size={11} /> Logout
        </button>
        <span className="ml-auto text-[10px] text-muted font-mono">
          {visiblePlugins.length} plugins
        </span>
      </footer>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 bg-surface border border-border rounded-full ${color}`}>
      <span className="font-bold">{value}</span>
      <span className="text-sub">{label}</span>
    </span>
  );
}

function PluginListView({ plugins, onSelect, selected }: {
  plugins: Plugin[]; onSelect: (p: Plugin) => void; selected: Plugin | null;
}) {
  return (
    <div className="p-4 overflow-y-auto h-full">
      {plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-sub font-mono text-sm gap-2">
          <span className="text-4xl">🔌</span>
          <p>ยังไม่มี plugin — กด Add Plugin เพื่อเริ่มต้น</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {plugins.map(p => (
          <button key={p.id} onClick={() => onSelect(p)}
            className={`text-left rounded-xl border bg-panel p-4 transition-all hover:border-muted
              ${selected?.id === p.id ? 'border-accent ring-1 ring-accent' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="font-semibold text-sm truncate">{p.name}</span>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-xs font-mono text-sub truncate mb-2">{p.base_url}</p>
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
              <span>{p.auth_type}</span>
              <span>{p.endpoints.length} ep</span>
              {p.risk_score !== undefined && (
                <span className={p.risk_score >= 50 ? 'text-red' : p.risk_score > 0 ? 'text-yellow' : 'text-green'}>
                  score {p.risk_score}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
