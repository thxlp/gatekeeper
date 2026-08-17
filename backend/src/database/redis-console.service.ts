import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Account, ManagedDatabase } from '../common/types';
import { ManagedDbStore } from './managed-db.store';
import { DockerRuntimeService, managedDbConnectionInfo, managedDbContainerName } from '../deploy/docker-runtime.service';
import { AuditService } from '../audit/audit.service';

const CONNECT_TIMEOUT_MS = 5000;
/** จำนวน key ต่อหน้าใน browser — SCAN คืนมาไม่แน่นอน ค่านี้เป็นแค่ COUNT hint + เพดานตัด */
const KEYS_PER_PAGE = Number(process.env.REDIS_CONSOLE_PAGE || 100);
/** ตัดค่าที่ยาวเกินก่อนส่งกลับ — ค่าใน redis เป็น MB ได้ */
const VALUE_MAX_CHARS = 4000;
const COLLECTION_MAX_ITEMS = 200;

/**
 * คำสั่งที่อ่านอย่างเดียว — allowlist ล้วนเหมือนฝั่ง SQL: คำสั่งที่ไม่อยู่ในลิสต์ = บล็อก
 * KEYS ไม่อยู่ในลิสต์โดยตั้งใจ (มันบล็อก event loop ของ redis ทั้งตัวเมื่อ key เยอะ) — ใช้ SCAN แทน
 */
const READ_COMMANDS = new Set([
  'GET', 'MGET', 'STRLEN', 'GETRANGE', 'EXISTS', 'TYPE', 'TTL', 'PTTL', 'SCAN', 'DBSIZE', 'RANDOMKEY',
  'HGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS', 'HSCAN',
  'LRANGE', 'LLEN', 'LINDEX', 'SMEMBERS', 'SCARD', 'SISMEMBER', 'SRANDMEMBER', 'SSCAN',
  'ZRANGE', 'ZREVRANGE', 'ZRANGEBYSCORE', 'ZCARD', 'ZSCORE', 'ZCOUNT', 'ZSCAN',
]);

/** คำสั่งที่เปลี่ยนข้อมูล — อนุญาตแต่ต้องยืนยันก่อน */
const WRITE_COMMANDS = new Set([
  'SET', 'SETEX', 'SETNX', 'SETRANGE', 'GETSET', 'APPEND', 'INCR', 'INCRBY', 'DECR', 'DECRBY',
  'DEL', 'UNLINK', 'EXPIRE', 'PEXPIRE', 'EXPIREAT', 'PERSIST', 'RENAME', 'RENAMENX',
  'HSET', 'HSETNX', 'HDEL', 'HINCRBY', 'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LSET', 'LREM', 'LTRIM',
  'SADD', 'SREM', 'SPOP', 'ZADD', 'ZREM', 'ZINCRBY',
]);

/**
 * ทุกอย่างที่เหลือถูกบล็อกโดยปริยาย — ที่อันตรายเป็นพิเศษและตั้งใจไม่ใส่ไว้ในสองลิสต์บน:
 *  EVAL/EVALSHA/FUNCTION → รัน Lua ได้ = หนีออกจากกรอบคำสั่งทั้งหมด
 *  CONFIG SET dir/dbfilename → เขียนไฟล์ลงดิสก์ที่ไหนก็ได้ = ทางคลาสสิกของการยึดเครื่องผ่าน redis
 *  MODULE LOAD → โหลด .so เข้ามารัน
 *  FLUSHALL/FLUSHDB → ล้างข้อมูลทั้ง DB ในคำสั่งเดียว ระบบยังไม่มี backup
 *  SHUTDOWN/DEBUG/MONITOR/SUBSCRIBE → ล้มหรือค้าง connection
 */

@Injectable()
export class RedisConsoleService {
  constructor(
    private store: ManagedDbStore,
    private docker: DockerRuntimeService,
    private audit: AuditService,
  ) {}

  /** หน้า browser: SCAN ทีละหน้า + TYPE/TTL ต่อ key */
  async listKeys(id: string, account: Account, cursor: string, match: string) {
    const db = this.getOwnedOrThrow(id, account);
    return this.withRedis(db, async (client) => {
      const pattern = (match || '').trim() || '*';
      const res = await client.scan(Number(cursor) || 0, { MATCH: pattern, COUNT: KEYS_PER_PAGE });
      const keys: string[] = (res.keys || []).slice(0, KEYS_PER_PAGE);

      const rows = await Promise.all(
        keys.map(async (key: string) => {
          const [type, ttl] = await Promise.all([client.type(key), client.ttl(key)]);
          return { key, type, ttl }; // ttl: -1 = ไม่หมดอายุ, -2 = ไม่มี key แล้ว
        }),
      );
      return { keys: rows, cursor: String(res.cursor ?? 0), done: Number(res.cursor ?? 0) === 0 };
    });
  }

