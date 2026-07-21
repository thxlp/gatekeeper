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

// คู่ key/value สำหรับ env var และ build arg — value ถูกเข้ารหัส AES-256-GCM ตอนเก็บใน store
// (ดู git-app.store.ts) โค้ดนอก store เห็น plaintext เพราะเป็นค่าที่ container ต้องใช้จริง
export interface EnvVar {
  key: string;
  value: string;
}

// backing service ที่ระบบ provision ให้ต่อ app (container พี่น้องบน apps-network เดียวกัน)
export type AppAddon = 'postgres' | 'redis';

// ข้อมูลการเชื่อมต่อ addon ที่ provision แล้ว — url เป็น secret (มี password) เข้ารหัสใน store
// inject เข้า app เป็น env var ชื่อ envKey (เช่น DATABASE_URL, REDIS_URL)
export interface AddonConnection {
  type: AppAddon;
  containerName: string;
  envKey: string;
  url: string;
  // มีค่า = addon ถูกถอดออกแล้วแต่ volume ยังถูกเก็บไว้ในช่วง retention (default 7 วัน) —
  // เก็บ connection ทั้งก้อนไว้เพื่อรักษา password เดิม (volume ผูกกับ password ตอน init)
  // ติ๊ก addon กลับภายในช่วงนี้จะได้ข้อมูลเดิมคืน พ้นกำหนด sweeper จะลบ volume + entry นี้ทิ้ง
  retiredAt?: string;
}

// ประวัติ release ต่อ deploy ที่สำเร็จ 1 รายการ — image ของ release ที่ยังอยู่ในลิสต์จะไม่ถูก
// prune (เก็บ RELEASE_KEEP ตัวล่าสุด ดู recordRelease ใน deploy-pipeline.service.ts) ทำให้กด
// rollback กลับไป run image เดิมได้โดยไม่ต้อง rebuild (source เก่าไม่ถูกเก็บ — zip อยู่แค่ใน
// memory, git clone เป็น shallow ตาม branch tip จึง rebuild เวอร์ชันเก่าไม่ได้อยู่แล้ว)
export interface ReleaseRecord {
  id: string;        // = requestId ของ deploy รอบนั้น (ตรงกับ tag ส่วนท้ายของ image)
  imageTag: string;  // gatekeeper-app-<appId>:<requestId> — internal ไม่ echo ออก API
  createdAt: string;
  sourceType: AppSourceType;
  commitSha?: string; // เฉพาะ git deploy (rev-parse HEAD หลัง clone) — manual zip ไม่มี
  branch?: string;
  port?: number;      // port ที่ container listen ตอน deploy รอบนั้น — ใช้ตอน rollback
  degraded?: boolean; // deploy ผ่านแบบเฝ้าระวัง (container รันแต่ไม่ตอบ healthcheck)
}

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
  githubHookId?: number;          // id ของ webhook ฝั่ง GitHub ถ้าเราสร้างให้อัตโนมัติ (ใช้ตามลบตอน user ลบ app)
  enabled: boolean;
  runtime?: string;
  // port ที่ container ของแอป listen จริง — ระบุเองตอนลงทะเบียนได้ ถ้าไม่ระบุระบบจะเดาจาก
  // EXPOSE ใน Dockerfile หรือ default ตาม runtime (ดู resolveServePort ใน docker-runtime.service.ts)
  // ใช้ทั้งตอน healthcheck (stage 5) และตอน proxy /live/<id> เข้า container (live.controller.ts)
  port?: number;
  // env var ที่ inject เข้า container ตอนรัน (value เข้ารหัสใน store) — เช่น DATABASE_URL, API keys
  envVars?: EnvVar[];
  // build arg ส่งเข้า docker build (value เข้ารหัสใน store) — เช่น token ตอน build
  buildArgs?: EnvVar[];
  // backing service ที่ผู้ใช้ขอให้ provision (postgres/redis) — ระบบสร้าง container ให้ + inject URL
  addons?: AppAddon[];
  // ผลการ provision addon (url มี secret เข้ารหัสใน store) — internal, ไม่ echo ออก API เป็นค่าเต็ม
  addonConnections?: AddonConnection[];
  // resource ต่อ container — ตั้งค่าได้แต่มี cap เพื่อความปลอดภัย (ดู clampResources ใน docker-runtime)
  memoryMb?: number;
  cpu?: number;
  // static SPA: ใส่ history-fallback (try_files ... /index.html) ให้ nginx ตอน generate Dockerfile
  spa?: boolean;
  // ลิงก์ auto-generate ไปที่โดเมนเราเอง (https://<domain>/live/<app-id>)
  liveUrl?: string;
  pipelineStatus?: DeployStatus;
  pipelineStages?: PipelineStage[];
  // ประวัติ release (ใหม่สุดก่อน) — อ่านแบบ (app.releases ?? []) เสมอ entry เก่าใน store ไม่มี field นี้
  releases?: ReleaseRecord[];
  // release ที่ container ปัจจุบันรันอยู่ — rollback แค่ย้ายค่านี้ ไม่ reorder/duplicate ลิสต์
  activeReleaseId?: string;
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
  deployResult?: object;
}
