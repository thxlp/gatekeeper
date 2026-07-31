/** @type {import('next').NextConfig} */
const API_URL = process.env.GATEKEEPER_API_URL || 'http://localhost:8089';

const nextConfig = {
  output: 'standalone',
  // pin ให้ standalone ออกแบบ flat (.next/standalone/server.js) เสมอ — ไม่งั้น Next เดา
  // workspace root จาก lockfile ซึ่งถ้าวันหนึ่งมี package-lock.json โผล่ที่ repo root โครงสร้าง
  // standalone จะย้ายไปอยู่ .next/standalone/frontend/ เงียบๆ แล้ว systemd unit ชี้ path ผิดทันที
  outputFileTracingRoot: __dirname,
  async rewrites() {
    // Proxy สำหรับ dev เท่านั้น (prod ใช้ nginx) — /api/* ทั้งหมดวิ่งเข้า backend โดยตัด prefix /api ออก
    //
    // ⚠️ ต้อง gate ด้วย NODE_ENV จริงๆ ห้ามเชื่อคอมเมนต์อย่างเดียว: rewrites() ถูก evaluate ตอน
    // `next build` แล้วฝังลงใน routes-manifest ทำงานบน prod ด้วย ของเดิมที่ปล่อยไว้ทำให้
    // https://studiodup.com/live/<app-id> (nginx ส่ง location / เข้า Next) ทะลุถึง LiveController
    // = แอปลูกค้ากลับมาอยู่ origin เดียวกับ dashboard อีกครั้ง ซึ่งคือช่องโหว่ที่ตั้งใจปิดไปแล้ว
    // ตอนแยก live.studiodup.com (พบของจริงบน production 2026-07-31 ดู gatekeeper-host.conf)
    // `next build` ตั้ง NODE_ENV=production ให้เองเสมอ ส่วน `next dev` เป็น development → dev ยังใช้ได้ปกติ
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
      {
        source: '/live/:path*',
        destination: `${API_URL}/live/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
