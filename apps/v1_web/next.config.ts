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

const browserSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const noIndexRoutes = [
  '/admin/:path*',
  '/auth/:path*',
  '/callback/:path*',
  '/chat/:path*',
  '/home',
  '/login/:path*',
  '/matches/new/:path*',
  '/matches/:id/applications',
  '/matches/:id/edit',
  '/my/:path*',
  '/notifications',
  '/onboarding/:path*',
  '/search/:path*',
  '/signup/:path*',
  '/team-matches/new/:path*',
  '/team-matches/:id/edit',
  '/teams/new',
  '/teams/:id/edit',
  '/teams/:id/members',
  '/terms',
  '/tournaments/:id/apply',
  '/tournaments/:id/my',
  '/tournaments/:id/registrations/:path*',
  '/users/:path*',
];

const nextConfig: NextConfig = {
  output: isProd ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // socket.io-client always requests the polling/upgrade handshake with a trailing
  // slash (/socket.io/?EIO=...). Next's default trailing-slash redirect (308 to
  // /socket.io?EIO=...) runs BEFORE rewrites, and the redirected path no longer
  // matches the `/socket.io/:path*` rewrite below — so every realtime connection
  // 404s. Skipping the redirect lets the rewrite match the original request as-is.
  skipTrailingSlashRedirect: true,
  experimental: {
    optimizePackageImports: ['@tanstack/react-query'],
  },
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  async headers() {
    return [
      { source: '/:path*', headers: browserSecurityHeaders },
      ...noIndexRoutes.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      })),
    ];
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
      {
        // The bare handshake request (no extra path segments) still needs an
        // explicit rule: `/socket.io/:path*` alone collapses to a destination
        // without the trailing slash when :path* is empty, and the Engine.IO
        // server 404s without it.
        source: '/socket.io',
        destination: `${internalApiOrigin}/socket.io/`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${internalApiOrigin}/socket.io/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
