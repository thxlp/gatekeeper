// ตัวช่วย "เดา/แนะนำ" custom domain ในแท็บ Domains — ฝั่ง client ล้วน ไม่แตะ DNS/cert
// backend ยังเป็นคนตัดสินสุดท้ายเสมอ (DOMAIN_RE + isReservedDomain + domainPointsToUs ใน domain.util.ts)

// public suffix แบบ 2 ชั้นที่เจอบ่อย — ใช้แยกว่า "โดเมนที่จดทะเบียน" จบตรงไหน เพื่อจะได้รู้ว่า
// สิ่งที่ user พิมพ์เป็น apex (customer.co.th) หรือ subdomain อยู่แล้ว (app.customer.co.th)
// ไม่ได้ใช้ public suffix list เต็ม (ใหญ่เกินจำเป็น) — พลาดแล้วผลแค่คำแนะนำเพี้ยน ไม่กระทบการออก cert
const MULTI_PART_SUFFIXES = [
  'co.th', 'ac.th', 'or.th', 'go.th', 'in.th', 'net.th', 'mi.th',
  'co.uk', 'org.uk', 'me.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'or.jp', 'ne.jp',
  'com.sg', 'com.my', 'com.vn', 'co.id', 'com.ph',
  'com.cn', 'com.tw', 'com.hk', 'co.kr',
  'com.br', 'com.mx', 'co.nz', 'co.za',
];

/** เหตุผลของคำเตือน — ไฟล์นี้ไม่ผูกกับภาษา ฝั่ง UI เอา code ไปแปลเองผ่าน t() */
export type DomainWarningCode =
  /** มีจุดแต่มีอักขระที่ใช้ไม่ได้ เช่น เว้นวรรค/อักษรไทย */
  | 'invalidShape'
  /** ไม่ใช่โดเมนเต็ม (ไม่มีจุด) */
  | 'notFqdn'
  /** โดเมนของระบบเอง — เคลมไม่ได้ (เป็นเคสเดียวที่ valid แล้วยังกดเพิ่มไม่ได้) */
  | 'reserved'
  /** apex/naked domain — CNAME ที่ระดับนี้ไม่ได้ตาม RFC 1034 (เตือนเฉยๆ ยังกดเพิ่มได้) */
  | 'apex'
  /** เพิ่มโดเมนนี้ไปแล้ว */
  | 'duplicate';

export interface DomainWarning {
  code: DomainWarningCode;
  /** ค่าที่ต้องเสียบใน {placeholder} ของข้อความแปล */
  params?: Record<string, string>;
}

export interface DomainGuess {
  /** โดเมนที่ normalize แล้ว (พร้อมส่งเข้า API) — '' ถ้าว่าง */
  normalized: string;
  /** true เมื่อพิมพ์ครบและหน้าตาถูกต้อง */
  valid: boolean;
  /** true เมื่อเป็น apex/naked domain เช่น customer.com — CNAME ที่ apex ไม่ได้ตาม RFC 1034 */
  isApex: boolean;
  /** ส่วนโดเมนที่จดทะเบียน เช่น app.customer.co.th → customer.co.th */
  registrable: string;
  /** คำเตือนที่ควรโชว์ใต้ช่อง input (null = ไม่มี) */
  warning: DomainWarning | null;
  /** subdomain ที่แนะนำให้กดเติม (ไม่ซ้ำกับที่เพิ่มไปแล้ว) */
  suggestions: string[];
}

/**
 * รับสิ่งที่ user พิมพ์/แปะมาแล้วเดาให้เป็นโดเมนล้วน — คนมักแปะ URL เต็มมาทั้งดุ้น
 * เช่น "https://App.Customer.com:8080/path?x=1" → "app.customer.com"
 */
