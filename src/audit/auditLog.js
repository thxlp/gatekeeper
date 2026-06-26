const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const auditFile = path.join(dataDir, 'audit.log');

/**
 * บันทึกทุก decision (รวมถึง ALLOW) แบบ append-only ลงไฟล์
 * Production จริง: ต้อง ship ออกนอกโฮสต์ทันที (Loki/ELK/SIEM) + เก็บแบบ WORM (เช่น S3 Object Lock)
 * เพื่อให้ถึงแม้ host ตัวนี้ถูกยึดทั้งหมด ก็ยังมี evidence อยู่ที่อื่น
 */
function append(entry) {
  fs.mkdirSync(dataDir, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(auditFile, line, { flag: 'a' });
}

module.exports = { append };
