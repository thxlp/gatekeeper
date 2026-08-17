import { DbEngine } from '@/types';

// ชื่อ + ไอคอนของแต่ละ engine — ใช้ร่วมกันระหว่างหน้ารายการ (/databases) กับหน้า console
// (/databases/[id]) ชื่อเหล่านี้เป็นชื่อผลิตภัณฑ์ ไม่ต้องแปลตามภาษา
export const ENGINES: { key: DbEngine; label: string; icon: string }[] = [
  { key: 'postgres', label: 'PostgreSQL', icon: 'ph-database' },
  { key: 'redis', label: 'Redis', icon: 'ph-lightning' },
  { key: 'mysql', label: 'MySQL', icon: 'ph-hard-drives' },
];

/** engine ที่ไม่รู้จัก (ของเก่า/ข้อมูลเพี้ยน) ตกมาที่ postgres แทนที่จะพังทั้งหน้า */
export const engineMeta = (e: string) => ENGINES.find((x) => x.key === e) ?? ENGINES[0];
