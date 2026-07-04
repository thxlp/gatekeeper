import { PipelineStage, PipelineStageKey } from './types';

const STAGE_DEFS: { key: PipelineStageKey; label: string }[] = [
  { key: 'payload_verification', label: '📦 Payload Verification' },
  { key: 'repo_cloning',         label: '🧬 Repository Cloning' },
  { key: 'security_scan',        label: '🛡️ Security Vulnerability Scanning' },
  { key: 'app_build',            label: '🏗️ Application Building' },
  { key: 'production_deploy',    label: '🚀 Production Deployment' },
];

export function initialPipelineStages(): PipelineStage[] {
  return STAGE_DEFS.map((s) => ({ ...s, status: 'pending' as const }));
}

function publicDomain(): string {
  const webhookUrl = process.env.PUBLIC_WEBHOOK_URL || 'https://gatekeeper.studiodup.com/api/v2/webhooks/github';
  try {
    const u = new URL(webhookUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://gatekeeper.studiodup.com';
  }
}

function slugifyRepo(repoFullName: string): string {
  return repoFullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

/**
 * ลิงก์ auto-generate ให้สั้นๆ ผูกกับโดเมนเราเอง — หมายเหตุ: ระบบยังไม่มี reverse-proxy/hosting
 * จริงแยกต่อแอปที่ deploy (restartCommand เป็นแค่ docker restart placeholder ดู apps.service.ts)
 * ลิงก์นี้จึงเป็นแค่ตัวจองไว้ก่อน ยังไม่ serve เนื้อหาจริงจนกว่าจะมี infra ส่วนนั้น
 */
export function buildLiveUrl(repoFullName: string): string {
  return `${publicDomain()}/live/${slugifyRepo(repoFullName)}`;
}
