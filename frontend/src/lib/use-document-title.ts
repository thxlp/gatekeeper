'use client';

import { useEffect } from 'react';

export const APP_NAME = 'Gatekeeper';

/**
 * ตั้งชื่อบนแท็บเบราว์เซอร์เป็น "<ชื่อหน้า> · Gatekeeper"
 *
 * ทำไมไม่ใช้ `export const metadata` ของ Next: ทุกหน้าในแดชบอร์ดเป็น client component
 * (ใช้ hook/state กันหมด) ซึ่ง export metadata ไม่ได้ — และเว็บเป็น SPA ตัว Next จะไม่รีเซ็ต
 * <title> ให้เองตอนเปลี่ยนหน้า ค่าเก่าจึงค้างข้ามหน้าไปเรื่อยๆ (บั๊กที่แก้อยู่นี้)
 *
 * ส่งชื่อหน้าที่แปลแล้วเข้ามา (ผ่าน t() ของ i18n) ชื่อบนแท็บจะได้สลับไทย/อังกฤษตามที่ผู้ใช้เลือก
 * ส่ง null = "หน้านี้ตั้งชื่อเอง อย่าไปแตะ" ใช้กับหน้าที่ชื่อขึ้นกับข้อมูลที่โหลดมา เช่น /apps/[id]
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
