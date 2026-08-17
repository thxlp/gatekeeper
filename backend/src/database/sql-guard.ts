/**
 * ตัวแยกประเภท SQL ก่อนส่งเข้า managed DB ของ user — ด่านแรกของ SQL console
 *
 * หลักการ: **allowlist ล้วน** คำสั่งที่ไม่รู้จัก = blocked เสมอ (fail-closed) เพราะการไล่
 * แบน keyword อันตรายทีละตัวเป็นเกมที่ฝั่งรับแพ้เสมอ — มี syntax ใหม่เมื่อไหร่ก็หลุดเมื่อนั้น
 *
 * ตัวนี้ไม่ใช่ด่านเดียว: read ถูกบังคับซ้ำด้วย read-only transaction ฝั่ง DB
 * (BEGIN TRANSACTION READ ONLY / START TRANSACTION READ ONLY) ใน db-query.service.ts
 * ต่อให้ classify พลาดจนคิวรีเขียนหลุดมาเป็น read ตัว engine ก็ปฏิเสธเองอยู่ดี
 * ส่วน write ถูกกันด้วย transaction + ต้องยืนยันก่อน commit
 */

export type StatementKind = 'read' | 'write' | 'blocked';

export interface Classification {
  kind: StatementKind;
  /** เหตุผลที่บล็อก — ส่งกลับให้ user เห็นตรงๆ ว่าติดกฎข้อไหน */
  reason?: string;
  /** คำสั่งแรกที่ตรวจเจอ (SELECT/UPDATE/...) ใช้โชว์ใน dialog ยืนยัน + audit log */
  verb?: string;
}

