const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const usageFile = path.join(dataDir, 'usage.jsonl');

/**
 * บันทึกทุกครั้งที่มีการ "เรียกใช้สิทธิ์" feature/plugin ไม่ว่าผลจะ allow หรือ block
 * ของจริงควรยิงเข้า Kafka/NATS แล้วลง TimescaleDB/ClickHouse แบบ async
 * ที่นี่ใช้ append JSON line ลงไฟล์เพื่อให้รันได้จริงแบบไม่มี dependency ภายนอก
 */
function recordUsage(event) {
  fs.mkdirSync(dataDir, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  fs.appendFileSync(usageFile, line);
}

module.exports = { recordUsage };
