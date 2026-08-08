'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { th } from './locales/th';
import { en } from './locales/en';

export type Lang = 'th' | 'en';
export type Dict = typeof th;
export type MsgKey = keyof Dict;

const STORAGE_KEY = 'gk_lang';
const DICTS: Record<Lang, Dict> = { th, en };

// ค่าที่ prerender ตอน build (ไม่มี window) — ต้องตรงกับ lang บน <html> ใน layout.tsx
const SERVER_LANG: Lang = 'th';

function normalize(v: string | null | undefined): Lang | null {
  return v === 'th' || v === 'en' ? v : null;
}

// ลำดับการเลือกภาษา: ที่ user เคยเลือกไว้ → ภาษาเบราว์เซอร์ (ไทย = th, อื่นๆ = en)
// ตรงกับ NO_FLASH_LANG_SCRIPT ใน app/layout.tsx — แก้ที่ไหนต้องแก้ทั้งสองที่
export function detectLang(): Lang {
  try {
    const stored = normalize(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
    const nav = navigator.languages?.[0] || navigator.language || '';
    return nav.toLowerCase().startsWith('th') ? 'th' : 'en';
  } catch {
    return SERVER_LANG;
  }
}

// ===== external store =====
// useSyncExternalStore จัดการ hydration ให้เอง: render แรกใช้ getServerSnapshot (= ค่าที่
// prerender ไว้) แล้ว re-render ด้วยค่าจริงทันทีหลัง hydrate — ไม่มี hydration mismatch
// warning แบบที่ useState+useEffect ทำ
let cached: Lang | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Lang {
  if (cached === null) cached = detectLang();
  return cached;
}

function getServerSnapshot(): Lang {
  return SERVER_LANG;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // แท็บอื่นเปลี่ยนภาษา → sync ตาม
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cached = normalize(e.newValue) ?? detectLang();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode — เปลี่ยนได้ในเซสชันนี้ แต่จำไม่ได้ */
  }
  cached = next;
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

// ===== hook =====

export type TFunc = (key: MsgKey, vars?: Record<string, string | number>) => string;

// BCP-47 tag สำหรับ toLocaleString/toLocaleDateString — en-GB เพราะรูปแบบวันที่
// (วัน/เดือน/ปี + นาฬิกา 24 ชม.) ใกล้ของเดิมที่เคยใช้ th-TH มากกว่า en-US
export function localeTag(lang: Lang): string {
  return lang === 'th' ? 'th-TH' : 'en-GB';
}

// แทนที่ตัวแปรในรูปแบบ {name} — ค่าที่ไม่มีใน vars ปล่อยไว้ตามเดิมให้เห็นชัดว่าลืมส่ง
function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const t = useCallback<TFunc>(
    (key, vars) => {
      // en ถูก type ให้มีคีย์ครบเท่า th อยู่แล้ว (ดู locales/en.ts) — fallback ไว้กันเคส
      // ข้อความว่างที่หลุดมาระหว่างเพิ่มคีย์ใหม่
      const msg = DICTS[lang][key] || th[key] || key;
      return format(msg, vars);
    },
    [lang],
  );

  return { lang, setLang, t };
}

// สำหรับ helper นอก React (เช่น ฟังก์ชันแปลง error ใน lib/) ที่เรียกตอน event ไม่ใช่ตอน render
export function translate(key: MsgKey, vars?: Record<string, string | number>): string {
  const msg = DICTS[getSnapshot()][key] || th[key] || key;
  return format(msg, vars);
}
