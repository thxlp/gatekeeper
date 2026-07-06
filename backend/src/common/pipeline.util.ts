import { PipelineStage, PipelineStageKey } from './types';

// label ใช้คำกลางๆ ที่ใช้ได้ทั้ง git-webhook deploy และ manual zip-upload deploy (สอง source
// ต่างกันที่ขั้นตอนได้ source code มา — git = clone, manual = แตก zip — key เดิมใช้ร่วมกันได้)
const STAGE_DEFS: { key: PipelineStageKey; label: string }[] = [
  { key: 'payload_verification', label: '📦 Input Verification' },
  { key: 'repo_cloning',         label: '🧬 Source Acquisition' },
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

/**
 * Path-based live URL ต่อแอป — ผูกกับ app id เอง (ไม่ใช่ repo slug) เพราะต้องใช้ได้ทั้ง
 * git app และ manual app (manual ไม่มี repoFullName) และ id สุ่มมาแล้วไม่ซ้ำกันอยู่แล้ว
 * เส้นทางนี้ proxy เข้า container ชื่อ gatekeeper-app-<id> ผ่าน backend เอง (ดู live/live.controller.ts)
 */
export function buildLiveUrl(appId: string): string {
  return `${publicDomain()}/live/${appId}`;
}
