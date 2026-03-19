import type { NextConfig } from 'next';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const nextConfig: NextConfig = {
  // Capacitor 빌드 시에만 정적 출력
  ...(isCapacitorBuild && { output: 'export' }),
  images: {
    unoptimized: true,
  },
  // 개발 시 API 프록시
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
