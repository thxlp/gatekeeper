'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { filesToZipEntries, zipEntriesToBlob } from '@/lib/zip';
import { DeployOutcome, GitAppDetail, GithubRepo, GithubStatus } from '@/types';
import FindingsList from '@/components/ui/FindingsList';
import PipelineStepper from '@/components/deploy/PipelineStepper';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileArchive,
  FolderUp,
  Github,
  KeyRound,
  Loader2,
  Lock,
  Package,
  Search,
  Unlink,
  X,
} from 'lucide-react';

const RUNTIMES = ['node', 'static', 'python', 'docker'];
const POLL_MS = 1500;

type Step = 'source' | 'github' | 'manual' | 'pipeline';

export default function NewProjectModal({
  onClose,
  onChanged,
  initialStep = 'source',
}: {
  onClose: () => void;
  onChanged: () => void;
  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step>(initialStep);

  // ── GitHub flow ──
  const [ghStatus, setGhStatus] = useState<GithubStatus | null>(null);
  const [pat, setPat] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState('main');
  const [runtime, setRuntime] = useState('node');
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Manual flow ──
  const [mProjectName, setMProjectName] = useState('');
  const [mRuntime, setMRuntime] = useState('node');
  const [pendingArchive, setPendingArchive] = useState<Blob | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [manualResult, setManualResult] = useState<DeployOutcome | null>(null);

  // ── Pipeline view (ปลายทางร่วมของทั้งสอง flow) ──
  const [appId, setAppId] = useState('');
  const [appDetail, setAppDetail] = useState<GitAppDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === 'github' && !ghStatus) loadGithubStatus();
  }, [step]);

  useEffect(() => stopPolling, []);

  // ระหว่างอยู่หน้า pipeline — poll สถานะ stage สดๆ จนกว่าจะจบ (success/failed)
  useEffect(() => {
    if (step !== 'pipeline' || !appId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const detail = await api.getApp(appId);
        if (cancelled) return;
        setAppDetail(detail);
        if (detail.pipelineStatus === 'success' || detail.pipelineStatus === 'failed') {
          stopPolling();
          onChanged();
        }
      } catch {
        stopPolling();
      }
    };
    tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [step, appId]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function loadGithubStatus() {
    try {
      const s = await api.github.status();
      setGhStatus(s);
      if (s.connected) loadRepos();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function loadRepos() {
    setRepos(null);
    try {
      setRepos(await api.github.repos());
    } catch (e: any) {
      setError(e.message);
      setRepos([]);
    }
  }

  // เชื่อมผ่าน OAuth — redirect ออกไป GitHub แล้วกลับมาที่ /?github=connect
  // (หน้าหลักจะจับ provider_token จาก session แล้วส่งให้ backend + เปิด modal นี้กลับมาเอง)
  const connectOAuth = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/?github=connect`, scopes: 'repo' },
    });
  };

  const connectPat = async () => {
    if (!pat.trim()) return;
    setConnecting(true);
    setError('');
    try {
      const s = await api.github.connect(pat.trim());
      setGhStatus(s);
      setPat('');
      loadRepos();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('ยกเลิกการเชื่อมต่อ GitHub?')) return;
    await api.github.disconnect().catch(() => undefined);
    setGhStatus({ connected: false });
    setRepos(null);
    setSelectedRepo(null);
  };

  const pickRepo = async (repo: GithubRepo) => {
    setSelectedRepo(repo);
    setBranch(repo.defaultBranch || 'main');
    setBranches(null);
    setError('');
    try {
      const [owner, name] = repo.fullName.split('/');
      setBranches(await api.github.branches(owner, name));
    } catch {
      setBranches([repo.defaultBranch || 'main']);
    }
  };

  const deployFromGithub = async () => {
    if (!selectedRepo) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.registerGithubApp({
        repoFullName: selectedRepo.fullName,
        branch,
        runtime,
        projectName: projectName.trim() || undefined,
      });
      onChanged();
      setAppId(res.id);
      setStep('pipeline');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFolderPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const entries = await filesToZipEntries(fileList);
    const blob = await zipEntriesToBlob(entries);
    setPendingArchive(blob);
    setPendingLabel(`${Object.keys(entries).length} ไฟล์ (แตกจาก folder)`);
  };

  const handleZipPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingArchive(f);
    setPendingLabel(f.name);
  };

  // manual deploy รอ pipeline จบใน request เดียว (id ของ app ใหม่เพิ่งรู้ตอนตอบกลับ เลย poll
  // ระหว่างทางไม่ได้ — พฤติกรรมเดียวกับหน้า /deploy เดิม) จบแล้วค่อยพาไปหน้า pipeline สรุปผล
  const deployManual = async () => {
    if (!pendingArchive) return;
    setSubmitting(true);
    setError('');
    setManualResult(null);
    const formData = new FormData();
    formData.append('archive', pendingArchive, 'archive.zip');
    formData.append('projectName', mProjectName.trim() || 'my-app');
    formData.append('runtime', mRuntime);
    try {
      const r = await api.deployManual(formData);
      setManualResult(r);
      onChanged();
      if (r.id) {
        setAppId(r.id);
        setStep('pipeline');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRepos = useMemo(() => {
    if (!repos) return null;
    const q = search.trim().toLowerCase();
    return q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
  }, [repos, search]);

  const title =
    step === 'source' ? 'New Project'
    : step === 'github' ? 'Deploy from GitHub'
    : step === 'manual' ? 'Deploy Manual (Upload)'
    : 'Gatekeeper Pipeline';

  const showBack = step === 'github' || step === 'manual';
  const pipelineDone = appDetail?.pipelineStatus === 'success' || appDetail?.pipelineStatus === 'failed';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-6 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-panel border border-border rounded-2xl mt-8">
        {/* header */}
        <div className="flex items-center gap-2 px-5 h-12 border-b border-border">
          {showBack && (
            <button onClick={() => { setStep('source'); setError(''); }} className="text-sub hover:text-text">
              <ArrowLeft size={15} />
            </button>
          )}
          <span className="font-mono font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="ml-auto text-sub hover:text-text">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── STEP: เลือก source ─────────────────────────────── */}
          {step === 'source' && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep('github')}
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-accent rounded-xl px-3 py-8 transition-colors">
                <Github size={24} className="text-text" />
                <span className="text-xs font-mono font-semibold">GitHub Repo</span>
                <span className="text-[10px] font-mono text-sub text-center">
                  เลือก repo + ตั้ง webhook อัตโนมัติ<br />push แล้ว auto-deploy
                </span>
              </button>
              <button onClick={() => setStep('manual')}
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-accent rounded-xl px-3 py-8 transition-colors">
                <Package size={24} className="text-text" />
                <span className="text-xs font-mono font-semibold">Manual Upload</span>
                <span className="text-[10px] font-mono text-sub text-center">
                  อัปโหลด folder หรือ .zip<br />deploy ครั้งเดียว
                </span>
              </button>
            </div>
          )}

          {/* ── STEP: GitHub ──────────────────────────────────── */}
          {step === 'github' && (
            <>
              {!ghStatus && <p className="text-xs text-sub font-mono">กำลังตรวจสอบการเชื่อมต่อ GitHub…</p>}

              {ghStatus && !ghStatus.connected && (
                <div className="space-y-4">
                  <p className="text-xs font-mono text-sub">
                    เชื่อมบัญชี GitHub ก่อน เพื่อเลือก repo จากรายการและให้ระบบตั้ง webhook ให้อัตโนมัติ
                  </p>
                  <button onClick={connectOAuth}
                    className="w-full flex items-center justify-center gap-2 bg-surface border border-border rounded-xl py-2.5 text-sm font-mono hover:border-muted transition-colors">
                    <Github size={16} /> Connect with GitHub (OAuth)
                  </button>
                  <div className="flex items-center gap-2 text-[10px] text-muted font-mono">
                    <div className="flex-1 h-px bg-border" /> หรือใช้ Personal Access Token <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="flex gap-2">
                    <input type="password" value={pat} onChange={(e) => setPat(e.target.value)}
                      placeholder="ghp_… (scope: repo)"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
                    <button onClick={connectPat} disabled={connecting || !pat.trim()}
                      className="flex items-center gap-1.5 bg-accent text-surface text-xs font-mono font-semibold rounded-lg px-3 disabled:opacity-40">
                      <KeyRound size={12} /> {connecting ? '…' : 'Connect'}
                    </button>
                  </div>
                  <p className="text-[10px] font-mono text-muted">
                    token ใช้แค่ list repo / สร้าง webhook / clone ตอน deploy เท่านั้น (ต้องมี scope repo)
                  </p>
                </div>
              )}

              {ghStatus?.connected && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <CheckCircle2 size={13} className="text-green" />
                    <span className="text-sub">เชื่อมต่อแล้ว:</span>
                    <span className="text-text font-semibold">@{ghStatus.username}</span>
                    <button onClick={disconnect} title="ยกเลิกการเชื่อมต่อ"
                      className="ml-auto flex items-center gap-1 text-[10px] text-sub hover:text-red transition-colors">
                      <Unlink size={11} /> disconnect
                    </button>
                  </div>

                  {!selectedRepo && (
                    <>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา repo…"
                          className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
                      </div>
                      <div className="border border-border rounded-xl divide-y divide-border max-h-64 overflow-y-auto">
                        {!filteredRepos && <p className="text-xs text-sub font-mono p-3">กำลังโหลดรายการ repo…</p>}
                        {filteredRepos && filteredRepos.length === 0 && (
                          <p className="text-xs text-sub font-mono p-3">ไม่พบ repo</p>
                        )}
                        {filteredRepos?.map((r) => (
                          <button key={r.fullName} onClick={() => pickRepo(r)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface transition-colors">
                            {r.private ? <Lock size={12} className="text-yellow shrink-0" /> : <Github size={12} className="text-sub shrink-0" />}
                            <span className="text-xs font-mono truncate">{r.fullName}</span>
                            <span className="ml-auto text-[10px] font-mono text-muted shrink-0">{r.defaultBranch}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedRepo && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
                        {selectedRepo.private ? <Lock size={12} className="text-yellow" /> : <Github size={12} className="text-sub" />}
                        <span className="text-xs font-mono font-semibold truncate">{selectedRepo.fullName}</span>
                        <button onClick={() => setSelectedRepo(null)} className="ml-auto text-[10px] font-mono text-sub hover:text-text">
                          เปลี่ยน repo
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-sub font-mono block mb-1">Branch</label>
                          <select value={branch} onChange={(e) => setBranch(e.target.value)}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                            {(branches || [branch]).map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-sub font-mono block mb-1">Runtime</label>
                          <select value={runtime} onChange={(e) => setRuntime(e.target.value)}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                            {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-sub font-mono block mb-1">Project Name (ไม่บังคับ)</label>
                        <input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                          placeholder={selectedRepo.name}
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
                      </div>

                      <button onClick={deployFromGithub} disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 bg-accent text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:bg-accent/90 disabled:opacity-40 transition-colors">
                        {submitting ? <><Loader2 size={14} className="animate-spin" /> กำลังตั้งค่า webhook + เริ่ม deploy…</> : 'Deploy →'}
                      </button>
                      <p className="text-[10px] font-mono text-muted">
                        ระบบจะสร้าง push webhook ใน repo ให้อัตโนมัติ — push ครั้งถัดไปเข้า branch นี้จะ auto-deploy
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP: Manual upload ───────────────────────────── */}
          {step === 'manual' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-sub font-mono block mb-1">Project Name</label>
                  <input value={mProjectName} onChange={(e) => setMProjectName(e.target.value)} placeholder="my-awesome-app"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted" />
                </div>
                <div>
                  <label className="text-xs text-sub font-mono block mb-1">Runtime</label>
                  <select value={mRuntime} onChange={(e) => setMRuntime(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent">
                    {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {/* folder หรือ zip — อย่างใดอย่างหนึ่ง ทั้งสองทางจบที่ archive ก้อนเดียวส่งเข้า backend */}
              <div>
                <label className="text-xs text-sub font-mono block mb-2">Source</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-3 py-6 cursor-pointer transition-colors
                    ${pendingArchive ? 'border-green/50 bg-green/5' : 'border-border hover:border-muted'}`}>
                    <FolderUp size={20} className={pendingArchive ? 'text-green' : 'text-sub'} />
                    <span className="mt-2 text-xs font-mono text-sub text-center">เลือก Folder</span>
                    <input
                      type="file"
                      // @ts-expect-error non-standard attrs, only relevant for folder picking in Chromium/Firefox
                      webkitdirectory=""
                      directory=""
                      multiple
                      className="hidden"
                      onChange={handleFolderPick}
                    />
                  </label>
                  <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-3 py-6 cursor-pointer transition-colors
                    ${pendingArchive ? 'border-green/50 bg-green/5' : 'border-border hover:border-muted'}`}>
                    <FileArchive size={20} className={pendingArchive ? 'text-green' : 'text-sub'} />
                    <span className="mt-2 text-xs font-mono text-sub text-center">อัปโหลด .zip</span>
                    <input type="file" accept=".zip" className="hidden" onChange={handleZipPick} />
                  </label>
                </div>
                {pendingLabel && <p className="mt-2 text-[10px] font-mono text-sub truncate">{pendingLabel}</p>}
              </div>

              <button onClick={deployManual} disabled={submitting || !pendingArchive}
                className="w-full flex items-center justify-center gap-2 bg-accent text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {submitting ? <><Loader2 size={14} className="animate-spin" /> กำลังวิ่งผ่าน security pipeline…</> : 'Deploy →'}
              </button>
              {submitting && (
                <p className="text-[10px] font-mono text-sub">
                  extract → scan → build → deploy — อาจใช้เวลาสักครู่…
                </p>
              )}
              {manualResult && !manualResult.id && (
                <div className="bg-panel border border-red/50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-mono font-bold text-red">{manualResult.decision}</p>
                  {manualResult.reason && <p className="text-xs font-mono text-sub">{manualResult.reason}</p>}
                  {manualResult.findings && manualResult.findings.length > 0 && <FindingsList findings={manualResult.findings} />}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: Pipeline (ปลายทางร่วม) ──────────────────── */}
          {step === 'pipeline' && (
            <div className="space-y-4">
              {!appDetail && <p className="text-xs text-sub font-mono">กำลังโหลดสถานะ pipeline…</p>}
              {appDetail && (
                <>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-sub">โปรเจกต์:</span>
                    <span className="font-semibold">{appDetail.projectName || appDetail.repoFullName || appDetail.id}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded-full border text-[10px]
                      ${appDetail.pipelineStatus === 'success' ? 'text-green border-green/30 bg-green/10'
                        : appDetail.pipelineStatus === 'failed' ? 'text-red border-red/30 bg-red/10'
                        : 'text-accent border-accent/30 bg-accent/10'}`}>
                      {appDetail.pipelineStatus}
                    </span>
                  </div>
                  {appDetail.pipelineStages && <PipelineStepper stages={appDetail.pipelineStages} />}

                  {manualResult && manualResult.decision !== 'ALLOW' && (
                    <div className="bg-surface border border-red/40 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-mono font-bold text-red">{manualResult.decision}</p>
                      {(manualResult.reason || manualResult.message) && (
                        <p className="text-xs font-mono text-sub">{manualResult.reason || manualResult.message}</p>
                      )}
                      {manualResult.findings && manualResult.findings.length > 0 && <FindingsList findings={manualResult.findings} />}
                    </div>
                  )}

                  {appDetail.pipelineStatus === 'success' && appDetail.liveUrl && (
                    <a href={appDetail.liveUrl} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 bg-green text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:opacity-90 transition-opacity">
                      <ExternalLink size={14} /> Visit Live Site →
                    </a>
                  )}
                  {pipelineDone && (
                    <button onClick={onClose}
                      className="w-full text-sm text-sub hover:text-text border border-border rounded-xl py-2 font-mono">
                      ปิด
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red font-mono bg-red/10 border border-red/30 rounded-lg px-3 py-2 break-all">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
