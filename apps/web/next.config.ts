import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const isProd = process.env.NODE_ENV === 'production';
const internalApiOrigin =
  process.env.INTERNAL_API_ORIGIN
  || process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')
  || 'http://localhost:8111';

const nextConfig: NextConfig = {
  // 프로덕션: standalone, Capacitor: export
  output: isCapacitorBuild ? 'export' : isProd ? 'standalone' : undefined,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, buffer: false };
    }
    return config;
  },
  images: {
    unoptimized: isCapacitorBuild,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // 개발 시 API 프록시
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiOrigin}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
