/** @type {import('next').NextConfig} */
const API_URL = process.env.GATEKEEPER_API_URL || 'http://localhost:8089';

const nextConfig = {
  output: 'standalone',
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
