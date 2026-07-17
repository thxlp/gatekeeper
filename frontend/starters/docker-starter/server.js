// แอปตัวอย่างแบบไม่มี dependency — ใช้ node:http ล้วน
const http = require('http');

// สำคัญ: ฟัง PORT จาก environment และ bind ที่ 0.0.0.0
const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>สวัสดี! container ของคุณ deploy สำเร็จแล้ว 🎉</h1><p>แก้ไข Dockerfile และ server.js เพื่อเริ่มงานของคุณ</p>');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`listening on port ${port}`);
});
