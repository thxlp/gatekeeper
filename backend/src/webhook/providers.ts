import * as crypto from 'crypto';
import { GitProvider } from '../common/types';
import { isValidGithubSignature } from './webhook-signature.util';

// ผลลัพธ์ที่ normalize แล้วจาก payload ของแต่ละ provider — pipeline ใช้แค่ 4 ฟิลด์นี้
export interface ParsedPush {
  event: 'ping' | 'push' | 'other';
  repoFullName?: string;
  ref?: string; // refs/heads/<branch>
  deleted?: boolean;
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** แกะ event/repo/ref/deleted จาก header+payload ตาม provider */
export function parseWebhook(provider: GitProvider, headers: Record<string, any>, payload: any): ParsedPush {
  if (provider === 'gitlab') {
    const ev = String(headers['x-gitlab-event'] || '');
    if (!ev) return { event: 'other' };
    if (ev !== 'Push Hook') return { event: 'other' };
    return {
      event: 'push',
      repoFullName: payload?.project?.path_with_namespace,
      ref: payload?.ref,
      deleted: payload?.after === ZERO_SHA, // ลบ branch → after เป็น all-zero
    };
  }
  if (provider === 'bitbucket') {
    const ev = String(headers['x-event-key'] || '');
    if (ev === 'diagnostics:ping') return { event: 'ping' };
    if (ev !== 'repo:push') return { event: 'other' };
    const change = payload?.push?.changes?.[0];
    const branch = change?.new?.name;
    return {
      event: 'push',
      repoFullName: payload?.repository?.full_name,
      ref: branch ? `refs/heads/${branch}` : undefined,
      deleted: !change?.new, // new === null → branch ถูกลบ
    };
  }
  // github (default)
  const ev = String(headers['x-github-event'] || '');
  if (ev === 'ping') return { event: 'ping' };
  if (ev !== 'push') return { event: 'other' };
  return {
    event: 'push',
    repoFullName: payload?.repository?.full_name,
    ref: payload?.ref,
    deleted: Boolean(payload?.deleted),
  };
}

/**
 * ยืนยันว่า webhook มาจากเจ้าของ repo จริง ตามกลไกของแต่ละ provider:
 *   github    — HMAC-SHA256 (X-Hub-Signature-256)
 *   gitlab    — secret token ตรงๆ (X-Gitlab-Token)
 *   bitbucket — cloud ไม่เซ็น payload: ใช้ secret ใน query (?token=) ของ webhook URL;
 *               ถ้ามี X-Hub-Signature (Bitbucket Server = HMAC) รองรับด้วย
 */
export function verifyWebhook(
  provider: GitProvider,
  rawBody: Buffer,
  headers: Record<string, any>,
  query: Record<string, any>,
  secret: string,
): boolean {
  if (!secret) return false;
  if (provider === 'gitlab') {
    return safeEqual(String(headers['x-gitlab-token'] || ''), secret);
  }
  if (provider === 'bitbucket') {
    const sig = String(headers['x-hub-signature'] || '');
    if (sig) {
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return safeEqual(sig, expected);
    }
    return safeEqual(String(query?.token || ''), secret);
  }
  return isValidGithubSignature(rawBody, String(headers['x-hub-signature-256'] || ''), secret);
}
