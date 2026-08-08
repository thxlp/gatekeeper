'use client';

import { th } from './locales/th';
import { translate, type MsgKey } from './i18n';

// ── แปลง error code ดิบจาก backend → ข้อความที่ผู้ใช้อ่านรู้เรื่อง ──────────────────
//
// backend โยน code เป็น snake_case อังกฤษ (invalid_api_key, deploy_already_in_progress, …)
// ซึ่งเดิมถูกยิงขึ้นหน้าจอตรงๆ — ผู้ใช้เห็นภาษาเครื่องล้วน และไม่เปลี่ยนตามภาษาที่เลือกไว้
//
// รายชื่อ code ที่รองรับ "อนุมานจากพจนานุกรมเอง": ทุกคีย์ที่ขึ้นต้นด้วย err. ใน locales/th.ts
// = code ที่แปลได้ เพิ่มคีย์ที่นั่นที่เดียวก็ใช้ได้เลย ไม่ต้องมาแก้ลิสต์ซ้ำที่นี่
// (en.ts ถูก type บังคับให้มีคีย์ครบเท่า th อยู่แล้ว)
const KNOWN_CODES = new Set(
  Object.keys(th)
    .filter((k) => k.startsWith('err.'))
    .map((k) => k.slice(4)),
);

// code ที่ backend ต่อคำอธิบายท้ายมาให้แล้ว เช่น
//   "quota_exceeded — ทรัพยากรรวมของบัญชีจะเป็น RAM 1200/1024 MB, …"
// ตัดคำแรกมาเทียบ ถ้ารู้จักก็แปลหัวแล้วคงส่วนหางไว้ (หางมีรายละเอียดที่ช่วยผู้ใช้จริง)
const HEAD_SPLIT = /^([a-z][a-z0-9_]{2,})(?:[\s:—-]+([\s\S]+))?$/;

export function messageForCode(raw: string): string {
  const code = typeof raw === 'string' ? raw.trim() : String(raw ?? '');
  if (!code) return translate('err.unknown');

  if (KNOWN_CODES.has(code)) return translate(`err.${code}` as MsgKey);

  const m = HEAD_SPLIT.exec(code);
  if (m && KNOWN_CODES.has(m[1])) {
    const head = translate(`err.${m[1]}` as MsgKey);
    return m[2] ? `${head} — ${m[2]}` : head;
  }

  // ไม่รู้จัก = แสดงของเดิม (ยัง grep หา/แจ้งบั๊กได้) แทนที่จะกลืนเป็นข้อความกลางๆ
  return code;
}

// Error ที่ทุก request จาก lib/api.ts โยนออกมา
//
// .code = รหัสดิบ (เอาไว้เทียบเงื่อนไขในโค้ด — ห้ามเทียบกับ .message เพราะโดนแปลแล้ว)
// .message = ข้อความที่แปลแล้ว ทำเป็น getter จึงแปลตอน "อ่าน" ไม่ใช่ตอนโยน → ผู้ใช้สลับ
//            ภาษาระหว่างที่ banner ค้างอยู่ ข้อความก็เปลี่ยนตาม
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    // ไม่ส่ง message เข้า super() — Error จะสร้าง own property 'message' ทับ getter ด้านล่างทันที
    super();
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    Object.defineProperty(this, 'message', {
      get: () => messageForCode(code),
      configurable: true,
    });
  }
}
