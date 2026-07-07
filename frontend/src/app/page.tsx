'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { GitAppSummary } from '@/types';
import { useApiKey } from '@/lib/use-api-key';
import NavTabs from '@/components/ui/NavTabs';
import NewProjectModal from '@/components/projects/NewProjectModal';
import ProjectCard from '@/components/projects/ProjectCard';
import { useAuth } from '@/components/auth/AuthProvider';
import { LogOut, Plus, Rocket } from 'lucide-react';

const LIST_POLL_MS = 4000;

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageInner />
    </Suspense>
  );
}

// หน้าหลักแบบ Railway: project cards ของแอปที่ deploy ผ่าน gatekeeper pipeline (ทั้ง git และ
// manual) + ปุ่ม New Project — ส่วนกราฟ plugin เดิมย้ายไปอยู่ที่ /plugins
function ProjectsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { keyPrefix, authChecked } = useApiKey();
  const { logout } = useAuth();

  const [apps, setApps] = useState<GitAppSummary[] | null>(null);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<'source' | 'github'>('source');

  const refresh = useCallback(async () => {
    if (!authChecked) return;
    try {
      setApps(await api.listGitApps());
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [authChecked]);

  useEffect(() => { refresh(); }, [refresh]);

  // มีแอปกำลัง deploy อยู่ → poll รายการซ้ำเพื่อให้สถานะบนการ์ดขยับสด (นอกนั้นไม่ต้อง poll)
  useEffect(() => {
    if (!apps?.some((a) => a.pipelineStatus === 'deploying')) return;
    const t = setInterval(refresh, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [apps, refresh]);

  // กลับมาจาก GitHub OAuth (connect flow ของ modal): จับ provider_token จาก Supabase session
  // ส่งให้ backend เก็บเป็น GitHub token ของบัญชีนี้ แล้วเปิด modal กลับไปที่ step GitHub ต่อ
  useEffect(() => {
    if (!authChecked) return;
    const wantsGithub = searchParams.get('github') === 'connect';
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const providerToken = (data.session as any)?.provider_token as string | undefined;
        if (providerToken) await api.github.connect(providerToken).catch(() => undefined);
      } finally {
        if (wantsGithub) {
          setModalStep('github');
          setShowModal(true);
          router.replace('/', { scroll: false });
        }
      }
    })();
  }, [authChecked]);

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface text-sub font-mono text-sm">
        กำลังตรวจสอบสถานะการเข้าสู่ระบบ…
      </div>
    );
  }

  const deploying = apps?.filter((a) => a.pipelineStatus === 'deploying').length || 0;
  const live = apps?.filter((a) => a.pipelineStatus === 'success').length || 0;

  return (
    <div className="flex flex-col h-screen bg-surface text-text">
      {/* ── Topbar ─────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <div className="flex items-center gap-2 mr-2">
          <span className="text-accent font-mono font-bold text-sm">🔐 Gatekeeper</span>
          <span className="text-muted text-xs font-mono">v0.2</span>
        </div>

        <NavTabs active="projects" />

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-surface border border-border rounded-full text-green">
            <span className="font-bold">{live}</span><span className="text-sub">live</span>
          </span>
          {deploying > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-surface border border-border rounded-full text-accent">
              <span className="font-bold">{deploying}</span><span className="text-sub">deploying</span>
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/apps" className="text-sub hover:text-text text-xs font-mono border border-border rounded-lg px-2 py-1">
            จัดการแอป
          </Link>
          <button onClick={() => { setModalStep('source'); setShowModal(true); }}
            className="flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors">
            <Plus size={12} /> New Project
          </button>
        </div>
      </header>

      {/* ── Cards ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {error && (
            <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2">{error}</p>
          )}

          {!apps && !error && <p className="text-xs text-sub font-mono">กำลังโหลด…</p>}

          {apps && apps.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <Rocket size={40} className="text-sub" />
              <div>
                <p className="text-sm font-mono font-semibold">ยังไม่มีโปรเจกต์</p>
                <p className="text-xs font-mono text-sub mt-1">
                  deploy จาก GitHub repo หรืออัปโหลด folder/zip — ทุก deploy วิ่งผ่าน security pipeline
                </p>
              </div>
              <button onClick={() => { setModalStep('source'); setShowModal(true); }}
                className="flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-4 py-2 hover:bg-accent/90 transition-colors">
                <Plus size={12} /> New Project
              </button>
            </div>
          )}

          {apps && apps.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apps.map((app) => (
                <ProjectCard key={app.id} app={app} onChanged={refresh} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewProjectModal
          initialStep={modalStep}
          onClose={() => setShowModal(false)}
          onChanged={refresh}
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
          {apps?.length ?? 0} projects
        </span>
      </footer>
    </div>
  );
}
