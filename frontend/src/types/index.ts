export interface Finding {
  type: 'secret' | 'heuristic' | 'dependency';
  rule_id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  file: string;
}

export interface AuditEntry {
  ts: string;
  requestId: string;
  accountId?: string;
  stage: string;
  decision: 'ALLOW' | 'BLOCK' | 'QUARANTINE' | 'INFO';
  reason?: string;
  score?: number;
  findings?: Finding[];
}

export interface GitAppRegistration {
  id: string;
  repoFullName: string;
  branch: string;
  webhookUrl: string;
  webhookSecret: string;
  contentType: string;
  events: string[];
}

export type AppSourceType = 'git' | 'manual';

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
  at?: string;
}

export type DeployStatus = 'idle' | 'deploying' | 'success' | 'failed';

export interface GitAppSummary {
  id: string;
  sourceType: AppSourceType;
  projectName?: string;
  repoFullName?: string;
  branch?: string;
  runtime?: string;
  enabled: boolean;
  webhookUrl?: string;
  dashboardUrl?: string;
  liveUrl?: string;
  pipelineStatus?: DeployStatus;
  createdAt?: string;
  updatedAt?: string;
}

// release ในประวัติ deploy (GET /apps/:id → releases) — ใช้แสดงลิสต์ + ปุ่ม rollback
export interface ReleaseSummary {
  id: string;
  createdAt: string;
  sourceType: AppSourceType;
  commitSha?: string;
  branch?: string;
  degraded: boolean; // deploy ผ่านแบบเฝ้าระวัง (container รันแต่ไม่ตอบ healthcheck ตอนนั้น)
  active: boolean;   // ตัวที่ container ปัจจุบันรันอยู่
}

// รายละเอียดเต็มของ app เดียว (GET /apps/:id) — ต่างจาก GitAppSummary ตรงมี pipelineStages
// (ทั้ง 5 stage) ด้วย ใช้สำหรับ poll ระหว่าง deploy กำลังวิ่งอยู่
export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

// custom domain ที่ผูกกับแอป (แท็บ Domains)
export interface CustomDomain {
  domain: string;
  status: 'pending' | 'active' | 'error';
  lastError?: string;
  addedAt: string;
  activatedAt?: string;
}

export interface GitAppDetail extends GitAppSummary {
  pipelineStages?: PipelineStage[];
  releases?: ReleaseSummary[];
  // auto-deploy / webhook setup (owner-only)
  provider?: GitProvider;
  webhookUrl?: string;
  webhookSecret?: string;
  autoDeploy?: boolean;
  lastAutoDeployAt?: string;
  customDomains?: CustomDomain[];
}

// env var หนึ่งตัวในหน้า Variables — backend ไม่เคยส่งค่าจริงกลับ (เป็นความลับ) มีแค่ชื่อ+เวลาแก้
export interface EnvVarSummary {
  key: string;
  updatedAt?: string;
}

// ผลจาก GET/POST/PUT/DELETE /apps/:id/env — needsRedeploy=true หลัง mutation (env ผูกตอน deploy)
export interface EnvListResponse {
  vars: EnvVarSummary[];
  needsRedeploy?: boolean;
  imported?: number;
}

// snapshot log (GET /apps/:id/logs) — pending=true คือยังไม่มี container (ยังไม่เคย deploy สำเร็จ)
export interface LogSnapshot {
  pending: boolean;
  lines: string[];
}

// ===== Managed database (ต่อ user) =====
export type DbEngine = 'postgres' | 'redis' | 'mysql';

export interface ManagedDbSummary {
  id: string;
  name: string;
  engine: DbEngine;
  status: 'provisioning' | 'running' | 'stopped' | 'error';
  running: boolean;
  lastError?: string;
  attachedAppIds: string[];
  // connection แบบไม่มี password (ปุ่ม copy เต็มเรียก endpoint แยก)
  connection: { host: string; port: number; envKey: string; username: string; dbName: string };
  createdAt?: string;
}

// connection string เต็ม (GET /databases/:id/connection) — มี password, internal เท่านั้น
export interface DbConnection {
  url: string;
  host: string;
  port: number;
  envKey: string;
  username: string;
  dbName: string;
}

// ===== SQL console / table browser (หน้า /databases/[id]) =====

// รายชื่อตาราง — rows เป็นค่าประมาณจาก statistics ของ engine (reltuples / table_rows)
// ไม่ใช่ COUNT(*) จริง เพราะนับจริงบนตารางใหญ่คือ full scan
export interface DbTableInfo {
  name: string;
  schema?: string;
  rows: number;
}

// ผลของ POST /databases/:id/query
// rows เป็นอาเรย์เรียงตาม columns (ไม่ใช่ object) — คอลัมน์ชื่อซ้ำกันได้ในผล join
export interface DbQueryResult {
  kind: 'read' | 'write';
  verb: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  // write ที่ยังไม่ส่ง confirm — backend rollback ให้แล้ว บอกแค่ว่าจะกระทบกี่แถว
  preview?: boolean;
  affectedRows?: number;
}

