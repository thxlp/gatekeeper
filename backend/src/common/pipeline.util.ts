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

/**
 * Path-based live URL ต่อแอป — ผูกกับ app id เอง (ไม่ใช่ repo slug) เพราะต้องใช้ได้ทั้ง
 * git app และ manual app (manual ไม่มี repoFullName) และ id สุ่มมาแล้วไม่ซ้ำกันอยู่แล้ว
 * เส้นทางนี้ proxy เข้า container ชื่อ gatekeeper-app-<id> ผ่าน backend เอง (ดู live/live.controller.ts)
 *
 * ตั้งใจแยก origin จาก dashboard (gatekeeper.studiodup.com) โดยเด็ดขาด — โค้ดของลูกค้าที่รันอยู่
 * ใต้ /live/ ไม่ควรอยู่ origin เดียวกับ dashboard เพราะ same-origin policy จะให้ JS ของแอปลูกค้า
 * (ที่ไม่ควรไว้ใจ) อ่าน localStorage/cookie ของ session dashboard ได้ทันทีถ้า origin ตรงกัน —
 * ใช้ env var แยกต่างหากจาก PUBLIC_WEBHOOK_URL เพื่อไม่ผูกสองเรื่องนี้เข้าด้วยกัน
 */
export function buildLiveUrl(appId: string): string {
  const base = (process.env.PUBLIC_LIVE_URL || 'https://live.studiodup.com').replace(/\/+$/, '');
  return `${base}/live/${appId}`;
}
