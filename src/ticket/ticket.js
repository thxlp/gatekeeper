const crypto = require('crypto');

// Production: ดึงจาก secret manager (Vault/KMS) ห้าม hardcode/commit ค่าจริงเด็ดขาด
const SECRET = process.env.GATEKEEPER_TICKET_SECRET || 'dev-secret-change-me';

/**
 * ออก ticket ที่เซ็นด้วย HMAC-SHA256 อายุสั้น (default 60s)
 * Orchestrator จะ "เชื่อ" เฉพาะ ticket ที่ verify ผ่านเท่านั้น — ไม่เชื่อ caller โดยตรง
 * นี่คือ boundary ที่กัน bypass เส้นทาง deploy ตรงๆ โดยข้าม Gatekeeper
 */
function sign(payload, ttlSeconds = 60) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlSeconds * 1000 };
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verify(ticketStr) {
  if (!ticketStr || typeof ticketStr !== 'string' || !ticketStr.includes('.')) {
    return { valid: false, reason: 'malformed_ticket' };
  }
  const [b64, sig] = ticketStr.split('.');
  const expectedSig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  // constant-time compare กัน timing attack ตอนเทียบ signature
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }

  const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
  if (Date.now() > payload.exp) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, payload };
}

module.exports = { sign, verify };
