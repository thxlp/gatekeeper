'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TopBar from '@/components/shell/TopBar';
import CopyField from '@/components/ui/CopyField';
import FindingsList from '@/components/ui/FindingsList';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { filesToZipEntries, zipEntriesToBlob } from '@/lib/zip';
import { DeployOutcome, GitAppDetail, GitAppRegistration, GithubRepo, GithubStatus } from '@/types';

// node/static only — python/docker return runtime_not_yet_supported server-side
// (backend/src/deploy/docker-runtime.service.ts)
const RUNTIMES = ['node', 'static'];
const GITHUB_REPO_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;

export default function DeployPage() {
  return (
    <Suspense fallback={null}>
      <DeployPageInner />
    </Suspense>
  );
}

function DeployPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redeployAppId = searchParams.get('appId') || undefined;

  const [tab, setTab] = useState<'github' | 'manual'>(redeployAppId ? 'manual' : 'github');
  const [redeployDetail, setRedeployDetail] = useState<GitAppDetail | null>(null);

  useEffect(() => {
    if (redeployAppId) api.getApp(redeployAppId).then(setRedeployDetail).catch(() => undefined);
  }, [redeployAppId]);

  return (
    <>
      <TopBar variant="title" title="New Deploy" backHref="/" />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-6 lg:flex-row">
        <div className="w-full flex-none lg:w-[640px]">
          {!redeployAppId && (
            <div className="mb-[18px] flex w-fit gap-1 rounded-[9px] bg-[#EFEDE6] p-1">
              <button
                onClick={() => setTab('github')}
                className={`flex items-center gap-1.5 rounded-[7px] px-4 py-[7px] text-[12.5px] ${
                  tab === 'github' ? 'bg-surface font-semibold shadow-card-soft' : 'font-medium text-muted'
                }`}
              >
                <i className="ph-fill ph-github-logo" /> GitHub Repo
              </button>
              <button
                onClick={() => setTab('manual')}
                className={`flex items-center gap-1.5 rounded-[7px] px-4 py-[7px] text-[12.5px] ${
                  tab === 'manual' ? 'bg-surface font-semibold shadow-card-soft' : 'font-medium text-muted'
                }`}
              >
                <i className="ph ph-package" /> Manual Upload
              </button>
            </div>
          )}

          {tab === 'github' && !redeployAppId ? (
            <GithubTab />
          ) : (
            <ManualTab redeployAppId={redeployAppId} redeployDetail={redeployDetail} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <PipelinePreview />
        </div>
      </div>
    </>
  );
}

function DropdownRow({
  label,
  value,
  onClick,
  leadingIcon,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  leadingIcon?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <button
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[13px]"
      >
        <span className="flex items-center gap-1.5">
          {leadingIcon && <i className={`${leadingIcon} text-muted`} />}
          {value}
        </span>
        <i className="ph ph-caret-down text-[#B7B2A7]" />
      </button>
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function InputRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function GithubTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GithubStatus | null>(null);
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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advRepoUrl, setAdvRepoUrl] = useState('');
  const [advBranch, setAdvBranch] = useState('main');
  const [advRuntime, setAdvRuntime] = useState('node');
  const [advError, setAdvError] = useState('');
  const [advLoading, setAdvLoading] = useState(false);
  const [advResult, setAdvResult] = useState<GitAppRegistration | null>(null);

  useEffect(() => {
    api.github.status().then((s) => {
      setStatus(s);
      if (s.connected) loadRepos();
    }).catch((e) => setError(e.message));
  }, []);

  // ผลลัพธ์ OAuth connect flow ที่หน้า dashboard ส่งต่อมา (ดู (dashboard)/page.tsx) — แสดง
  // เหตุผลที่เชื่อมไม่สำเร็จแล้วล้าง query ออกจาก URL กัน error เด้งซ้ำตอน refresh
  useEffect(() => {
    const ghError = searchParams.get('github_error');
    if (!ghError) return;
    setError(
      ghError === 'no_token'
        ? 'OAuth สำเร็จแต่ไม่ได้รับ GitHub token กลับมา — มักเกิดจาก Redirect URL ใน Supabase Dashboard ไม่ครอบคลุมโดเมนนี้ (ต้องมี https://studiodup.com/** ใน allowlist) หรือลองเชื่อมด้วย Personal Access Token ด้านล่างแทน'
        : `เชื่อม GitHub ไม่สำเร็จ: ${ghError}`,
    );
    router.replace('/deploy', { scroll: false });
  }, [searchParams, router]);

  const loadRepos = async () => {
    setRepos(null);
    try {
      setRepos(await api.github.repos());
    } catch (e: any) {
      setError(e.message);
      setRepos([]);
    }
  };

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
      setStatus(s);
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
    setStatus({ connected: false });
    setRepos(null);
    setSelectedRepo(null);
  };

  const pickRepo = async (repo: GithubRepo) => {
    setSelectedRepo(repo);
    setBranch(repo.defaultBranch || 'main');
    setBranches(null);
    try {
      const [owner, name] = repo.fullName.split('/');
      setBranches(await api.github.branches(owner, name));
    } catch {
      setBranches([repo.defaultBranch || 'main']);
    }
  };

  const deploy = async () => {
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
      router.push(`/apps/${res.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdvanced = async () => {
    setAdvError('');
    const url = advRepoUrl.trim();
    if (!url) { setAdvError('กรุณากรอก Repository URL'); return; }
    if (!GITHUB_REPO_RE.test(url)) { setAdvError('รูปแบบต้องเป็น https://github.com/<owner>/<repo>'); return; }
    setAdvLoading(true);
    try {
      const res = await api.registerGitApp({ repoUrl: url, branch: advBranch.trim() || 'main', runtime: advRuntime });
      setAdvResult(res);
    } catch (e: any) {
      setAdvError(e.message);
    } finally {
      setAdvLoading(false);
    }
  };

  const filteredRepos = useMemo(() => {
    if (!repos) return null;
    const q = search.trim().toLowerCase();
    return q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
  }, [repos, search]);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {!status && <p className="text-[12.5px] text-muted">กำลังตรวจสอบการเชื่อมต่อ GitHub…</p>}

      {status && !status.connected && (
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-ink-soft">
            เชื่อมบัญชี GitHub ก่อน เพื่อเลือก repo จากรายการและให้ระบบตั้ง webhook ให้อัตโนมัติ
          </p>
          <button
            onClick={connectOAuth}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-page-alt"
          >
            <i className="ph-fill ph-github-logo" /> Connect with GitHub (OAuth)
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <div className="flex-1 border-b border-border" /> หรือใช้ Personal Access Token <div className="flex-1 border-b border-border" />
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="ghp_… (scope: repo)"
              className="flex-1 rounded-lg border border-border bg-page-alt px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={connectPat}
              disabled={connecting || !pat.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-40"
            >
              <i className="ph ph-key" /> {connecting ? '…' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {status?.connected && (
        <>
          <div className="mb-[18px] flex items-center gap-2.5 rounded-[9px] border border-[rgba(115,169,140,.35)] bg-[rgba(115,169,140,.06)] px-3 py-[11px]">
            <i className="ph-fill ph-github-logo text-[19px]" />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold">
                {status.username} <span className="font-normal text-allow-text">· connected</span>
              </div>
              <div className="text-[10.5px] text-muted">
                token เข้ารหัส AES-256-GCM · ใช้แค่ list repo / webhook / clone
              </div>
            </div>
            <button onClick={disconnect} className="rounded-md border border-border bg-surface px-[11px] py-1.5 text-[11.5px] text-muted">
              Disconnect
            </button>
          </div>

          {!selectedRepo && (
            <>
              <div className="relative mb-3">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหา repo…"
                  className="w-full rounded-lg border border-border bg-page-alt py-2 pl-8 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="max-h-64 divide-y divide-[#F0EDE6] overflow-y-auto rounded-lg border border-border">
                {!filteredRepos && <p className="p-3 text-[12.5px] text-muted">กำลังโหลดรายการ repo…</p>}
                {filteredRepos?.length === 0 && <p className="p-3 text-[12.5px] text-muted">ไม่พบ repo</p>}
                {filteredRepos?.map((r) => (
                  <button key={r.fullName} onClick={() => pickRepo(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-page-alt">
                    <i className={r.private ? 'ph-fill ph-lock-simple text-warn-text' : 'ph-fill ph-github-logo text-muted'} />
                    <span className="truncate text-[12.5px]">{r.fullName}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-muted-3">{r.defaultBranch}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedRepo && (
            <>
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-border bg-page-alt px-3 py-2">
                <i className={selectedRepo.private ? 'ph-fill ph-lock-simple text-warn-text' : 'ph-fill ph-github-logo text-muted'} />
                <span className="truncate text-[12.5px] font-semibold">{selectedRepo.fullName}</span>
                <button onClick={() => setSelectedRepo(null)} className="ml-auto text-[10.5px] text-muted hover:text-ink">
                  เปลี่ยน repo
                </button>
              </div>

              <div className="mb-3.5 grid grid-cols-2 gap-3.5">
                <SelectRow label="Branch" value={branch} onChange={setBranch} options={branches || [branch]} />
                <SelectRow label="Runtime" value={runtime} onChange={setRuntime} options={RUNTIMES} />
              </div>
              <div className="mb-4">
                <InputRow label="Project name (ไม่บังคับ)" value={projectName} onChange={setProjectName} placeholder={selectedRepo.name} />
              </div>

              <div className="mb-[18px] flex items-start gap-2.5 rounded-[9px] border border-[#EFEDE6] bg-page-alt px-3 py-3">
                <i className="ph ph-info mt-0.5 text-primary" />
                <div className="text-[11px] text-muted">
                  ระบบจะตั้ง webhook ให้อัตโนมัติ · ตรวจ HMAC signature ทุก event — push ครั้งถัดไปเข้า branch นี้จะ auto-deploy
                </div>
              </div>

              <button
                onClick={deploy}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {submitting ? 'กำลังตั้งค่า webhook…' : 'Deploy'} <i className="ph ph-arrow-right" />
              </button>
            </>
          )}

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-4 flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
          >
            <i className={`ph ${showAdvanced ? 'ph-caret-down' : 'ph-caret-right'}`} />
            Advanced: register by URL (repo ที่ไม่ผ่าน picker ด้านบน)
          </button>

          {showAdvanced && (
            <div className="mt-3 rounded-lg border border-border bg-page-alt p-4">
              {!advResult ? (
                <>
                  <div className="mb-3">
                    <InputRow label="Repository URL" value={advRepoUrl} onChange={setAdvRepoUrl} placeholder="https://github.com/owner/repo" />
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <InputRow label="Branch" value={advBranch} onChange={setAdvBranch} placeholder="main" />
                    <SelectRow label="Runtime" value={advRuntime} onChange={setAdvRuntime} options={RUNTIMES} />
                  </div>
                  {advError && (
                    <div className="mb-3 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[12px] text-danger-text">
                      {advError}
                    </div>
                  )}
                  <button
                    onClick={submitAdvanced}
                    disabled={advLoading}
                    className="w-full rounded-lg border border-primary bg-surface py-2 text-[12.5px] font-semibold text-primary disabled:opacity-50"
                  >
                    {advLoading ? 'กำลังลงทะเบียน…' : 'Register App'}
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-allow-text">
                    <i className="ph-fill ph-check-circle" /> <span className="text-[12.5px] font-semibold">ลงทะเบียนสำเร็จ</span>
                  </div>
                  <CopyField label="Webhook URL" value={advResult.webhookUrl} />
                  <CopyField label="Webhook Secret" value={advResult.webhookSecret} />
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-muted">
                    <div>ตั้งค่าใน GitHub: Settings → Webhooks → Add webhook</div>
                    <div>Content type: {advResult.contentType}</div>
                    <div>Events: {advResult.events.join(', ')}</div>
                  </div>
                  <div className="rounded-lg border border-warn-dot/40 bg-[rgba(224,185,118,.1)] px-3 py-2 text-[11px] text-warn-text">
                    เก็บ secret นี้ไว้ให้ดี ระบบจะไม่แสดงซ้ำอีกครั้ง
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </div>
      )}
    </div>
  );
}

function ManualTab({ redeployAppId, redeployDetail }: { redeployAppId?: string; redeployDetail: GitAppDetail | null }) {
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [runtime, setRuntime] = useState('node');
  const [pendingArchive, setPendingArchive] = useState<Blob | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeployOutcome | null>(null);

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

  const deploy = async () => {
    if (!pendingArchive) return;
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('archive', pendingArchive, 'archive.zip');
    if (redeployAppId) {
      formData.append('appId', redeployAppId);
    } else {
      formData.append('projectName', projectName.trim() || 'my-app');
      formData.append('runtime', runtime);
    }
    try {
      const r = await api.deployManual(formData);
      // ALLOW ไม่มี findings ให้ดู → พาไปหน้า pipeline เลย; QUARANTINE/BLOCK (id อาจมีอยู่ก็ได้)
      // โชว์ผลตรงนี้ก่อนให้ผู้ใช้เห็น findings ไม่งั้น navigate ไปแล้วข้อมูลนี้จะหายไปเฉยๆ
      if (r.id && r.decision === 'ALLOW') {
        router.push(`/apps/${r.id}`);
      } else {
        setResult(r);
      }
    } catch (e: any) {
      setResult({ decision: 'BLOCK', requestId: '', reason: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {redeployAppId && (
        <div className="mb-3.5 text-[12.5px] font-semibold">
          Redeploy: {redeployDetail?.projectName || redeployAppId}
        </div>
      )}

      {!redeployAppId && (
        <div className="mb-4 grid grid-cols-2 gap-3.5">
          <InputRow label="Project name" value={projectName} onChange={setProjectName} placeholder="my-awesome-app" />
          <SelectRow label="Runtime" value={runtime} onChange={setRuntime} options={RUNTIMES} />
        </div>
      )}

      <div className="mb-3.5">
        <div className="mb-1.5 text-xs font-semibold">Source</div>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center ${
              pendingArchive ? 'border-allow-dot/50 bg-[rgba(115,169,140,.05)]' : 'border-border bg-page-alt'
            }`}
          >
            <i className={`ph ph-cloud-arrow-up text-3xl ${pendingArchive ? 'text-allow-text' : 'text-primary'}`} />
            <div className="text-[13px] font-semibold">ลากไฟล์ .zip มาวางที่นี่</div>
            <div className="text-[11px] text-muted">หรือคลิกเพื่อเลือกไฟล์ · สูงสุด 50 MB</div>
            <input type="file" accept=".zip" className="hidden" onChange={handleZipPick} />
          </label>
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center ${
              pendingArchive ? 'border-allow-dot/50 bg-[rgba(115,169,140,.05)]' : 'border-border bg-page-alt'
            }`}
          >
            <i className={`ph ph-folder-simple-plus text-3xl ${pendingArchive ? 'text-allow-text' : 'text-primary'}`} />
            <div className="text-[13px] font-semibold">เลือกโฟลเดอร์</div>
            <div className="text-[11px] text-muted">บีบอัดเป็น .zip ให้อัตโนมัติ</div>
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
        </div>
        {pendingLabel && <p className="mt-2 truncate text-[11px] text-muted">{pendingLabel}</p>}
      </div>

      <button
        onClick={deploy}
        disabled={loading || !pendingArchive}
        className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? 'กำลัง deploy…' : redeployAppId ? 'Redeploy' : 'Deploy'} <i className="ph ph-arrow-right" />
      </button>

      {result && (
        <div
          className={`mt-3.5 flex flex-col gap-2 rounded-lg border p-3 ${
            result.decision === 'QUARANTINE'
              ? 'border-warn-dot/40 bg-[rgba(224,185,118,.08)]'
              : 'border-danger-text/30 bg-[rgba(214,109,82,.06)]'
          }`}
        >
          <p className={`text-[12.5px] font-bold ${result.decision === 'QUARANTINE' ? 'text-warn-text' : 'text-danger-text'}`}>
            {result.decision}
          </p>
          {(result.reason || result.message) && <p className="text-[12px] text-ink-soft">{result.reason || result.message}</p>}
          {result.findings && result.findings.length > 0 && <FindingsList findings={result.findings} />}
          {result.id && (
            <Link href={`/apps/${result.id}`} className="mt-1 text-[12px] font-medium text-primary">
              ดู pipeline →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function PipelinePreview() {
  const steps = [
    { n: 1, title: 'Clone source', caption: 'ดึงโค้ดจาก branch ที่เลือก' },
    { n: 2, title: 'Code scan', caption: 'pattern rules + dependency audit' },
    { n: 3, title: 'Docker build & run', caption: 'สร้าง container gatekeeper-app-<id>' },
  ];
  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3.5 text-[10.5px] font-bold tracking-[.8px] text-muted-3">สิ่งที่จะเกิดขึ้น</div>
        <div className="flex flex-col">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#EFF4FB] text-[11px] font-bold text-primary">
                  {s.n}
                </div>
                <div className="w-0.5 flex-1 bg-[#EFEDE6]" />
              </div>
              <div className="pb-3.5">
                <div className="text-[12.5px] font-semibold">{s.title}</div>
                <div className="text-[11px] text-muted">{s.caption}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[rgba(115,169,140,.14)] text-allow-text">
              <i className="ph-fill ph-check text-xs" />
            </div>
            <div>
              <div className="text-[12.5px] font-semibold">Live URL</div>
              <div className="font-mono text-[11px] text-muted">/live/&lt;appId&gt;/*</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-start gap-2.5 rounded-[10px] border border-[rgba(74,144,226,.2)] bg-[rgba(74,144,226,.05)] px-[15px] py-[13px]">
        <i className="ph ph-info mt-px text-base text-primary" />
        <div className="text-[11.5px] leading-relaxed text-ink-soft">
          ถ้า risk engine ตัดสิน QUARANTINE คุณจะได้ review findings ก่อน — deploy จะไม่ขึ้น live จนกว่าจะ override
        </div>
      </div>
    </>
  );
}
