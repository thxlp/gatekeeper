// ===== Account / Auth =====
// 'password' = 3 demo rows แบบ static เดิม, 'supabase' = user จริงที่ login ผ่าน Supabase Auth
// (email/password, GitHub, Google รวมอยู่ในค่านี้ค่าเดียว เพราะ Supabase abstract ให้แล้ว)
export interface Account {
  id: string;
  api_key: string;
  plan: 'free' | 'pro';
  status: 'active' | 'suspended';
  email: string;
  auth_provider: 'password' | 'supabase';
}

// ===== Scanner =====
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Finding {
  type: 'secret' | 'heuristic' | 'dependency';
  rule_id: string;
  severity: Severity;
  description: string;
  file: string;
}

// ===== Decision =====
export type Decision = 'ALLOW' | 'BLOCK' | 'QUARANTINE';

export interface RiskResult {
  decision: Decision;
  score: number;
  findings: Finding[];
}

// ===== Plugin Registry =====
export type PluginStatus =
  | 'pending'      // รอตรวจสอบ
  | 'screening'    // กำลัง scan (Step 3)
  | 'generating'   // กำลังสร้าง connection file (Step 4)
  | 'active'       // ใช้งานได้ปกติ
  | 'quarantine'   // ผ่าน screening แต่รอ human review
  | 'revoked'      // ถูก revoke (Step 9)
  | 'blocked';     // ถูก block เด็ดขาด

export interface PluginEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
}

export interface Plugin {
  id: string;
  name: string;
  description?: string;
  base_url: string;
  auth_type: 'bearer' | 'api_key' | 'basic' | 'none';
  auth_header?: string;       // เช่น 'Authorization', 'X-API-Key'
  endpoints: PluginEndpoint[];
  owner_account_id: string;
  project_id?: string;        // อ้างถึง GitApp.id — ผูก plugin นี้เข้ากับโปรเจกต์ที่ลงทะเบียนไว้ (ไม่บังคับ)
  status: PluginStatus;
  risk_score?: number;
  findings?: Finding[];
  signature?: string;         // HMAC signature (Step 5)
  connection_file?: object;   // generated manifest (Step 4)
  created_at: string;
  updated_at: string;
  last_verified_at?: string;
  last_handshake_at?: string;
}

// ===== Git Auto-Deploy (GitHub Webhook) =====
export type PipelineStageKey =
  | 'payload_verification'
  | 'repo_cloning'
  | 'security_scan'
  | 'app_build'
  | 'production_deploy';

export type PipelineStageStatus = 'pending' | 'running' | 'success' | 'failed';

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  status: PipelineStageStatus;
  at?: string; // ISO timestamp ของครั้งล่าสุดที่ stage นี้เปลี่ยนสถานะ
}

export type DeployStatus = 'idle' | 'deploying' | 'success' | 'failed';

// 'git' = จาก GitHub webhook push (ของเดิม), 'manual' = จาก manual zip upload (/apps/manual/deploy)
// อ่านค่านี้แบบ (app.sourceType ?? 'git') เสมอตอนอ่านจาก store — entry เก่าก่อนหน้านี้ไม่มี field
// นี้เลย (สร้างมาก่อนมี manual deploy) ต้อง default เป็น 'git' เพื่อ backward-compat กับ
// git-apps-store.json ที่มีอยู่แล้ว โดยไม่ต้องเขียน migration script
export type AppSourceType = 'git' | 'manual';

// ชื่อ "GitApp" เป็นชื่อเดิมตั้งแต่ตอนที่มีแค่ git-webhook deploy — ตอนนี้ type นี้ครอบคลุมทั้ง
// git และ manual-upload app แล้ว (ตั้งใจไม่ rename ทั้ง codebase เป็น "App" เพื่อไม่ให้ diff ใหญ่เกินจำเป็น)
export interface GitApp {
  id: string;
  accountId: string;
  sourceType: AppSourceType;
  projectName?: string;           // ชื่อที่ผู้ใช้ตั้งเอง (มีความหมายเฉพาะ manual app — git app ใช้ repoFullName แทน)
  repoFullName?: string;          // เฉพาะ sourceType==='git': เช่น "octocat/hello-world" — จับคู่กับ payload.repository.full_name
  cloneUrl?: string;              // เฉพาะ sourceType==='git': URL ที่เราเชื่อและใช้ clone จริง (ไม่เชื่อ URL จาก payload กัน SSRF/repo-swap)
  branch?: string;                // เฉพาะ sourceType==='git': deploy เฉพาะ push ที่เข้า branch นี้ (เช่น "main")
  webhookSecretEnvVar?: string;   // (แบบ static/ops-managed) ชื่อ env var ที่เก็บ webhook secret จริง
  webhookSecret?: string;         // (แบบ self-service/dynamic) secret ที่ระบบสุ่มให้ตอนลงทะเบียน เก็บตรงใน store
  enabled: boolean;
  runtime?: string;
  // ลิงก์ auto-generate ไปที่โดเมนเราเอง (https://<domain>/live/<app-id>)
  liveUrl?: string;
  pipelineStatus?: DeployStatus;
  pipelineStages?: PipelineStage[];
  createdAt?: string;
  updatedAt?: string;
}

// ===== Audit =====
export interface AuditEntry {
  ts: string;
  requestId: string;
  accountId?: string;
  stage: string;
  decision: Decision | 'INFO';
  reason?: string;
  score?: number;
  findings?: Finding[];
  pluginId?: string;
  deployResult?: object;
}
