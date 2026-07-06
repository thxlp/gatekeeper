/** @type {import('next').NextConfig} */
const V1_URL = process.env.GATEKEEPER_V1_URL || 'http://localhost:8088';
const V2_URL = process.env.GATEKEEPER_V2_URL || 'http://localhost:8089';

const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/v1/deploy',
        destination: `${V1_URL}/deploy`,
      },
      {
        source: '/api/v1/healthz',
        destination: `${V1_URL}/healthz`,
      },
      {
        source: '/api/v2/plugins/:path*',
        destination: `${V2_URL}/plugins/:path*`,
      },
      {
        source: '/api/v2/audit',
        destination: `${V2_URL}/audit`,
      },
      {
        source: '/api/v2/audit/:path*',
        destination: `${V2_URL}/audit/:path*`,
      },
      {
        source: '/api/v2/healthz',
        destination: `${V2_URL}/healthz`,
      },
      {
        source: '/api/v2/apps/:path*',
        destination: `${V2_URL}/apps/:path*`,
      },
      {
        source: '/api/v2/github/:path*',
        destination: `${V2_URL}/github/:path*`,
      },
      {
        source: '/api/v2/challenge',
        destination: `${V2_URL}/challenge`,
      },
      {
        source: '/api/v2/challenge/:path*',
        destination: `${V2_URL}/challenge/:path*`,
      },
      {
        source: '/api/v2/auth',
        destination: `${V2_URL}/auth`,
      },
      {
        source: '/api/v2/auth/:path*',
        destination: `${V2_URL}/auth/:path*`,
      },
      {
        source: '/live/:path*',
        destination: `${V2_URL}/live/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