export function normalizeDomainInput(raw: string): string {
  let s = (raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // ตัด scheme
  s = s.replace(/^[^/@]*@/, ''); // ตัด user:pass@
  s = s.split(/[/?#]/)[0]; // ตัด path/query/hash
  s = s.split(':')[0]; // ตัด port
  s = s.replace(/\.+$/, ''); // ตัดจุดท้าย (FQDN แบบมี root dot)
  return s;
}

/** แยกว่าโดเมนที่จดทะเบียนคือส่วนไหน (รองรับ suffix 2 ชั้นแบบ co.th) */
export function registrableDomain(host: string): string {
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.includes(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.');
  return lastTwo;
}

/** ทำชื่อโปรเจกต์/repo ให้เป็น label ที่ใช้เป็น subdomain ได้ ('' ถ้าเหลือไม่พอ) */
export function slugifyLabel(name?: string): string {
  const slug = (name || '')
    .toLowerCase()
    .replace(/^.*\//, '') // repoFullName "owner/repo" → "repo"
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : '';
}

// หน้าตาโดเมนที่ backend ยอมรับ — คงกฎเดียวกับ DOMAIN_RE ใน backend/src/domain/domain.util.ts
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function isValidDomainShape(d: string): boolean {
  return DOMAIN_RE.test(d);
}

const COMMON_LABELS = ['app', 'www', 'api', 'staging'];

export interface GuessOptions {
  /** ชื่อโปรเจกต์/repo ของแอป ใช้เดา subdomain ที่ตรงกับงาน */
  appName?: string;
  /** โดเมนที่เพิ่มไปแล้ว — กันแนะนำซ้ำ */
  existing?: string[];
  /** host ของ live origin (เช่น live.studiodup.com) — โดเมนของระบบเองห้ามเคลม */
  liveOriginHost?: string;
  /** จำนวน suggestion สูงสุด */
  limit?: number;
}

export function guessDomain(raw: string, opts: GuessOptions = {}): DomainGuess {
  const normalized = normalizeDomainInput(raw);
  const existing = new Set((opts.existing || []).map((d) => d.toLowerCase()));
  const limit = opts.limit ?? 4;
  const empty: DomainGuess = {
    normalized,
    valid: false,
    isApex: false,
    registrable: '',
    warning: null,
    suggestions: [],
  };
  if (!normalized) return empty;

  const registrable = registrableDomain(normalized);
  const valid = isValidDomainShape(normalized);
  const isApex = valid && normalized === registrable;

  // โดเมนของระบบเอง — backend จะปฏิเสธอยู่แล้ว บอกตั้งแต่ยังไม่กดจะได้ไม่เสียเที่ยว
  const reservedBase = opts.liveOriginHost ? registrableDomain(normalizeDomainInput(opts.liveOriginHost)) : '';
  const isReserved = !!reservedBase && (normalized === reservedBase || normalized.endsWith('.' + reservedBase));

  let warning: DomainWarning | null = null;
  if (!valid) {
    warning = { code: normalized.includes('.') ? 'invalidShape' : 'notFqdn' };
  } else if (isReserved) {
    warning = { code: 'reserved', params: { base: reservedBase } };
  } else if (isApex) {
    warning = { code: 'apex', params: { domain: normalized } };
  } else if (existing.has(normalized)) {
    warning = { code: 'duplicate' };
  }

  // แนะนำเฉพาะตอนที่พิมพ์เป็น apex — ถ้าพิมพ์ subdomain มาแล้วก็ไม่ต้องเดาให้
  const suggestions: string[] = [];
  if (valid && isApex && !isReserved) {
    const appLabel = slugifyLabel(opts.appName);
    for (const label of appLabel ? [appLabel, ...COMMON_LABELS] : COMMON_LABELS) {
      const candidate = `${label}.${registrable}`;
      if (candidate === normalized || existing.has(candidate) || suggestions.includes(candidate)) continue;
      if (!isValidDomainShape(candidate)) continue;
      suggestions.push(candidate);
      if (suggestions.length >= limit) break;
    }
  }

  return { normalized, valid, isApex, registrable, warning, suggestions };
}
