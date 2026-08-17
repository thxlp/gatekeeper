import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Account, ManagedDatabase } from '../common/types';
import { ManagedDbStore } from './managed-db.store';
import { DockerRuntimeService, managedDbConnectionInfo, managedDbContainerName } from '../deploy/docker-runtime.service';
import { AuditService } from '../audit/audit.service';
import { classifyStatement, wrapWithLimit } from './sql-guard';

/** เพดานแถวที่ส่งกลับ — backend แชร์ RAM 2GB กับทุกอย่างบนเครื่อง ผลลัพธ์ล้านแถวคือ OOM */
const MAX_ROWS = Number(process.env.DB_CONSOLE_MAX_ROWS || 500);
/** คิวรีนานเกินนี้ถูกตัดทิ้งฝั่ง DB — กัน user ยิงคิวรีหนักจนกิน CPU ของ container ยาว */
const QUERY_TIMEOUT_MS = Number(process.env.DB_CONSOLE_TIMEOUT_MS || 5000);
/** รอ lock ได้แค่นี้ — กันคิวรีที่ไปค้างรอ lock ของแอปจริงจนตารางถูกล็อกยาว */
const LOCK_TIMEOUT_MS = Number(process.env.DB_CONSOLE_LOCK_TIMEOUT_MS || 3000);
const CONNECT_TIMEOUT_MS = 5000;
/** SQL ที่บันทึกลง audit ถูกตัดความยาว — ไม่ให้ log บวมและไม่เก็บข้อมูลลูกค้าทั้งก้อน */
const AUDIT_SQL_MAX = 200;

export interface QueryOutcome {
  kind: 'read' | 'write';
  verb: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  /** write ที่ยังไม่ confirm — รันใน transaction แล้ว rollback เพื่อดูว่าจะกระทบกี่แถว */
  preview?: boolean;
  affectedRows?: number;
}

/**
 * SQL console / table browser ของ managed DB
 *
 * ความปลอดภัยซ้อนกัน 4 ชั้น (ชั้นเดียวไม่พอ เพราะ classify SQL ด้วย regex ไม่มีทางสมบูรณ์):
 *  1. guard ฝั่งเรา — allowlist คำสั่ง ตัด comment/string ก่อนตรวจ (sql-guard.ts)
 *  2. read ถูกครอบด้วย read-only transaction ฝั่ง DB — engine ปฏิเสธการเขียนเองต่อให้ 1 พลาด
 *  3. write ต้องยืนยันสองจังหวะ: รอบแรก rollback เพื่อนับแถว รอบสองถึง commit
 *  4. statement_timeout + lock_timeout + เพดานแถว — กันคิวรีค้างและ OOM
 *
 * ownership เช็คทุก entry point (getOwnedOrThrow) และทุกการเขียนถูกบันทึก audit
 */
@Injectable()
export class DbQueryService {
  private readonly logger = new Logger(DbQueryService.name);

  constructor(
    private store: ManagedDbStore,
    private docker: DockerRuntimeService,
    private audit: AuditService,
  ) {}

  // ===== SQL (postgres / mysql) =====

  async runSql(id: string, account: Account, sql: string, confirm: boolean): Promise<QueryOutcome> {
    const db = this.getOwnedOrThrow(id, account);
    if (db.engine === 'redis') {
      throw new BadRequestException('redis_uses_command_endpoint — redis ใช้ /redis ไม่ใช่ /query');
    }

    const verdict = classifyStatement(sql);
    if (verdict.kind === 'blocked') {
      // บันทึกความพยายามที่ถูกบล็อกด้วย — เป็นสัญญาณความปลอดภัยที่อยากเห็นย้อนหลัง
      this.auditLog(account, 'BLOCK', `db:query blocked (${verdict.reason}) on ${db.name}`);
      throw new BadRequestException(verdict.reason);
    }
    if (verdict.kind === 'write' && db.engine !== 'postgres' && db.engine !== 'mysql') {
      throw new BadRequestException('engine_not_supported');
    }

    const started = Date.now();
    const outcome =
      db.engine === 'postgres'
        ? await this.runPostgres(db, sql, verdict.kind, verdict.verb || '', confirm)
        : await this.runMysql(db, sql, verdict.kind, verdict.verb || '', confirm);
    outcome.durationMs = Date.now() - started;

    if (verdict.kind === 'write' && confirm) {
      this.auditLog(
        account,
        'INFO',
        `db:query write ${verdict.verb} on ${db.name} — ${outcome.affectedRows} แถว: ${truncate(sql)}`,
      );
    }
    return outcome;
  }