// ===== Redis console =====
// ttl: -1 = ไม่หมดอายุ, -2 = ไม่มี key แล้ว
export interface RedisKeyRow {
  key: string;
  type: string;
  ttl: number;
}

export interface RedisKeyPage {
  keys: RedisKeyRow[];
  cursor: string;
  done: boolean;
}

export interface RedisKeyValue {
  key: string;
  type: string;
  ttl: number;
  value: unknown;
  truncated: boolean;
}

// คำสั่งที่เขียนข้อมูลรอบแรกได้ preview (สถานะ key ปัจจุบัน) รอบสองที่ส่ง confirm ถึงรันจริง
export type RedisCommandResult =
  | {
      preview: true;
      command: string;
      key: string | null;
      current: { exists: boolean; type?: string; ttl?: number; value?: unknown } | null;
    }
  | { preview: false; command: string; result: unknown };

export interface DeployOutcome {
  id?: string;
  // manual deploy ตอบ { id, status: 'deploying' } ทันที (pipeline วิ่ง background) —
  // decision จึงไม่มีในเคสนั้น เหลือใช้กับ error ที่ประกอบฝั่ง client เอง
  decision?: 'ALLOW' | 'BLOCK' | 'QUARANTINE';
  status?: string;
  requestId?: string;
  score?: number;
  findings?: Finding[];
  reason?: string;
  message?: string;
  deployedPath?: string;
  restartOk?: boolean;
}

// ===== Notifications (กระดิ่งบน TopBar) =====
export interface NotificationItem {
  id: string;
  type: string; // deploy_success | deploy_failed | deploy_blocked | rollback_success | rollback_failed | ...
  title: string;
  body: string;
  meta?: { appId?: string; requestId?: string } & Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}

// ===== Account (GET /account/me) =====
export interface AccountMe {
  email?: string;
  plan?: string;
  notifyEmail: boolean;
  twoFactorEnabled: boolean;
  // SMTP ฝั่ง server ถูกตั้งค่าหรือยัง — UI ใช้ disable toggle email/ปุ่ม 2FA ให้ตรงความจริง
  mailConfigured: boolean;
  // ฟีเจอร์ 2FA เปิดใช้ทั้งระบบอยู่ไหม (env FEATURE_2FA ฝั่ง backend) — false = ปิดปรับปรุง
  twoFactorAvailable: boolean;
}

// ===== GitHub connection (Railway-style repo picker) =====
export interface GithubStatus {
  connected: boolean;
  username?: string;
  scopes?: string[];
  connectedAt?: string;
}

// ===== บันทึกการใช้งาน (audit) =====
export type AuditDecisionFilter = 'ALLOW' | 'QUARANTINE' | 'BLOCK' | 'INFO';

export interface AuditPage {
  rows: AuditEntry[];
  /** จำนวนแถวทั้งหมดที่ตรงเงื่อนไข (ไม่ใช่แค่หน้านี้) */
  total: number;
  hasMore: boolean;
}

// ===== GitLab/Bitbucket connection (paste token เอง — ไม่มี OAuth flow เหมือน GitHub) =====
export type GitCredentialProvider = 'gitlab' | 'bitbucket';

export interface GitCredentialStatus {
  provider: GitCredentialProvider;
  connected: boolean;
  username?: string;
  connectedAt?: string;
}

export interface GitCredentialsStatus {
  providers: GitCredentialStatus[];
}

export interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

// ผลจาก POST /apps/register-github — webhook ถูกสร้างใน GitHub ให้แล้ว + first deploy กำลังวิ่ง
export interface GithubRegisterResult {
  id: string;
  repoFullName: string;
  branch: string;
  runtime?: string;
  webhookUrl: string;
  autoWebhook: boolean;
  dashboardUrl: string;
  liveUrl?: string;
  pipelineStatus: DeployStatus;
}

// ผลการใช้งานต่อ account จาก GET /usage (การ์ด Usage บนหน้า Settings)
export interface UsageAppStat {
  id: string;
  name: string;
  running: boolean;
  cpuPercent: number | null; // null = ยังไม่เคย deploy สำเร็จ (ไม่มี container)
  memUsedMb: number | null;
  memLimitMb: number | null;
}

export interface UsageDeployMonth {
  month: string; // YYYY-MM
  total: number;
  allowed: number;
  blocked: number;
}

// โควต้าทรัพยากรรวมต่อบัญชี (เพดานผลรวม limit ของทุก app+addon ไม่ใช่การใช้งานจริงขณะนี้)
export interface UsageQuota {
  memoryUsedMb: number;
  memoryQuotaMb: number;
  cpuUsed: number;
  cpuQuota: number;
}

export interface UsageSummary {
  apps: UsageAppStat[];
  quota: UsageQuota;
  deploys: {
    total: number;
    allowed: number;
    blocked: number;
    months: UsageDeployMonth[];
  };
}
