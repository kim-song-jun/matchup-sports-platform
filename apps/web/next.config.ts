import type { NextConfig } from 'next';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // 프로덕션: standalone, Capacitor: export
  output: isCapacitorBuild ? 'export' : isProd ? 'standalone' : undefined,
  images: {
    unoptimized: isCapacitorBuild,
  },
  // 개발 시 API 프록시
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:8100'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
