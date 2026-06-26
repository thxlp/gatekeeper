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