  /** ดูค่าของ key เดียว — เลือกวิธีอ่านตาม type ให้เอง user ไม่ต้องรู้ว่าต้องใช้คำสั่งไหน */
  async getValue(id: string, account: Account, key: string) {
    const db = this.getOwnedOrThrow(id, account);
    if (!key) throw new BadRequestException('key_required');

    return this.withRedis(db, async (client) => {
      const type = await client.type(key);
      const ttl = await client.ttl(key);

      if (type === 'none') throw new NotFoundException('key_not_found');

      let value: unknown;
      let truncated = false;

      if (type === 'string') {
        const raw = await client.get(key);
        truncated = typeof raw === 'string' && raw.length > VALUE_MAX_CHARS;
        value = truncated ? raw.slice(0, VALUE_MAX_CHARS) : raw;
      } else if (type === 'hash') {
        value = await client.hGetAll(key);
      } else if (type === 'list') {
        value = await client.lRange(key, 0, COLLECTION_MAX_ITEMS - 1);
        truncated = (await client.lLen(key)) > COLLECTION_MAX_ITEMS;
      } else if (type === 'set') {
        value = await client.sMembers(key);
        truncated = (await client.sCard(key)) > COLLECTION_MAX_ITEMS;
      } else if (type === 'zset') {
        value = await client.zRangeWithScores(key, 0, COLLECTION_MAX_ITEMS - 1);
        truncated = (await client.zCard(key)) > COLLECTION_MAX_ITEMS;
      } else {
        value = `(ยังไม่รองรับ type: ${type})`;
      }

      return { key, type, ttl, value, truncated };
    });
  }

  /**
   * command runner — read รันเลย, write ต้อง confirm
   * รอบที่ยังไม่ confirm จะไม่ส่งคำสั่งเข้า redis เลย แต่ไปอ่านสถานะปัจจุบันของ key มาโชว์แทน
   * ว่ากำลังจะทับ/ลบอะไรอยู่ (redis ไม่มี transaction ที่ rollback ได้แบบ SQL จึง preview
   * ด้วยการ "ยังไม่ทำ" อย่างเดียว ไม่ใช่ "ทำแล้วถอย")
   */
  async runCommand(id: string, account: Account, raw: string, confirm: boolean) {
    const db = this.getOwnedOrThrow(id, account);
    const args = tokenize(raw);
    if (!args.length) throw new BadRequestException('empty_command');

    const cmd = args[0].toUpperCase();
    const isRead = READ_COMMANDS.has(cmd);
    const isWrite = WRITE_COMMANDS.has(cmd);

    if (!isRead && !isWrite) {
      this.auditLog(account, 'BLOCK', `redis:command blocked (${cmd}) on ${db.name}`);
      throw new BadRequestException(`command_not_allowed:${cmd}`);
    }

    return this.withRedis(db, async (client) => {
      if (isWrite && !confirm) {
        const key = args[1];
        const current = key ? await this.peekKey(client, key) : null;
        return { preview: true, command: cmd, key: key ?? null, current };
      }

      const result = await client.sendCommand(args);
      if (isWrite) {
        this.auditLog(account, 'INFO', `redis:command ${cmd} ${args[1] ?? ''} on ${db.name}`);
      }
      return { preview: false, command: cmd, result: normalize(result) };
    });
  }

  // ===== helpers =====

  /** สถานะ key ก่อนโดนคำสั่งเขียน — ให้ user เห็นว่ากำลังจะทับอะไร */
  private async peekKey(client: any, key: string) {
    const type = await client.type(key);
    if (type === 'none') return { exists: false };
    const ttl = await client.ttl(key);
    if (type === 'string') {
      const raw = await client.get(key);
      return { exists: true, type, ttl, value: typeof raw === 'string' ? raw.slice(0, 200) : raw };
    }
    return { exists: true, type, ttl };
  }

  private async withRedis<T>(db: ManagedDatabase, fn: (client: any) => Promise<T>): Promise<T> {
    const redis = loadRedis();
    const info = managedDbConnectionInfo(db);
    const ip = await this.docker.resolveContainerIp(managedDbContainerName(db.id));
    if (!ip) throw new ServiceUnavailableException('database_not_running');

    const client = redis.createClient({
      socket: { host: ip, port: info.port, connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: false },
      password: db.password,
    });
    client.on('error', () => undefined); // ไม่งั้น error event ที่ไม่มีคนฟังจะล้ม process

    try {
      await client.connect();
    } catch (err: any) {
      throw new ServiceUnavailableException(`db_connect_failed:${err?.message || 'unknown'}`);
    }

    try {
      return await fn(client);
    } catch (err: any) {
      if (err?.status) throw err; // HttpException ที่เราโยนเองข้างใน ส่งต่อตามเดิม
      throw new BadRequestException(`redis_error: ${err?.message || 'unknown'}`);
    } finally {
      await client.quit().catch(() => undefined);
    }
  }

  private getOwnedOrThrow(id: string, account: Account): ManagedDatabase {
    const db = this.store.findById(id);
    if (!db) throw new NotFoundException(`managed_db_not_found:${id}`);
    if (db.accountId !== account.id) throw new ForbiddenException('not_your_database');
    if (db.engine !== 'redis') throw new BadRequestException('not_a_redis_database');
    return db;
  }

  private auditLog(account: Account, decision: 'INFO' | 'BLOCK', reason: string): void {
    this.audit.append({ requestId: uuidv4(), accountId: account.id, stage: 'db-console', decision, reason });
  }
}

function loadRedis(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('redis');
  } catch {
    throw new ServiceUnavailableException('driver_not_installed:redis — ต้องรัน pnpm install ก่อน');
  }
}

/** แยกคำสั่งเป็น argv โดยเคารพ quote — `SET greeting "hello world"` ต้องได้ 3 ชิ้น ไม่ใช่ 4 */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let has = false;

  for (let i = 0; i < (input || '').length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === '\\' && i + 1 < input.length) {
        cur += input[++i];
      } else if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** ค่าที่ redis คืนมาอาจเป็น Buffer/Map — ทำให้ JSON ได้ก่อนส่งออก */
function normalize(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8').slice(0, VALUE_MAX_CHARS);
  if (Array.isArray(v)) return v.slice(0, COLLECTION_MAX_ITEMS).map(normalize);
  if (typeof v === 'bigint') return v.toString();
  return v;
}
