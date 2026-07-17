const express = require('express');

const app = express();

// สำคัญ: ต้องฟัง PORT จาก environment เสมอ — ระบบ deploy จะตั้งค่าให้ (default 8080)
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('<h1>สวัสดี! แอป Node.js ของคุณ deploy สำเร็จแล้ว 🎉</h1><p>แก้ไขไฟล์ server.js เพื่อเริ่มงานของคุณ</p>');
});

// route สำหรับ healthcheck — ตอบเร็วๆ ไม่ต้องมี logic
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`listening on port ${port}`);
});
