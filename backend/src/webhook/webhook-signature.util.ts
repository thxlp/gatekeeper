import * as crypto from 'crypto';

/**
 * ตรวจ GitHub's X-Hub-Signature-256: sha256=<hmac-hex ของ raw request body>
 * ต้องใช้ raw body (bytes ก่อนแปลงเป็น JSON) มิฉะนั้น signature จะไม่ match
 * แม้ payload หน้าตาเหมือนกันทุกประการ (whitespace/key-order ต่างกันก็ทำให้ HMAC ต่างแล้ว)
 */
export function isValidGithubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
