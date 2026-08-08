// runtime ที่ pipeline รองรับจริง — แหล่งความจริงเดียวของทั้งหน้า /deploy และแดชบอร์ด
//
// เดิมสองที่ถือลิสต์คนละชุด (แดชบอร์ดมีแค่ node/static พร้อมคอมเมนต์ว่า python/docker ยังไม่รองรับ
// ซึ่งไม่จริงแล้ว) ผลคือกดแก้ไขแอป python จากแดชบอร์ด → select ไม่มี option ที่ตรงกับค่าปัจจุบัน
// แล้วเผลอบันทึกทับเป็น node ได้ — ดู docker-runtime.service.ts ฝั่ง backend ประกอบ
export const RUNTIMES = ['node', 'static', 'python', 'docker'] as const;

export type Runtime = (typeof RUNTIMES)[number];
