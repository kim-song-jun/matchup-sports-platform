import path from 'path';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
const isProd = process.env.NODE_ENV === 'production';
const defaultInternalApiOrigin = isProd ? 'http://v1_api:8121' : 'http://localhost:8121';
const internalApiOrigin =
  process.env.INTERNAL_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
  defaultInternalApiOrigin;

const nextConfig: NextConfig = {
  output: isProd ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
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
      {
        // Uploaded images are served by v1_api via express.static at /uploads
        // (outside the /api/v1 global prefix). Proxy so the web origin can load
        // them without CORS and so stored relative URLs resolve in dev + prod.
        source: '/uploads/:path*',
        destination: `${internalApiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
