export type PluginStatus =
  | 'pending' | 'screening' | 'generating' | 'active'
  | 'quarantine' | 'revoked' | 'blocked';

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
  auth_header?: string;
  endpoints: PluginEndpoint[];
  owner_account_id: string;
  project_id?: string;
  status: PluginStatus;
  risk_score?: number;
  findings?: Finding[];
  signature?: string;
  connection_file?: object;
  created_at: string;
  updated_at: string;
  last_verified_at?: string;
  last_handshake_at?: string;
}

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
  pluginId?: string;
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

// รายละเอียดเต็มของ app เดียว (GET /apps/:id) — ต่างจาก GitAppSummary ตรงมี pipelineStages
// (ทั้ง 5 stage) ด้วย ใช้สำหรับ poll ระหว่าง deploy กำลังวิ่งอยู่
export interface GitAppDetail extends GitAppSummary {
  pipelineStages?: PipelineStage[];
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

export interface CertifiedService {
  id: string;
  name: string;
  vendor: string;
  category: string;
  base_url_template: string;
  auth_type: string;
  verified: boolean;
  docs_url: string;
  logo: string;
}
