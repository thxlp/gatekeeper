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

  readByAccount(accountId: string): AuditEntry[] {
    return this.readAll().filter((e) => e.accountId === accountId);
  }

  /**
   * อ่านของ account เดียว เรียงใหม่สุดก่อน + กรอง + ตัดหน้า
   *
   * audit.log เป็นไฟล์ append-only แบน ไม่มี index — ยังต้องอ่านทั้งไฟล์อยู่ดี แต่การตัดที่นี่
   * ทำให้ response ไม่โตตามอายุระบบ (เดิมคืนทุกแถวที่เคยเกิดขึ้น แล้วเบราว์เซอร์ render หมด)
   * ถ้าวันหนึ่งไฟล์ใหญ่จนอ่านช้า ค่อยย้ายไปเก็บใน Postgres แล้ว query จริง
   */
  queryByAccount(
    accountId: string,
    opts: { decision?: string; q?: string; offset?: number; limit?: number } = {},
  ): { rows: AuditEntry[]; total: number; hasMore: boolean } {
    const offset = Math.max(0, opts.offset ?? 0);
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const needle = (opts.q ?? '').trim().toLowerCase();

    const matched = this.readByAccount(accountId)
      .filter((e) => !opts.decision || e.decision === opts.decision)
      .filter((e) => {
        if (!needle) return true;
        // ค้นจากทุกอย่างที่ผู้ใช้เห็นบนแถว ไม่ใช่แค่ reason
        return [e.stage, e.decision, e.reason, e.requestId]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle));
      })
      .reverse(); // ใหม่สุดก่อน — เดิม frontend เป็นคน reverse เอง

    return {
      rows: matched.slice(offset, offset + limit),
      total: matched.length,
      hasMore: offset + limit < matched.length,
    };
  }
}