/** คำสั่งที่อ่านอย่างเดียว */
const READ_VERBS = new Set(['SELECT', 'WITH', 'TABLE', 'VALUES', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC']);

/** คำสั่งที่เปลี่ยนข้อมูลในแถว — อนุญาตแต่ต้องยืนยันก่อน commit */
const WRITE_VERBS = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE']);

/**
 * คำที่ห้ามโผล่ที่ตำแหน่งไหนก็ตามในคำสั่ง (ไม่ใช่แค่คำแรก) — ครอบเคสอย่าง
 * `WITH x AS (...) DROP ...` หรือ `EXPLAIN ANALYZE TRUNCATE ...` ที่คำแรกดูไม่มีพิษภัย
 *
 * ลิสต์นี้ **ตั้งใจให้สั้น** ใส่ได้เฉพาะคำที่เป็น reserved word ของทั้ง postgres และ mysql
 * (เอาไปตั้งเป็นชื่อคอลัมน์แบบไม่ใส่ quote ไม่ได้) หรือชื่อฟังก์ชันที่มีแต่ของอันตราย
 *
 * ห้ามใส่คำอย่าง PASSWORD / ROLE / OWNER / COMMENT / USER / STATUS เด็ดขาด — พวกนี้เป็น
 * ชื่อคอลัมน์ที่พบบ่อยมาก ใส่แล้ว `SELECT id, password FROM users` จะถูกบล็อกทั้งที่ไม่มีพิษภัย
 * ของพวกนั้นถูกกันด้วย allowlist ของคำแรกอยู่แล้ว (verb ที่ไม่รู้จัก = blocked)
 */
const BLOCKED_TOKENS = [
  // --- DDL: แก้โครงสร้าง = กู้ไม่ได้ถ้าพลาด (ระบบยังไม่มี backup/restore) ---
  // ทุกตัวเป็น reserved word ทั้งสอง engine → ไม่ชนชื่อคอลัมน์ของ user
  'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
  // --- สิทธิ์: ห้าม user ยกระดับสิทธิ์ตัวเองใน DB ---
  'GRANT', 'REVOKE',
  // --- อ่าน/เขียนไฟล์ + รันคำสั่ง = หนีจาก DB ออกไปที่ filesystem/OS ของ container ---
  // COPY ... FROM PROGRAM ของ postgres คือ RCE ตรงๆ ส่วน LOAD_FILE/OUTFILE คือฝั่ง mysql
  'COPY', 'LOAD_FILE', 'PG_READ_FILE', 'PG_READ_BINARY_FILE', 'PG_LS_DIR', 'PG_STAT_FILE',
  'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'PG_TERMINATE_BACKEND', 'PG_CANCEL_BACKEND',
];

const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_TOKENS.join('|')})\\b`, 'i');

/**
 * วลีอันตรายที่เป็นคำธรรมดาเรียงกัน — แยกจาก BLOCKED_TOKENS เพราะแบนคำเดี่ยวไม่ได้
 * (`INTO` กับ `LOAD` เป็นคำที่ใช้ปกติ แต่ `INTO OUTFILE` / `LOAD DATA` คือเขียนไฟล์ล้วนๆ)
 */
const BLOCKED_PHRASES: Array<{ re: RegExp; label: string }> = [
  { re: /\bINTO\s+OUTFILE\b/i, label: 'INTO OUTFILE' },
  { re: /\bINTO\s+DUMPFILE\b/i, label: 'INTO DUMPFILE' },
  { re: /\bLOAD\s+DATA\b/i, label: 'LOAD DATA' },
  { re: /\bFROM\s+PROGRAM\b/i, label: 'FROM PROGRAM' },
];

/** ชื่อคำสั่งแรก — ใช้ทั้ง classify และโชว์ให้ user */
function firstVerb(sql: string): string {
  const m = /^\s*([A-Za-z_]+)/.exec(sql);
  return m ? m[1].toUpperCase() : '';
}

/**
 * ตัด comment ทิ้ง และแทนที่ string literal ด้วยค่าว่าง เพื่อให้การค้นหา keyword ไม่ไปเจอ
 * คำในข้อมูลของ user เอง (`SELECT * FROM t WHERE note = 'please drop by'` ต้องไม่ถูกบล็อก)
 *
 * เดินทีละตัวอักษรเพราะ regex ล้วนแยก quote ซ้อน/dollar-quote ของ postgres ไม่ได้
 */
export function scrubSql(sql: string): string {
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // -- comment ถึงท้ายบรรทัด
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    // /* block comment */ — postgres ซ้อนชั้นได้ นับ depth เอา
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += ' ';
      continue;
    }

    // $$ ... $$ / $tag$ ... $tag$ ของ postgres (body ของ function เขียนอะไรก็ได้ข้างใน)
    if (ch === '$') {
      const tagMatch = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        out += " '' ";
        continue;
      }
    }

    // string literal: '...' (escape ด้วย '' ซ้อน) และ "..." / `...` ที่เป็นชื่อคอลัมน์
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === '\\' && quote === "'") {
          i += 2; // mysql ยอม backslash escape ใน string
          continue;
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2; // '' = quote ตัวเดียวในข้อมูล ไม่ใช่จบ string
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      // ชื่อที่ถูก quote ("my table") ไม่ใช่ keyword อยู่แล้ว แทนด้วยค่าว่างได้เหมือน string
      out += " '' ";
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/** เหลือคำสั่งเดียวจริงไหม — `SELECT 1; DROP TABLE t` ต้องไม่ผ่านเป็น SELECT */
function hasMultipleStatements(scrubbed: string): boolean {
  const trimmed = scrubbed.replace(/;\s*$/, '');
  return trimmed.includes(';');
}

/**
 * ตัดสินว่าคำสั่งนี้ทำอะไรได้บ้าง — เรียกก่อนแตะ DB เสมอ
 */
export function classifyStatement(rawSql: string): Classification {
  const sql = (rawSql || '').trim();
  if (!sql) return { kind: 'blocked', reason: 'empty_statement' };

  const scrubbed = scrubSql(sql).trim();
  if (!scrubbed) return { kind: 'blocked', reason: 'empty_statement' };

  if (hasMultipleStatements(scrubbed)) {
    return {
      kind: 'blocked',
      reason: 'multiple_statements — รันได้ทีละคำสั่ง (กันการต่อท้ายคำสั่งอันตรายหลัง ;)',
    };
  }

  const verb = firstVerb(scrubbed);
  if (!verb) return { kind: 'blocked', reason: 'unparsable_statement' };

  const blocked = BLOCKED_RE.exec(scrubbed);
  if (blocked) {
    return { kind: 'blocked', verb, reason: `blocked_keyword:${blocked[1].toUpperCase()}` };
  }

  for (const phrase of BLOCKED_PHRASES) {
    if (phrase.re.test(scrubbed)) {
      return { kind: 'blocked', verb, reason: `blocked_keyword:${phrase.label}` };
    }
  }

  // เจตนาเป็น write ไหม ดูทั้งคำสั่งไม่ใช่แค่คำแรก — postgres เขียนผ่าน CTE ได้
  // (`WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d` คำแรกคือ WITH แต่ลบจริง)
  const writeInside = new RegExp(`\\b(${[...WRITE_VERBS].join('|')})\\b`, 'i').exec(scrubbed);

  if (WRITE_VERBS.has(verb)) return { kind: 'write', verb };
  if (READ_VERBS.has(verb)) {
    if (writeInside) return { kind: 'write', verb: writeInside[1].toUpperCase() };
    return { kind: 'read', verb };
  }

  return { kind: 'blocked', verb, reason: `verb_not_allowed:${verb}` };
}

/**
 * ครอบ LIMIT ให้คิวรีอ่าน เพื่อไม่ให้ผลลัพธ์ล้าน row วิ่งเข้ามากิน RAM ของ backend
 * (เครื่องจริงมี RAM 2GB และ backend แชร์กับทุกอย่าง) — ครอบเฉพาะ verb ที่ครอบแล้วยัง valid
 * ทั้ง postgres/mysql; SHOW/EXPLAIN/DESCRIBE ครอบไม่ได้ ปล่อยผ่านแล้วไปตัดที่ฝั่ง client แทน
 */
export function wrapWithLimit(sql: string, verb: string, limit: number): string | null {
  if (!['SELECT', 'WITH', 'TABLE', 'VALUES'].includes(verb)) return null;
  const bare = sql.trim().replace(/;\s*$/, '');
  return `SELECT * FROM (${bare}) AS _gk_q LIMIT ${limit}`;
}
