import { GitApp, PipelineStage } from '../common/types';
import { initialPipelineStages } from '../common/pipeline.util';

const PAGE_STYLES = `
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    padding: 24px;
    box-sizing: border-box;
  }
  .card {
    width: 100%;
    max-width: 480px;
    text-align: center;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 16px;
    padding: 40px 48px;
    box-shadow: 0 0 40px rgba(88,166,255,0.12);
  }
  .icon { font-size: 40px; margin-bottom: 12px; }
  h1 {
    font-size: 16px;
    font-weight: 600;
    color: #3fb950;
    margin: 0 0 8px;
  }
  p { font-size: 12px; color: #8b949e; margin: 4px 0; }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3fb950;
    margin-right: 6px;
    box-shadow: 0 0 8px #3fb950;
  }
`;

export function renderGreetingPage(): string {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Gatekeeper Webhook Service</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐🚀</div>
    <h1>Gatekeeper Webhook Service is running smoothly! 🚀</h1>
    <p><span class="dot"></span>listening for POST /api/v2/webhooks/github</p>
    <p>สำหรับ GitHub ยิง event เข้ามาเท่านั้น — endpoint นี้ไม่มีหน้าให้ใช้งานเอง</p>
  </div>
</body>
</html>`;
}

export function renderNotFoundPage(): string {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Gatekeeper — App not found</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔍</div>
    <h1 style="color:#f85149;">ไม่พบ app นี้ในระบบ</h1>
    <p>ลิงก์นี้อาจถูกลบไปแล้ว หรือ id ไม่ถูกต้อง</p>
  </div>
</body>
</html>`;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  idle:       { label: 'IDLE — ยังไม่เคย deploy', color: '#8b949e' },
  deploying:  { label: 'DEPLOYING',                color: '#58a6ff' },
  success:    { label: 'SUCCESS',                  color: '#3fb950' },
  failed:     { label: 'FAILED',                   color: '#f85149' },
};

const STAGE_STATUS_META: Record<PipelineStage['status'], { icon: string; color: string; label: string }> = {
  pending: { icon: '○', color: '#30363d', label: 'pending' },
  running: { icon: '◐', color: '#58a6ff', label: 'running…' },
  success: { icon: '✓', color: '#3fb950', label: 'success' },
  failed:  { icon: '✕', color: '#f85149', label: 'failed' },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderDashboardPage(app: GitApp): string {
  const status = app.pipelineStatus || 'idle';
  const meta = STATUS_META[status] || STATUS_META.idle;
  const stages = app.pipelineStages?.length ? app.pipelineStages : initialPipelineStages();
  const canVisit = status === 'success' && !!app.liveUrl;

  const stepsHtml = stages
    .map((s) => {
      const sm = STAGE_STATUS_META[s.status] || STAGE_STATUS_META.pending;
      const at = s.at ? new Date(s.at).toLocaleString('th-TH') : '';
      return `
      <div class="step">
        <span class="step-icon" style="color:${sm.color};border-color:${sm.color};">${sm.icon}</span>
        <div class="step-body">
          <div class="step-label">${escapeHtml(s.label)}</div>
          <div class="step-status" style="color:${sm.color};">${sm.label}${at ? ` · ${at}` : ''}</div>
        </div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>${escapeHtml(app.repoFullName)} — Gatekeeper Deployment</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .panel {
    width: 100%;
    max-width: 520px;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(88,166,255,0.10);
    overflow: hidden;
  }
  .header {
    padding: 20px 24px;
    border-bottom: 1px solid #21262d;
  }
  .repo-name {
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .branch { font-size: 11px; color: #8b949e; margin-top: 4px; }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    border: 1px solid currentColor;
  }
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }
  .visit-wrap { padding: 20px 24px; border-bottom: 1px solid #21262d; }
  .visit-btn {
    display: block;
    width: 100%;
    box-sizing: border-box;
    text-align: center;
    padding: 14px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
    transition: opacity 0.15s;
  }
  .visit-btn.enabled {
    background: #3fb950;
    color: #0d1117;
  }
  .visit-btn.enabled:hover { opacity: 0.85; }
  .visit-btn.disabled {
    background: #21262d;
    color: #8b949e;
    cursor: not-allowed;
    pointer-events: none;
  }
  .visit-hint {
    text-align: center;
    font-size: 10px;
    color: #8b949e;
    margin-top: 8px;
  }
  .steps { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .steps-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8b949e;
    margin-bottom: 4px;
  }
  .step { display: flex; align-items: flex-start; gap: 12px; }
  .step-icon {
    flex-shrink: 0;
    width: 24px; height: 24px;
    border-radius: 50%;
    border: 1.5px solid;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
  }
  .step-body { flex: 1; min-width: 0; }
  .step-label { font-size: 12px; color: #e6edf3; }
  .step-status { font-size: 10px; margin-top: 2px; }
</style>
</head>
<body>
  <div class="panel">
    <div class="header">
      <div class="repo-name">📁 ${escapeHtml(app.repoFullName)}</div>
      <div class="branch">branch: ${escapeHtml(app.branch)}${app.runtime ? ` · runtime: ${escapeHtml(app.runtime)}` : ''}</div>
      <div class="status-badge" style="color:${meta.color};">
        <span class="status-dot"></span>${meta.label}
      </div>
    </div>

    <div class="visit-wrap">
      ${canVisit
        ? `<a class="visit-btn enabled" href="${escapeHtml(app.liveUrl!)}" target="_blank" rel="noreferrer">🌐 Visit Live Site →</a>`
        : `<span class="visit-btn disabled">🌐 Visit Live Site (รอ deploy สำเร็จก่อน)</span>`}
      <div class="visit-hint">
        ${app.liveUrl ? escapeHtml(app.liveUrl) : 'ยังไม่มีลิงก์'}
      </div>
    </div>

    <div class="steps">
      <div class="steps-title">Gatekeeper Pipeline</div>
      ${stepsHtml}
    </div>
  </div>
</body>
</html>`;
}
