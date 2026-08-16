import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuditEntry } from '../common/types';
import { DATA_DIR, ROOT } from '../common/paths';

/** ค่าที่ parse ไม่ได้ถือว่าไม่ได้ส่งมา (= ไม่กรอง) ดีกว่าตอบ 400 ให้หน้าเว็บพังเพราะ query เพี้ยน */
function parseInstant(v?: string): number | undefined {
  if (!v) return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : ms;
}

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
    opts: {
      decision?: string;
      stage?: string;
      q?: string;
      from?: string;
      to?: string;
      offset?: number;
      limit?: number;
    } = {},
  ): { rows: AuditEntry[]; total: number; hasMore: boolean } {
    const offset = Math.max(0, opts.offset ?? 0);
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const needle = (opts.q ?? '').trim().toLowerCase();
    // ช่วงวันที่รับมาเป็น ISO instant ที่ frontend คำนวณจากวันที่ผู้ใช้เลือกตาม timezone ของเครื่อง
    // เขาเอง (ดู toDayRange ในหน้า /audit) — เซิร์ฟเวอร์รัน UTC ถ้ามาเดาขอบวันเองที่นี่ คนไทย
    // (UTC+7) จะได้ผลเคลื่อนไป 7 ชม. เช่นดีพลอย 4 ส.ค. 02:00 +07 ถูกเก็บเป็น 3 ส.ค. 19:00Z
    const fromMs = parseInstant(opts.from);
    const toMs = parseInstant(opts.to);

    const matched = this.readByAccount(accountId)
      .filter((e) => !opts.decision || e.decision === opts.decision)
      // stage เทียบตรงๆ (ไม่ใช่ substring) — ใช้แยกสตรีมย่อยเช่นประวัติ managed-db ออกจาก
      // audit รวมของทั้งบัญชี โดยไม่พึ่งการค้นข้อความที่อาจ false-positive กับ reason ของ stage อื่น
      .filter((e) => !opts.stage || e.stage === opts.stage)
      .filter((e) => !needle || this.haystack(e).includes(needle))
      .filter((e) => {
        if (fromMs === undefined && toMs === undefined) return true;
        const ts = Date.parse(e.ts);
        if (Number.isNaN(ts)) return false; // ts พัง = ไม่รู้ว่าอยู่ในช่วงไหม ตัดออกดีกว่าเดา
        return (fromMs === undefined || ts >= fromMs) && (toMs === undefined || ts <= toMs);
      })
      .reverse(); // ใหม่สุดก่อน — เดิม frontend เป็นคน reverse เอง

    return {
      rows: matched.slice(offset, offset + limit),
      total: matched.length,
      hasMore: offset + limit < matched.length,
    };
  }
}
