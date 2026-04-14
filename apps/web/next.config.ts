import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import bundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const isProd = process.env.NODE_ENV === 'production';
const defaultInternalApiOrigin = isProd ? 'http://api:8100' : 'http://localhost:8111';
const publicApiOrigin = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '');
const internalApiOrigin =
  process.env.INTERNAL_API_ORIGIN ||
  (isProd ? defaultInternalApiOrigin : publicApiOrigin) ||
  defaultInternalApiOrigin;

const nextConfig: NextConfig = {
  // 프로덕션: standalone, Capacitor: export
  output: isCapacitorBuild ? 'export' : isProd ? 'standalone' : undefined,
  experimental: {
    optimizePackageImports: ['next-intl', '@tanstack/react-query'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, buffer: false };
    }
    return config;
  },
  images: {
    unoptimized: isCapacitorBuild,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/register', destination: '/login?tab=register', permanent: false },
      { source: '/signup', destination: '/login?tab=register', permanent: false },
    ];
  },
  // 개발 시 API 프록시
  async rewrites() {
    // Rewrites are ignored in export mode (CAPACITOR_BUILD=true)
    if (isCapacitorBuild) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiOrigin}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${internalApiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
