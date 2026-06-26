import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuditEntry } from '../common/types';
import { DATA_DIR, ROOT } from '../common/paths';

@Injectable()
export class AuditService {
  private logPath: string;

  constructor() {
    const configured = process.env.AUDIT_LOG_PATH;
    this.logPath = configured
      ? path.isAbsolute(configured)
        ? configured
        : path.resolve(ROOT, configured)
      : path.join(DATA_DIR, 'audit.log');
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
  }

  append(entry: Omit<AuditEntry, 'ts'>): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    fs.appendFileSync(this.logPath, line + '\n', 'utf8');
  }

  readAll(): AuditEntry[] {
    try {
      return fs
        .readFileSync(this.logPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  readByPlugin(pluginId: string): AuditEntry[] {
    return this.readAll().filter((e) => e.pluginId === pluginId);
  }

  readByAccount(accountId: string): AuditEntry[] {
    return this.readAll().filter((e) => e.accountId === accountId);
  }
}
