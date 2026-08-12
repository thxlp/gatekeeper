'use client';

import { Suspense, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TopBar from '@/components/shell/TopBar';
import CopyField from '@/components/ui/CopyField';
import FindingsList from '@/components/ui/FindingsList';
import { Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { filesToZipEntries, isZipBlob, readDropped, zipEntriesToBlob } from '@/lib/zip';
import { DeployOutcome, GitAppDetail, GitAppRegistration, GithubRepo, GithubStatus } from '@/types';
import { useLang } from '@/lib/i18n';
import { RUNTIMES } from '@/lib/runtimes';

// node/static/python รองรับผ่าน generated Dockerfile, docker = ใช้ Dockerfile ของ repo เอง
// (backend/src/deploy/docker-runtime.service.ts) — port เว้นว่างได้ ระบบเดาจาก EXPOSE/runtime
const GITHUB_REPO_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;

// ต้องตรงกับ MAX_ARCHIVE_UPLOAD_BYTES ใน backend/src/apps/apps.controller.ts —
// เช็คฝั่ง client ก่อน ไม่งั้นผู้ใช้รออัปโหลดจนจบแล้วค่อยโดน 413 ตอบกลับมาเปล่าๆ
const MAX_ARCHIVE_MB = 50;

export default function DeployPage() {
  return (
    <Suspense fallback={null}>
      <DeployPageInner />
    </Suspense>
  );
}

function DeployPageInner() {
  const { t } = useLang();
  const pageToast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redeployAppId = searchParams.get('appId') || undefined;
  // แท็บอ่านจาก URL ล้วน ไม่เก็บเป็น state — ปุ่ม "อัปโหลดไฟล์เอง" บนหน้าโปรเจกต์ชี้มาที่
  // ?tab=manual จะได้ลงแท็บที่ตรงกับชื่อปุ่มจริงๆ (เดิมตกที่แท็บ GitHub ทุกทาง) และการที่ URL
  // เป็นแหล่งความจริงอันเดียวทำให้ refresh / กดย้อนกลับ / แชร์ลิงก์ ได้แท็บตรงกับที่เห็นเสมอ
  const tab: 'github' | 'manual' =
    redeployAppId || searchParams.get('tab') === 'manual' ? 'manual' : 'github';

  // สลับแท็บเองก็เขียนกลับ URL — คง query อื่นไว้ (?appId= redeploy, ?github=connect ตอนกลับ
  // จาก OAuth) ไม่ให้หายไปกับการสลับแท็บ
  const setTab = (next: 'github' | 'manual') => {
    const q = new URLSearchParams(searchParams.toString());
    if (next === 'manual') q.set('tab', 'manual');
    else q.delete('tab');
    const qs = q.toString();
    router.replace(qs ? `/deploy?${qs}` : '/deploy', { scroll: false });
  };

  const [redeployDetail, setRedeployDetail] = useState<GitAppDetail | null>(null);

  useEffect(() => {
    // พังแล้วต้องบอก — เดิมกลืนเงียบ ผู้ใช้เห็นหน้า redeploy ที่ไม่รู้ว่ากำลัง redeploy แอปไหน
    if (redeployAppId) {
      api.getApp(redeployAppId).then(setRedeployDetail).catch((e: any) => pageToast.error(e.message));
    }
  }, [redeployAppId, pageToast]);

  return (
    <>
      <TopBar variant="title" title={t('deploy.title')} backHref="/" />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-6 lg:flex-row">
        <div className="w-full flex-none lg:w-[640px]">
          {!redeployAppId && (
            <div className="mb-[18px] flex w-fit gap-1 rounded-[9px] bg-page-alt p-1">
              <button
                onClick={() => setTab('github')}
                className={`flex items-center gap-1.5 rounded-[7px] px-4 py-[7px] text-[14.5px] ${
                  tab === 'github' ? 'bg-surface font-semibold shadow-card-soft' : 'font-medium text-muted'
                }`}
              >
                <i className="ph-fill ph-github-logo" /> {t('deploy.tabGithub')}
              </button>
              <button
                onClick={() => setTab('manual')}
                className={`flex items-center gap-1.5 rounded-[7px] px-4 py-[7px] text-[14.5px] ${
                  tab === 'manual' ? 'bg-surface font-semibold shadow-card-soft' : 'font-medium text-muted'
                }`}
              >
                <i className="ph ph-package" /> {t('deploy.tabManual')}
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

// SelectRow/InputRow เป็นทางเดียวที่ฟอร์มหน้านี้สร้างช่องกรอก — ผูก label เข้ากับ control
// ด้วย htmlFor/id ที่นี่ที่เดียวก็ครอบคลุมทุกช่องในหน้า (useId กัน id ชนกันเองตอน render หลายตัว
// และตรงกันทั้ง server/client ไม่มี hydration mismatch)
function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function InputRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-page-alt px-3 py-[9px] text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

// ── App config (env vars / addons / resources / SPA) ที่ใช้ร่วมทั้ง GitHub และ manual deploy ──
type AppConfigState = {
  envVars: { key: string; value: string }[];
  addons: string[];
  memoryMb: string;
  cpuMilli: string;
  spa: boolean;
};
const EMPTY_CONFIG: AppConfigState = { envVars: [], addons: [], memoryMb: '', cpuMilli: '', spa: false };

// แปลง state → request body (ตัดค่าว่างทิ้ง ให้ backend ใช้ default)
function configToBody(c: AppConfigState) {
  const envVars = c.envVars.filter((e) => e.key.trim());
  return {
    envVars: envVars.length ? envVars.map((e) => ({ key: e.key.trim(), value: e.value })) : undefined,
    addons: c.addons.length ? c.addons : undefined,
    memoryMb: c.memoryMb.trim() ? Number(c.memoryMb) : undefined,
    cpuMilli: c.cpuMilli.trim() ? Number(c.cpuMilli) : undefined,
    spa: c.spa || undefined,
  };
}

function AppConfigFields({ config, setConfig, runtime }: { config: AppConfigState; setConfig: (c: AppConfigState) => void; runtime: string }) {
  const { t } = useLang();
  const setEnv = (i: number, field: 'key' | 'value', val: string) =>
    setConfig({ ...config, envVars: config.envVars.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)) });
  const addEnv = () => setConfig({ ...config, envVars: [...config.envVars, { key: '', value: '' }] });
  const removeEnv = (i: number) => setConfig({ ...config, envVars: config.envVars.filter((_, idx) => idx !== i) });
  const toggleAddon = (a: string) =>
    setConfig({ ...config, addons: config.addons.includes(a) ? config.addons.filter((x) => x !== a) : [...config.addons, a] });

  return (
    <div className="mb-4 rounded-lg border border-border bg-page-alt p-3.5">
      {/* Env vars */}
      <div className="mb-1.5 text-xs font-semibold">{t('deploy.envVars')}</div>
      {config.envVars.map((e, i) => (
        <div key={i} className="mb-2 flex items-center gap-2">
          {/* แถวตัวแปรไม่มี label ที่มองเห็น (หัวตารางอยู่บนสุดครั้งเดียว) — บอก screen reader
              ด้วย aria-label ที่มีลำดับแถวกำกับ ไม่งั้นได้ยินแค่ "edit text" ซ้ำกันทุกช่อง */}
          <input
            value={e.key}
            onChange={(ev) => setEnv(i, 'key', ev.target.value)}
            placeholder="KEY"
            aria-label={t('deploy.envKeyLabel', { n: i + 1 })}
            className="w-2/5 rounded-lg border border-border bg-surface px-2.5 py-2 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={e.value}
            onChange={(ev) => setEnv(i, 'value', ev.target.value)}
            placeholder="value"
            aria-label={t('deploy.envValueLabel', { n: i + 1 })}
            className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button onClick={() => removeEnv(i)} className="px-1.5 text-muted hover:text-ink" title={t('common.delete')}>
            <i className="ph ph-x" />
          </button>
        </div>
      ))}
      <button onClick={addEnv} className="mb-3 flex items-center gap-1 text-[13.5px] font-medium text-primary hover:underline">
        <i className="ph ph-plus" /> {t('deploy.addEnvVar')}
      </button>

      {/* Addons */}
      <div className="mb-1.5 text-xs font-semibold">{t('deploy.managedServices')}</div>
      <div className="mb-3 flex gap-4">
        {[
          { id: 'postgres', label: 'PostgreSQL → DATABASE_URL' },
          { id: 'redis', label: 'Redis → REDIS_URL' },
        ].map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-1.5 text-[14px]">
            <input type="checkbox" checked={config.addons.includes(a.id)} onChange={() => toggleAddon(a.id)} />
            {a.label}
          </label>
        ))}
      </div>

      {/* Resources */}
      <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputRow label={t('deploy.memoryMb')} value={config.memoryMb} onChange={(v) => setConfig({ ...config, memoryMb: v })} placeholder="256" />
        <InputRow label={t('deploy.cpuMilli')} value={config.cpuMilli} onChange={(v) => setConfig({ ...config, cpuMilli: v })} placeholder="500 = 0.5 vCPU" />
      </div>

      {/* SPA (เฉพาะ static) */}
      {runtime === 'static' && (
        <label className="flex cursor-pointer items-center gap-1.5 text-[14px]">
          <input type="checkbox" checked={config.spa} onChange={(e) => setConfig({ ...config, spa: e.target.checked })} />
          {t('deploy.spaHint')}
        </label>
      )}
    </div>
  );
}

function GithubTab() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
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
  const [port, setPort] = useState('');
  const [projectName, setProjectName] = useState('');
  const [config, setConfig] = useState<AppConfigState>(EMPTY_CONFIG);
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

  // กลับจาก GitHub OAuth (เด้งกลับหน้านี้ตรงๆ ไม่ผ่านหน้าหลัก): จับ provider_token จาก
  // Supabase session ส่งให้ backend เก็บ แล้วล้าง query ออกจาก URL กันทำงานซ้ำตอน refresh
  // ถ้าไม่สำเร็จแสดงเหตุผลใน banner แทนการกลืนเงียบ
  useEffect(() => {
    if (searchParams.get('github') !== 'connect') return;
    (async () => {
      setConnecting(true);
      try {
        const { data } = await supabase.auth.getSession();
        const providerToken = (data.session as any)?.provider_token as string | undefined;
        if (!providerToken) {
          // Supabase ให้ provider_token มาเฉพาะ session สดๆ หลัง OAuth เท่านั้น — ถ้าไม่มีแปลว่า
          // redirect ไม่ได้มาจาก OAuth ตรงๆ (เช่น Supabase เด้งกลับ Site URL เพราะ redirectTo
          // ไม่อยู่ใน allowlist) หรือ session ถูก refresh ไปก่อนแล้ว
          setError(t('deploy.oauthNoToken'));
          return;
        }
        const s = await api.github.connect(providerToken);
        setStatus(s);
        toast.success(t('toast.githubConnected'));
        loadRepos();
      } catch (e: any) {
        setError(t('deploy.connectFailed', { reason: e?.message || 'connect_failed' }));
      } finally {
        setConnecting(false);
        router.replace('/deploy', { scroll: false });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      options: { redirectTo: `${window.location.origin}/deploy?github=connect`, scopes: 'repo' },
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
      toast.success(t('toast.githubConnected'));
      loadRepos();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: t('confirm.disconnectGithubTitle'),
      body: t('confirm.disconnectGithubBody'),
      confirmLabel: t('deploy.disconnect'),
      danger: true,
    });
    if (!ok) return;
    await api.github.disconnect().catch(() => undefined);
    setStatus({ connected: false });
    setRepos(null);
    setSelectedRepo(null);
    toast.success(t('toast.githubDisconnected'));
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
        port: port.trim() ? Number(port) : undefined,
        projectName: projectName.trim() || undefined,
        ...configToBody(config),
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
    if (!url) { setAdvError(t('deploy.errRepoUrlRequired')); return; }
    if (!GITHUB_REPO_RE.test(url)) { setAdvError(t('deploy.errRepoUrlFormat')); return; }
    setAdvLoading(true);
    try {
      const res = await api.registerGitApp({ repoUrl: url, branch: advBranch.trim() || 'main', runtime: advRuntime });
      setAdvResult(res);
      toast.success(t('toast.appRegistered'));
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
      {!status && <p className="text-[14.5px] text-muted">{t('deploy.checkingGithub')}</p>}

      {status && !status.connected && (
        <div className="flex flex-col gap-4">
          <p className="text-[14.5px] text-ink-soft">{t('deploy.connectIntro')}</p>
          <button
            onClick={connectOAuth}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface py-2.5 text-sm font-medium hover:bg-page-alt"
          >
            <i className="ph-fill ph-github-logo" /> {t('deploy.connectOAuth')}
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <div className="flex-1 border-b border-border" /> {t('deploy.orUsePat')} <div className="flex-1 border-b border-border" />
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="ghp_… (scope: repo)"
              aria-label={t('deploy.patLabel')}
              className="flex-1 rounded-lg border border-border bg-page-alt px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={connectPat}
              disabled={connecting || !pat.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-40"
            >
              <i className="ph ph-key" /> {connecting ? '…' : t('deploy.connect')}
            </button>
          </div>
        </div>
      )}

      {status?.connected && (
        <>
          <div className="mb-[18px] flex items-center gap-2.5 rounded-[9px] border border-[rgba(115,169,140,.35)] bg-[rgba(115,169,140,.06)] px-3 py-[11px]">
            <i className="ph-fill ph-github-logo text-[19px]" />
            <div className="flex-1">
              <div className="text-[14.5px] font-semibold">
                {status.username} <span className="font-normal text-allow-text">{t('deploy.connectedSuffix')}</span>
              </div>
              <div className="text-[12.5px] text-muted">{t('deploy.tokenNote')}</div>
            </div>
            <button onClick={disconnect} className="rounded-md border border-border bg-surface px-[11px] py-1.5 text-[13.5px] text-muted">
              {t('deploy.disconnect')}
            </button>
          </div>

          {!selectedRepo && (
            <>
              <div className="relative mb-3">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('deploy.searchRepo')}
                  aria-label={t('deploy.searchRepo')}
                  className="w-full rounded-lg border border-border bg-page-alt py-2 pl-8 pr-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {!filteredRepos &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-[9px]">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-3.5 w-44" />
                      <Skeleton className="ml-auto h-3 w-12" />
                    </div>
                  ))}
                {filteredRepos?.length === 0 && <p className="p-3 text-[14.5px] text-muted">{t('deploy.noRepo')}</p>}
                {filteredRepos?.map((r) => (
                  <button key={r.fullName} onClick={() => pickRepo(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-page-alt">
                    <i className={r.private ? 'ph-fill ph-lock-simple text-warn-text' : 'ph-fill ph-github-logo text-muted'} />
                    <span className="truncate text-[14.5px]">{r.fullName}</span>
                    <span className="ml-auto shrink-0 text-[12.5px] text-muted-3">{r.defaultBranch}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedRepo && (
            <>
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-border bg-page-alt px-3 py-2">
                <i className={selectedRepo.private ? 'ph-fill ph-lock-simple text-warn-text' : 'ph-fill ph-github-logo text-muted'} />
                <span className="truncate text-[14.5px] font-semibold">{selectedRepo.fullName}</span>
                <button onClick={() => setSelectedRepo(null)} className="ml-auto text-[12.5px] text-muted hover:text-ink">
                  {t('deploy.changeRepo')}
                </button>
              </div>

              <div className="mb-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <SelectRow label={t('deploy.branch')} value={branch} onChange={setBranch} options={branches || [branch]} />
                <SelectRow label={t('deploy.runtime')} value={runtime} onChange={setRuntime} options={RUNTIMES} />
              </div>
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <InputRow
                  label={t('deploy.projectNameOptional', { optional: t('common.optional') })}
                  value={projectName}
                  onChange={setProjectName}
                  placeholder={selectedRepo.name}
                />
                <InputRow
                  label={t('deploy.portOptional', { optional: t('common.optional') })}
                  value={port}
                  onChange={setPort}
                  placeholder={runtime === 'docker' ? t('deploy.portFromExpose') : t('deploy.portAuto')}
                />
              </div>

              <AppConfigFields config={config} setConfig={setConfig} runtime={runtime} />

              <div className="mb-[18px] flex items-start gap-2.5 rounded-[9px] border border-border bg-page-alt px-3 py-3">
                <i className="ph ph-info mt-0.5 text-primary" />
                <div className="text-[13px] text-muted">{t('deploy.webhookAutoNote')}</div>
              </div>

              <button
                onClick={deploy}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {submitting ? t('deploy.settingWebhook') : t('deploy.submit')} <i className="ph ph-arrow-right" />
              </button>
            </>
          )}

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-4 flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink"
          >
            <i className={`ph ${showAdvanced ? 'ph-caret-down' : 'ph-caret-right'}`} />
            {t('deploy.advancedToggle')}
          </button>

          {showAdvanced && (
            <div className="mt-3 rounded-lg border border-border bg-page-alt p-4">
              {!advResult ? (
                <>
                  <div className="mb-3">
                    <InputRow label={t('deploy.repoUrl')} value={advRepoUrl} onChange={setAdvRepoUrl} placeholder="https://github.com/owner/repo" />
                  </div>
                  <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InputRow label={t('deploy.branch')} value={advBranch} onChange={setAdvBranch} placeholder="main" />
                    <SelectRow label={t('deploy.runtime')} value={advRuntime} onChange={setAdvRuntime} options={RUNTIMES} />
                  </div>
                  {advError && (
                    <div className="mb-3 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14px] text-danger-text">
                      {advError}
                    </div>
                  )}
                  <button
                    onClick={submitAdvanced}
                    disabled={advLoading}
                    className="w-full rounded-lg border border-primary bg-surface py-2 text-[14.5px] font-semibold text-primary disabled:opacity-50"
                  >
                    {advLoading ? t('deploy.registering') : t('deploy.registerApp')}
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-allow-text">
                    <i className="ph-fill ph-check-circle" /> <span className="text-[14.5px] font-semibold">{t('deploy.registerSuccess')}</span>
                  </div>
                  <CopyField label="Webhook URL" value={advResult.webhookUrl} />
                  <CopyField label={t('deploy.webhookSecretLabel')} value={advResult.webhookSecret} />
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-muted">
                    <div>{t('deploy.setupInGithub')}</div>
                    <div>Content type: {advResult.contentType}</div>
                    <div>Events: {advResult.events.join(', ')}</div>
                  </div>
                  <div className="rounded-lg border border-warn-dot/40 bg-[rgba(224,185,118,.1)] px-3 py-2 text-[13px] text-warn-text">
                    {t('deploy.keepSecret')}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger-text/30 bg-[rgba(214,109,82,.08)] px-3 py-2 text-[14.5px] text-danger-text">
          {error}
        </div>
      )}
    </div>
  );
}

function ManualTab({ redeployAppId, redeployDetail }: { redeployAppId?: string; redeployDetail: GitAppDetail | null }) {
  const { t } = useLang();
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [runtime, setRuntime] = useState('node');
  const [port, setPort] = useState('');
  const [config, setConfig] = useState<AppConfigState>(EMPTY_CONFIG);
  const [pendingArchive, setPendingArchive] = useState<Blob | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeployOutcome | null>(null);

  const handleFolderPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      const entries = await filesToZipEntries(fileList);
      const blob = await zipEntriesToBlob(entries);
      setPendingArchive(blob);
      setPendingLabel(t('deploy.filesFromFolder', { count: Object.keys(entries).length }));
    } catch (err: any) {
      setResult({ decision: 'BLOCK', requestId: '', reason: t('deploy.errZipFolder', { reason: err?.message || err }) });
    }
  };

  const handleZipPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingArchive(f);
    setPendingLabel(f.name);
  };

  // ลากมาวางได้ทั้ง .zip และโฟลเดอร์ (ทั้งสองกล่องรับ drop เหมือนกัน — forgiving)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (!e.dataTransfer) return;
    try {
      const { zipFile, entries } = await readDropped(e.dataTransfer);
      if (zipFile) {
        setPendingArchive(zipFile);
        setPendingLabel(zipFile.name);
        return;
      }
      const count = Object.keys(entries).length;
      if (count === 0) {
        setResult({ decision: 'BLOCK', requestId: '', reason: t('deploy.errNothingDropped') });
        return;
      }
      const blob = await zipEntriesToBlob(entries);
      setPendingArchive(blob);
      setPendingLabel(t('deploy.filesFromDrop', { count }));
    } catch (err: any) {
      setResult({ decision: 'BLOCK', requestId: '', reason: t('deploy.errZipDrop', { reason: err?.message || err }) });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  // ไฟล์ใหญ่เกิน = บอกทันทีตั้งแต่เลือก ไม่ต้องรออัปโหลด
  const tooLargeReason = (f: Blob) =>
    f.size > MAX_ARCHIVE_MB * 1024 * 1024
      ? t('deploy.errTooLarge', { size: (f.size / 1024 / 1024).toFixed(1), max: MAX_ARCHIVE_MB })
      : '';

  const deploy = async () => {
    if (!pendingArchive) return;
    const tooLarge = tooLargeReason(pendingArchive);
    if (tooLarge) {
      setResult({ decision: 'BLOCK', requestId: '', reason: tooLarge });
      return;
    }
    // กันอัปโหลดของเพี้ยน: เช็ค magic bytes ฝั่ง client ก่อน จะได้ข้อความที่บอกวิธีแก้
    // แทน invalid_zip_file จาก pipeline (เจอได้เช่นไฟล์ .zip ปลอม หรือบีบอัดฝั่ง browser เพี้ยน)
    if (!(await isZipBlob(pendingArchive))) {
      setResult({
        decision: 'BLOCK',
        requestId: '',
        reason: t('deploy.errNotZip', { bytes: pendingArchive.size }),
      });
      return;
    }
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('archive', pendingArchive, 'archive.zip');
    if (redeployAppId) {
      formData.append('appId', redeployAppId);
    } else {
      formData.append('projectName', projectName.trim() || 'my-app');
      formData.append('runtime', runtime);
      if (port.trim()) formData.append('port', String(Number(port)));
      const cfg = configToBody(config);
      if (cfg.envVars || cfg.addons || cfg.memoryMb || cfg.cpuMilli || cfg.spa) {
        formData.append('config', JSON.stringify(cfg));
      }
    }
    try {
      const r = await api.deployManual(formData);
      // backend ตอบ id ทันทีแล้ว pipeline วิ่ง background — พาไปหน้า /apps/<id> ดู stage
      // วิ่งสดๆ เหมือน flow ฝั่ง git repo (ผลสุดท้าย/เหตุผล fail ดูจากหน้านั้น + Audit Log)
      if (r.id) {
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
        <div className="mb-3.5 text-[14.5px] font-semibold">
          {t('deploy.redeployHeading', { name: redeployDetail?.projectName || redeployAppId || '' })}
        </div>
      )}

      {!redeployAppId && (
        <>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <InputRow label={t('deploy.projectName')} value={projectName} onChange={setProjectName} placeholder="my-awesome-app" />
            <SelectRow label={t('deploy.runtime')} value={runtime} onChange={setRuntime} options={RUNTIMES} />
          </div>
          <div className="mb-4">
            <InputRow
              label={t('deploy.portOptional', { optional: t('common.optional') })}
              value={port}
              onChange={setPort}
              placeholder={runtime === 'docker' ? t('deploy.portFromExposeLong') : t('deploy.portAutoLong')}
            />
          </div>
          <AppConfigFields config={config} setConfig={setConfig} runtime={runtime} />
        </>
      )}

      <div className="mb-3.5">
        <div className="mb-1.5 text-xs font-semibold">{t('deploy.source')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center ${
              dragActive
                ? 'border-primary bg-[rgba(91,157,255,.08)]'
                : pendingArchive
                  ? 'border-allow-dot/50 bg-[rgba(115,169,140,.05)]'
                  : 'border-border bg-page-alt'
            }`}
          >
            <i className={`ph ph-cloud-arrow-up text-3xl ${pendingArchive ? 'text-allow-text' : 'text-primary'}`} />
            <div className="text-[15px] font-semibold">{t('deploy.dropZip')}</div>
            <div className="text-[13px] text-muted">{t('deploy.dropZipHint')}</div>
            <input type="file" accept=".zip" className="hidden" onChange={handleZipPick} />
          </label>
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center ${
              dragActive
                ? 'border-primary bg-[rgba(91,157,255,.08)]'
                : pendingArchive
                  ? 'border-allow-dot/50 bg-[rgba(115,169,140,.05)]'
                  : 'border-border bg-page-alt'
            }`}
          >
            <i className={`ph ph-folder-simple-plus text-3xl ${pendingArchive ? 'text-allow-text' : 'text-primary'}`} />
            <div className="text-[15px] font-semibold">{t('deploy.pickFolder')}</div>
            <div className="text-[13px] text-muted">{t('deploy.pickFolderHint')}</div>
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
        {pendingLabel && <p className="mt-2 truncate text-[13px] text-muted">{pendingLabel}</p>}
      </div>

      <button
        onClick={deploy}
        disabled={loading || !pendingArchive}
        className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? t('deploy.deploying') : redeployAppId ? t('deploy.redeploy') : t('deploy.submit')}{' '}
        <i className="ph ph-arrow-right" />
      </button>

      {result && (
        <div
          className={`mt-3.5 flex flex-col gap-2 rounded-lg border p-3 ${
            result.decision === 'QUARANTINE'
              ? 'border-warn-dot/40 bg-[rgba(224,185,118,.08)]'
              : 'border-danger-text/30 bg-[rgba(214,109,82,.06)]'
          }`}
        >
          <p className={`text-[14.5px] font-bold ${result.decision === 'QUARANTINE' ? 'text-warn-text' : 'text-danger-text'}`}>
            {result.decision}
          </p>
          {(result.reason || result.message) && <p className="text-[14px] text-ink-soft">{result.reason || result.message}</p>}
          {result.findings && result.findings.length > 0 && <FindingsList findings={result.findings} />}
          {result.id && (
            <Link href={`/apps/${result.id}`} className="mt-1 text-[14px] font-medium text-primary">
              {t('deploy.viewPipeline')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function PipelinePreview() {
  const { t } = useLang();
  const steps = [
    { n: 1, title: t('deploy.step1'), caption: t('deploy.step1Caption') },
    { n: 2, title: t('deploy.step2'), caption: t('deploy.step2Caption') },
    { n: 3, title: t('deploy.step3'), caption: t('deploy.step3Caption') },
  ];
  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3.5 text-[12.5px] font-bold tracking-[.8px] text-muted-3">{t('deploy.previewTitle')}</div>
        <div className="flex flex-col">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#EFF4FB] text-[13px] font-bold text-primary dark:bg-[rgba(74,144,226,.18)]">
                  {s.n}
                </div>
                <div className="w-0.5 flex-1 bg-border" />
              </div>
              <div className="pb-3.5">
                <div className="text-[14.5px] font-semibold">{s.title}</div>
                <div className="text-[13px] text-muted">{s.caption}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[rgba(115,169,140,.14)] text-allow-text">
              <i className="ph-fill ph-check text-xs" />
            </div>
            <div>
              <div className="text-[14.5px] font-semibold">{t('deploy.stepLive')}</div>
              <div className="font-mono text-[13px] text-muted">/live/&lt;appId&gt;/*</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-start gap-2.5 rounded-[10px] border border-[rgba(74,144,226,.2)] bg-[rgba(74,144,226,.05)] px-[15px] py-[13px]">
        <i className="ph ph-info mt-px text-base text-primary" />
        <div className="text-[13.5px] leading-relaxed text-ink-soft">{t('deploy.quarantineNote')}</div>
      </div>
    </>
  );
}
