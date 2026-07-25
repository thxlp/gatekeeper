import { promises as dns } from 'dns';

// FQDN ตัวพิมพ์เล็ก อย่างน้อย 2 label — ใช้ทั้ง validate ก่อนเก็บ และก่อนส่งเข้า certbot (arg)
export const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

// โดเมนของระบบเอง — ห้ามลูกค้าเคลม (กัน hijack dashboard/live origin)
const RESERVED_SUFFIXES = (process.env.RESERVED_DOMAINS || 'studiodup.com').split(',').map((s) => s.trim());

export function normalizeDomain(input: string): string {
  return (input || '').trim().toLowerCase().replace(/\.$/, '');
}

export function isValidDomain(d: string): boolean {
  return DOMAIN_RE.test(d);
}

export function isReservedDomain(d: string): boolean {
  return RESERVED_SUFFIXES.some((r) => r && (d === r || d.endsWith('.' + r)));
}

/**
 * เช็คว่า DNS ของโดเมนชี้มาที่ live origin ของเราจริง (CNAME → liveHost หรือ A ตรง IP ของ liveHost)
 * เป็นแค่ pre-check ก่อนเรียก certbot — ตัว certbot (HTTP-01) เป็นคนตัดสินจริงอีกชั้น
 */
export async function domainPointsToUs(domain: string, liveHost: string): Promise<{ ok: boolean; detail: string }> {
  const expectedIps = await dns.resolve4(liveHost).catch(() => [] as string[]);
  const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
  if (cnames.some((c) => normalizeDomain(c) === liveHost)) {
    return { ok: true, detail: `CNAME → ${liveHost}` };
  }
  const aRecords = await dns.resolve4(domain).catch(() => [] as string[]);
  if (expectedIps.length && aRecords.some((ip) => expectedIps.includes(ip))) {
    return { ok: true, detail: `A → ${aRecords.join(', ')}` };
  }
  return {
    ok: false,
    detail: `DNS ยังไม่ชี้มาที่ ${liveHost} (พบ CNAME=${cnames.join(',') || '-'} A=${aRecords.join(',') || '-'})`,
  };
}
