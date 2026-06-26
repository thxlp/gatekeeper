// ===== Account / Auth =====
export interface Account {
  id: string;
  api_key: string;
  plan: 'free' | 'pro';
  status: 'active' | 'suspended';
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
