'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { zip } from 'fflate';
import { api } from '@/lib/api';
import FindingsList from '@/components/ui/FindingsList';
import PipelineStepper from '@/components/deploy/PipelineStepper';
import { DeployOutcome, GitAppDetail, PipelineStage } from '@/types';
import { ArrowLeft, CheckCircle, XCircle, Clock, FolderUp, FileArchive, ExternalLink } from 'lucide-react';

const RUNTIMES = ['node', 'static', 'python', 'docker'];
const POLL_MS = 1500;

// เดินไฟล์ทั้งหมดใน FileList (จาก webkitdirectory) ให้เป็น map path -> Uint8Array สำหรับป้อนเข้า fflate
async function filesToZipEntries(fileList: FileList): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  await Promise.all(
    Array.from(fileList).map(async (f) => {
      // webkitRelativePath เช่น "my-app/src/index.js" — ตัดชื่อ folder บนสุดออก ให้ zip root ตรงกับ project root
      const rel = (f as any).webkitRelativePath || f.name;
      const parts = rel.split('/');
      const path = parts.length > 1 ? parts.slice(1).join('/') : rel;
      if (!path) return;
      const buf = new Uint8Array(await f.arrayBuffer());
      entries[path] = buf;
    }),
  );
  return entries;
}

function zipEntriesToBlob(entries: Record<string, Uint8Array>): Promise<Blob> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (err, data) => {
      if (err) return reject(err);
      resolve(new Blob([data], { type: 'application/zip' }));
    });
  });
}

export default function DeployPage() {
  return (
    <Suspense fallback={null}>
      <DeployPageInner />
    </Suspense>
  );
}

