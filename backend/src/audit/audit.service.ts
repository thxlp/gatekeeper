import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuditEntry } from '../common/types';
import { DATA_DIR, ROOT } from '../common/paths';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
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

  /**
   * อ่านทั้งไฟล์ โดย **ข้ามบรรทัดที่ parse ไม่ได้ทีละบรรทัด**
   *
   * เดิมครอบ try/catch รอบ `.map(JSON.parse)` ทั้งก้อน → บรรทัดเสียบรรทัดเดียว (เขียนไม่จบ
   * เพราะดิสก์เต็ม/ไฟดับกลาง append) ทำให้คืน [] ทั้งไฟล์ แล้วหน้า /audit ขึ้นว่า
   * "ยังไม่มีเหตุการณ์" ทั้งที่มีเป็นร้อยแถว — ล้มไปทางที่ *บอกความจริงผิด* ซึ่งกับ audit log
   * แย่กว่าการยอมเสียบางแถวไป
   *
   * แถวที่เสียถูกนับและ log warn ไว้ — ไม่กลืนเงียบ เพราะ audit log ที่มีรอยขาดคือสัญญาณ
   * ที่คนดูแลระบบต้องรู้ (อาจหมายถึงดิสก์เต็มหรือ backend สองตัวเขียนชนกัน)
   */
  readAll(): AuditEntry[] {
    let raw: string;
    try {
      raw = fs.readFileSync(this.logPath, 'utf8');
    } catch {
      return []; // ยังไม่มีไฟล์ = ยังไม่เคยมีเหตุการณ์จริงๆ
    }

    const rows: AuditEntry[] = [];
    let broken = 0;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        broken++;
      }
    }
    if (broken > 0) {
      this.logger.warn(`audit.log มี ${broken} บรรทัดที่อ่านไม่ได้ (ข้ามไป) — path=${this.logPath}`);
    }
    return rows;
  }

  readByAccount(accountId: string): AuditEntry[] {
    return this.readAll().filter((e) => e.accountId === accountId);
  }

  /**
   * ข้อความที่ใช้เทียบคำค้น — ต้องครอบ **ทุกอย่างที่ผู้ใช้เห็นบนแถว** ไม่ใช่แค่ reason
   * ไม่งั้นพิมพ์สิ่งที่มองเห็นอยู่บนจอแล้วหาไม่เจอ (เดิมค้นแค่ stage/decision/reason/requestId
   * ทั้งที่คอลัมน์รายละเอียดโชว์ `score=N` และ `N findings` ด้วย — ดู auditDetail() ฝั่ง frontend)
   *
   * ใส่ทั้งค่าดิบและรูปแบบที่ render ออกมา เพื่อให้ทั้ง "8" และ "score=8" หาเจอเหมือนกัน
   *
   * ข้อจำกัดที่ยอมรับไว้: ts เป็น ISO (2026-08-03T…) ค้น "2026-08" ได้ แต่ตารางแสดงเวลาแบบ
   * localized (03/08/2026) ซึ่งค้นด้วยรูปแบบนั้นไม่เจอ — ถ้าต้องกรองตามวันจริงจังควรทำเป็น
   * ตัวกรองช่วงวันที่แยก ไม่ใช่ยัดลงช่องค้นหา
   */
  private haystack(e: AuditEntry): string {
    const parts: (string | undefined)[] = [e.ts, e.stage, e.decision, e.reason, e.requestId];
    if (e.score !== undefined && e.score !== null) parts.push(String(e.score), `score=${e.score}`);
    if (e.findings?.length) parts.push(`${e.findings.length} findings`);
    return parts.filter((p) => p).join(' ').toLowerCase();
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
      .filter((e) => !needle || this.haystack(e).includes(needle))
      .reverse(); // ใหม่สุดก่อน — เดิม frontend เป็นคน reverse เอง

    return {
      rows: matched.slice(offset, offset + limit),
      total: matched.length,
      hasMore: offset + limit < matched.length,
    };
  }
}
