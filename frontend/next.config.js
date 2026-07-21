/** @type {import('next').NextConfig} */
const API_URL = process.env.GATEKEEPER_API_URL || 'http://localhost:8089';

const nextConfig = {
  output: 'standalone',
  // pin ให้ standalone ออกแบบ flat (.next/standalone/server.js) เสมอ — ไม่งั้น Next เดา
  // workspace root จาก lockfile ซึ่งถ้าวันหนึ่งมี package-lock.json โผล่ที่ repo root โครงสร้าง
  // standalone จะย้ายไปอยู่ .next/standalone/frontend/ เงียบๆ แล้ว systemd unit ชี้ path ผิดทันที
  outputFileTracingRoot: __dirname,
  async rewrites() {
    // Dev-only proxy (prod ใช้ nginx) — /api/* ทั้งหมดวิ่งเข้า backend โดยตัด prefix /api ออก
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
