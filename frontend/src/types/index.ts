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
export interface GitAppDetail extends GitAppSummary {
  pipelineStages?: PipelineStage[];
  releases?: ReleaseSummary[];
}

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
}

// ===== GitHub connection (Railway-style repo picker) =====
export interface GithubStatus {
  connected: boolean;
  username?: string;
  scopes?: string[];
  connectedAt?: string;
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