  /** รายชื่อตาราง + จำนวนแถวโดยประมาณ — คิวรีนี้เราเขียนเอง ไม่ผ่าน guard */
  async listTables(id: string, account: Account): Promise<Array<{ name: string; schema?: string; rows: number }>> {
    const db = this.getOwnedOrThrow(id, account);

    if (db.engine === 'postgres') {
      const sql = `
        SELECT c.relname AS name, n.nspname AS schema, GREATEST(c.reltuples, 0)::bigint AS rows
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
        ORDER BY n.nspname, c.relname`;
      const res = await this.runPostgres(db, sql, 'read', 'SELECT', false);
      return res.rows.map((r) => ({ name: String(r[0]), schema: String(r[1]), rows: Number(r[2]) || 0 }));
    }

    if (db.engine === 'mysql') {
      const sql = `SELECT table_name, table_schema, COALESCE(table_rows,0)
                   FROM information_schema.tables
                   WHERE table_schema = DATABASE() ORDER BY table_name`;
      const res = await this.runMysql(db, sql, 'read', 'SELECT', false);
      return res.rows.map((r) => ({ name: String(r[0]), schema: String(r[1]), rows: Number(r[2]) || 0 }));
    }

    throw new BadRequestException('engine_not_supported');
  }

  private async runPostgres(
    db: ManagedDatabase,
    sql: string,
    kind: 'read' | 'write',
    verb: string,
    confirm: boolean,
  ): Promise<QueryOutcome> {
    const target = await this.target(db);
    const client = new PgClient({
      host: target.host,
      port: target.port,
      user: target.user,
      password: target.password,
      database: target.database,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });

    try {
      await client.connect();
    } catch (err: any) {
      throw new ServiceUnavailableException(`db_connect_failed:${err?.code || err?.message || 'unknown'}`);
    }

    try {
      // read-only transaction = ชั้นกันที่ engine บังคับเอง ต่อให้ guard ฝั่งเราถูกหลอก
      await client.query(kind === 'read' ? 'BEGIN TRANSACTION READ ONLY' : 'BEGIN');
      await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
      await client.query(`SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS}`);

      const limited = kind === 'read' ? wrapWithLimit(sql, verb, MAX_ROWS + 1) : null;
      const res: any = await client.query({ text: limited || sql, rowMode: 'array' } as any);

      const columns = (res.fields || []).map((f: any) => f.name);
      const allRows: unknown[][] = (res.rows || []).map((row: unknown[]) => row.map(serializeCell));
      const truncated = allRows.length > MAX_ROWS;
      const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;

      if (kind === 'write') {
        const affected = res.rowCount ?? 0;
        // ยังไม่ยืนยัน = ดูอย่างเดียวแล้วถอยออก ข้อมูลจริงไม่ถูกแตะ
        await client.query(confirm ? 'COMMIT' : 'ROLLBACK');
        return {
          kind,
          verb,
          columns,
          rows,
          rowCount: rows.length,
          truncated,
          durationMs: 0,
          affectedRows: affected,
          ...(confirm ? {} : { preview: true }),
        };
      }

      await client.query('ROLLBACK');
      return { kind, verb, columns, rows, rowCount: rows.length, truncated, durationMs: 0 };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new BadRequestException(`sql_error: ${err?.message || 'unknown'}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async runMysql(
    db: ManagedDatabase,
    sql: string,
    kind: 'read' | 'write',
    verb: string,
    confirm: boolean,
  ): Promise<QueryOutcome> {
    const mysql = loadDriver('mysql2/promise');
    const target = await this.target(db);

    let conn: any;
    try {
      conn = await mysql.createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database: target.database,
        connectTimeout: CONNECT_TIMEOUT_MS,
        rowsAsArray: true,
        multipleStatements: false, // กันการต่อคำสั่งหลัง ; ซ้ำอีกชั้นนอกจาก guard
        dateStrings: true,
      });
    } catch (err: any) {
      throw new ServiceUnavailableException(`db_connect_failed:${err?.code || err?.message || 'unknown'}`);
    }

    try {
      await conn.query(`SET SESSION max_execution_time = ${QUERY_TIMEOUT_MS}`);
      await conn.query(`SET SESSION innodb_lock_wait_timeout = ${Math.ceil(LOCK_TIMEOUT_MS / 1000)}`);
      await conn.query(kind === 'read' ? 'START TRANSACTION READ ONLY' : 'START TRANSACTION');

      const limited = kind === 'read' ? wrapWithLimit(sql, verb, MAX_ROWS + 1) : null;
      const [result, fields] = await conn.query(limited || sql);

      const columns = (fields || []).map((f: any) => f.name);
      const raw: unknown[][] = Array.isArray(result) ? (result as unknown[][]) : [];
      const allRows = raw.map((row) => (Array.isArray(row) ? row.map(serializeCell) : [serializeCell(row)]));
      const truncated = allRows.length > MAX_ROWS;
      const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;

      if (kind === 'write') {
        const affected = (result as any)?.affectedRows ?? 0;
        await conn.query(confirm ? 'COMMIT' : 'ROLLBACK');
        return {
          kind,
          verb,
          columns,
          rows,
          rowCount: rows.length,
          truncated,
          durationMs: 0,
          affectedRows: affected,
          ...(confirm ? {} : { preview: true }),
        };
      }

      await conn.query('ROLLBACK');
      return { kind, verb, columns, rows, rowCount: rows.length, truncated, durationMs: 0 };
    } catch (err: any) {
      await conn.query('ROLLBACK').catch(() => undefined);
      throw new BadRequestException(`sql_error: ${err?.message || 'unknown'}`);
    } finally {
      await conn.end().catch(() => undefined);
    }
  }

  // ===== helpers =====

  /** host/port ที่ backend (รันบน host ไม่ใช่ container) ต่อถึง — ต้องใช้ IP เพราะ Docker DNS ใช้ไม่ได้ */
  private async target(db: ManagedDatabase) {
    const info = managedDbConnectionInfo(db);
    const ip = await this.docker.resolveContainerIp(managedDbContainerName(db.id));
    if (!ip) throw new ServiceUnavailableException('database_not_running');
    return { host: ip, port: info.port, user: info.username, password: db.password, database: info.dbName };
  }

  private getOwnedOrThrow(id: string, account: Account): ManagedDatabase {
    const db = this.store.findById(id);
    if (!db) throw new NotFoundException(`managed_db_not_found:${id}`);
    if (db.accountId !== account.id) throw new ForbiddenException('not_your_database');
    return db;
  }

  private auditLog(account: Account, decision: 'INFO' | 'BLOCK', reason: string): void {
    this.audit.append({ requestId: uuidv4(), accountId: account.id, stage: 'db-console', decision, reason });
  }
}

/**
 * โหลด driver ตอนใช้จริง ไม่ใช่ตอน import module — mysql2/redis ถูกใช้เฉพาะเมื่อ user มี DB
 * ชนิดนั้นจริง และถ้ายังไม่ได้ `pnpm install` จะได้ 503 พร้อมบอกสาเหตุ แทนที่ backend จะ
 * crash ตอน boot ทั้งตัว (บทเรียนจากเหตุ crash-loop 16 ส.ค.)
 */
function loadDriver(name: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name);
  } catch {
    throw new ServiceUnavailableException(`driver_not_installed:${name} — ต้องรัน pnpm install ก่อน`);
  }
}

/** ทำให้ทุกค่าที่ส่งกลับเป็น JSON ได้ — Buffer/Date/BigInt ตรงๆ จะพัง JSON.stringify */
function serializeCell(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return `\\x${v.toString('hex').slice(0, 128)}`;
  if (typeof v === 'object') return v; // jsonb/array — serialize ได้อยู่แล้ว
  return v;
}

function truncate(sql: string): string {
  const flat = sql.replace(/\s+/g, ' ').trim();
  return flat.length > AUDIT_SQL_MAX ? `${flat.slice(0, AUDIT_SQL_MAX)}…` : flat;
}