function DeployPageInner() {
  const searchParams = useSearchParams();
  const redeployAppId = searchParams.get('appId') || undefined;

  const [projectName, setProjectName] = useState('');
  const [runtime, setRuntime] = useState('node');
  const [pendingArchive, setPendingArchive] = useState<Blob | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeployOutcome | null>(null);
  const [appDetail, setAppDetail] = useState<GitAppDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // ถ้ามาจากปุ่ม Redeploy (มี ?appId=) โหลดข้อมูล app เดิมมาตั้งค่า runtime ให้ตรงกันไว้ก่อน
    if (redeployAppId) {
      api.getApp(redeployAppId).then(setAppDetail).catch(() => undefined);
    }
  }, [redeployAppId]);

  useEffect(() => stopPolling, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // มี appId อยู่แล้วเท่านั้น (redeploy) ถึงจะ poll สถานะสดๆ ระหว่าง deploy ได้ — app ใหม่ยังไม่รู้ id
  // จนกว่า deployManual จะตอบกลับ (สร้าง id ตอนนั้น) เลย poll ระหว่างทางไม่ได้
  function startPolling(appId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const detail = await api.getApp(appId);
        setAppDetail(detail);
        if (detail.pipelineStatus === 'success' || detail.pipelineStatus === 'failed') {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    }, POLL_MS);
  }

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

  const handleDeploy = async () => {
    if (!pendingArchive) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('archive', pendingArchive, 'archive.zip');
    if (redeployAppId) {
      formData.append('appId', redeployAppId);
    } else {
      formData.append('projectName', projectName || 'my-app');
      formData.append('runtime', runtime);
    }

    if (redeployAppId) {
      startPolling(redeployAppId);
    }

    try {
      const r = await api.deployManual(formData);
      setResult(r);
      if (r.id) {
        const detail = await api.getApp(r.id);
        setAppDetail(detail);
      }
    } catch (e: any) {
      setResult({ decision: 'BLOCK', requestId: '', reason: e.message });
    } finally {
      stopPolling();
      setLoading(false);
    }
  };

  const decisionIcon =
    result?.decision === 'ALLOW' ? (
      <CheckCircle className="text-green" size={20} />
    ) : result?.decision === 'QUARANTINE' ? (
      <Clock className="text-yellow" size={20} />
    ) : result ? (
      <XCircle className="text-red" size={20} />
    ) : null;

  const showLiveButton = appDetail?.pipelineStatus === 'success' && !!appDetail.liveUrl;
  const stages: PipelineStage[] | undefined = appDetail?.pipelineStages;

  return (
    <div className="min-h-screen bg-surface text-text flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-panel">
        <Link href="/" className="flex items-center gap-1 text-sub hover:text-text text-xs font-mono">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <span className="text-border">|</span>
        <span className="text-sm font-mono font-semibold">
          {redeployAppId ? 'Redeploy App' : 'Deploy App'}
        </span>
        <Link href="/apps" className="ml-auto text-sub hover:text-text text-xs font-mono">
          ดูรายการแอปทั้งหมด →
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-xl space-y-6">
          <div className="bg-panel border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-base">
              {redeployAppId ? `Redeploy: ${appDetail?.projectName || redeployAppId}` : 'App Details'}
            </h2>

            {!redeployAppId && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-sub font-mono block mb-1">Project Name</label>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-awesome-app"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent placeholder:text-muted"
                  />
                </div>
                <div>
                  <label className="text-xs text-sub font-mono block mb-1">Runtime</label>
                  <select
                    value={runtime}
                    onChange={(e) => setRuntime(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent"
                  >
                    {RUNTIMES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* folder หรือ zip — อย่างใดอย่างหนึ่ง ทั้งสองทางจบที่ archive ก้อนเดียวส่งเข้า backend */}
            <div>
              <label className="text-xs text-sub font-mono block mb-2">Source</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-3 py-6 cursor-pointer transition-colors
                  ${pendingArchive ? 'border-green/50 bg-green/5' : 'border-border hover:border-muted'}`}
                >
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
                <label
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-3 py-6 cursor-pointer transition-colors
                  ${pendingArchive ? 'border-green/50 bg-green/5' : 'border-border hover:border-muted'}`}
                >
                  <FileArchive size={20} className={pendingArchive ? 'text-green' : 'text-sub'} />
                  <span className="mt-2 text-xs font-mono text-sub text-center">อัปโหลด .zip</span>
                  <input type="file" accept=".zip" className="hidden" onChange={handleZipPick} />
                </label>
              </div>
              {pendingLabel && <p className="mt-2 text-[10px] font-mono text-sub truncate">{pendingLabel}</p>}
            </div>

            <button
              onClick={handleDeploy}
              disabled={loading || !pendingArchive}
              className="w-full flex items-center justify-center gap-2 bg-accent text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'กำลัง deploy…' : redeployAppId ? 'Redeploy →' : 'Deploy →'}
            </button>
          </div>

          {loading && !stages && (
            <div className="bg-panel border border-border rounded-2xl p-5">
              <p className="text-xs text-sub font-mono">
                กำลังวิ่งผ่าน security pipeline (clone/extract → scan → build → deploy) — อาจใช้เวลาสักครู่…
              </p>
            </div>
          )}

          {stages && (
            <div className="bg-panel border border-border rounded-2xl p-5">
              <p className="text-xs text-sub font-mono mb-3 uppercase tracking-wider">Gatekeeper Pipeline</p>
              <PipelineStepper stages={stages} />
              {showLiveButton && (
                <a
                  href={appDetail!.liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 bg-green text-surface font-mono font-semibold text-sm rounded-xl py-2.5 hover:opacity-90 transition-opacity"
                >
                  <ExternalLink size={14} /> Visit Live Site →
                </a>
              )}
            </div>
          )}

          {result && (
            <div
              className={`bg-panel border rounded-2xl p-5 space-y-3
              ${result.decision === 'ALLOW' ? 'border-green/50' : result.decision === 'QUARANTINE' ? 'border-yellow/50' : 'border-red/50'}`}
            >
              <div className="flex items-center gap-2">
                {decisionIcon}
                <span
                  className={`font-mono font-bold text-lg
                  ${result.decision === 'ALLOW' ? 'text-green' : result.decision === 'QUARANTINE' ? 'text-yellow' : 'text-red'}`}
                >
                  {result.decision}
                </span>
                {result.score !== undefined && (
                  <span className="ml-auto text-sub text-xs font-mono">risk score: {result.score}</span>
                )}
              </div>

              {result.reason && <p className="text-xs font-mono text-sub">{result.reason}</p>}
              {result.message && <p className="text-xs font-mono text-yellow">{result.message}</p>}
              {result.deployedPath && <p className="text-xs font-mono text-green">✓ deployed: {result.deployedPath}</p>}
              {result.requestId && <p className="text-[10px] font-mono text-muted">request: {result.requestId}</p>}

              {result.findings && result.findings.length > 0 && (
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
