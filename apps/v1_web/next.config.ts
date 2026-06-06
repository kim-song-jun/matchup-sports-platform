import path from 'path';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
const isProd = process.env.NODE_ENV === 'production';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const defaultInternalApiOrigin = isProd ? 'http://v1_api:8121' : 'http://localhost:8121';
const internalApiOrigin =
  process.env.INTERNAL_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
  defaultInternalApiOrigin;

const nextConfig: NextConfig = {
  output: isProd ? 'standalone' : undefined,
  basePath: basePath || undefined,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  devIndicators: false,
  experimental: {
    optimizePackageImports: ['@tanstack/react-query'],
  },
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiOrigin}/api/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
