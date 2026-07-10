import { lookup } from 'node:dns/promises';
import * as dns from 'node:dns';
import * as net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * Egress guard สำหรับทุก request ที่ backend fetch ออกไปยัง URL ที่ลูกค้ากำหนดเอง
 * (plugin base_url) — กัน SSRF แบบ enforce ไม่ใช่แค่ advisory score
 *
 * ครอบคลุม 3 ชั้น:
 * 1. hostname เถื่อน — internal DNS ของ docker network (`postgres`, `backend-1`,
 *    `docker-socket-proxy` = ชื่อไม่มีจุด) และ suffix ภายใน (.local, .internal ฯลฯ)
 * 2. IP ต้องเป็น public เท่านั้น — private/loopback/link-local (รวม cloud metadata
 *    169.254.169.254)/CGNAT/multicast ทั้ง IPv4, IPv6 และ IPv4-mapped IPv6
 * 3. DNS rebinding — ตรวจซ้ำที่ connect time ผ่าน custom lookup ของ undici Agent
 *    (ตรวจก่อน fetch อย่างเดียวไม่พอ เพราะ attacker สลับ DNS record ระหว่างสอง lookup ได้)
 *    redirect ทุก hop ก็ผ่าน guard เดียวกันเพราะใช้ dispatcher เดิม
 *
 * ปิด guard ได้เฉพาะ dev ด้วย EGRESS_ALLOW_PRIVATE=1 (ห้ามตั้งใน production)
 */

const ALLOW_PRIVATE = process.env.EGRESS_ALLOW_PRIVATE === '1';

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

export class EgressBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`egress_blocked:${reason}`);
    this.name = 'EgressBlockedError';
  }
}

function isForbiddenIPv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  return (
    o[0] === 0 || // 0.0.0.0/8
    o[0] === 10 ||
    o[0] === 127 ||
    (o[0] === 100 && o[1] >= 64 && o[1] <= 127) || // CGNAT 100.64/10
    (o[0] === 169 && o[1] === 254) || // link-local + cloud metadata
    (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
    (o[0] === 192 && o[1] === 168) ||
    (o[0] === 198 && (o[1] === 18 || o[1] === 19)) || // benchmark 198.18/15
    o[0] >= 224 // multicast + reserved + broadcast
  );
}

export function isForbiddenAddress(ip: string): boolean {
  if (ALLOW_PRIVATE) return false;
  if (net.isIPv4(ip)) return isForbiddenIPv4(ip);
  if (!net.isIPv6(ip)) return true; // parse ไม่ออก = ไม่ปล่อย
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // IPv4-mapped/translated (::ffff:a.b.c.d) ตรวจตามกฎ IPv4
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isForbiddenIPv4(mapped[1]);
  const head = parseInt(lower.split(':')[0] || '0', 16);
  if (head >= 0xfe80 && head <= 0xfebf) return true; // link-local fe80::/10
  if (head >= 0xfc00 && head <= 0xfdff) return true; // ULA fc00::/7
  if (head >= 0xff00) return true; // multicast
  return false;
}

function forbiddenHostnameReason(hostname: string): string | null {
  if (ALLOW_PRIVATE) return null;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost') return 'localhost';
  // ชื่อไม่มีจุด = docker/internal DNS (postgres, backend-1, docker-socket-proxy, ...)
  if (!net.isIP(host) && !host.includes('.')) return `internal_hostname:${host}`;
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) return `internal_domain:${host}`;
  }
  return null;
}

/**
 * ตรวจ URL ก่อนรับเข้า store (ตอน register/update plugin) — โยน EgressBlockedError
 * พร้อมเหตุผลถ้าไม่ผ่าน ตรวจทั้ง hostname และ resolve DNS จริงทุก address
 */
export async function assertSafeEgressUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EgressBlockedError('invalid_url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EgressBlockedError(`protocol:${url.protocol}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // ตัด [] ของ IPv6 literal
  const hostReason = forbiddenHostnameReason(hostname);
  if (hostReason) throw new EgressBlockedError(hostReason);

  if (net.isIP(hostname)) {
    if (isForbiddenAddress(hostname)) throw new EgressBlockedError(`private_ip:${hostname}`);
    return;
  }

  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new EgressBlockedError(`dns_resolve_failed:${hostname}`);
  }
  for (const { address } of addrs) {
    if (isForbiddenAddress(address)) {
      throw new EgressBlockedError(`resolves_to_private:${hostname}=${address}`);
    }
  }
}

// custom lookup ที่ undici เรียกตอนจะเปิด TCP connection จริง — จุดเดียวที่กัน
// DNS rebinding ได้ เพราะ address ที่ตรวจคือ address ที่ connect จริง
function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void,
): void {
  const hostReason = forbiddenHostnameReason(hostname);
  if (hostReason) {
    callback(new EgressBlockedError(hostReason) as any, undefined as any);
    return;
  }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, undefined as any);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isForbiddenAddress(a.address));
    if (bad) {
      callback(new EgressBlockedError(`resolves_to_private:${hostname}=${bad.address}`) as any, undefined as any);
      return;
    }
    if ((options as any).all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

// redirect ทุก hop ปลอดภัยเพราะ fetch dispatch ผ่าน Agent เดิม → guardedLookup ตรวจทุก connection
const guardedAgent = new Agent({
  connect: { lookup: guardedLookup as any },
});

/**
 * fetch ที่บังคับผ่าน egress guard — ใช้แทน global fetch ทุกครั้งที่ URL มาจากลูกค้า
 * โยน EgressBlockedError ถ้าปลายทาง (รวม redirect) ชี้เข้า internal network
 */
export async function safeEgressFetch(
  url: string,
  init?: Parameters<typeof undiciFetch>[1],
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  await assertSafeEgressUrl(url);
  try {
    return await undiciFetch(url, { ...init, dispatcher: guardedAgent } as any);
  } catch (err: any) {
    // undici ห่อ lookup error ไว้ใน cause — แกะออกมาให้ caller เห็นเหตุผลจริง
    const cause = err?.cause;
    if (cause instanceof EgressBlockedError) throw cause;
    if (err instanceof EgressBlockedError) throw err;
    throw err;
  }
}
