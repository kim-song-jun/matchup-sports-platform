import path from 'path';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
// 공개 export 가 없는 Next 내부 경로다. 업그레이드로 옮겨지면 config 로드가 실패해 빌드가 멈춘다(조용히 기본 봇을 잃지 않는다).
import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/html-bots';
import { buildHtmlLimitedBotsPattern } from './src/lib/crawler-agents';

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
  // 여기 걸리는 UA 에는 메타데이터를 스트리밍하지 않고 <head> 를 완성해서 보낸다. 빠지면 콜드 렌더에서
  // title·canonical·OG·JSON-LD 가 body 끝 스크립트로만 가서, JS 를 안 돌리는 AI 크롤러는 빈 head 를 본다.
  htmlLimitedBots: buildHtmlLimitedBotsPattern(HTML_LIMITED_BOT_UA_RE),
  experimental: {
    // lucide-react는 134곳 전부 named import — 이 옵션 하나로 Next가 빌드 시점에
    // 개별 아이콘 딥 임포트로 자동 변환한다(호출부 수정 불필요).
    optimizePackageImports: ['@tanstack/react-query', 'lucide-react'],
  },
  images: {
    // 유튜브 썸네일(match-videos.tsx의 youtubeThumbnailUrl())만 외부 호스트가 필요하다.
    // /uploads/*·/brand/*·/fonts/*는 같은 origin이라 remotePatterns 없이도 next/image가 동작한다.
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' }],
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
  async redirects() {
    return [
      // 구 basePath(/v1) 시대의 URL — 북마크·외부 링크·카카오 redirect_uri(/v1/callback/kakao)가
      // 아직 살아있어서 현재 경로로 넘겨준다. 쿼리스트링은 Next가 그대로 이어붙인다.
      { source: '/v1', destination: '/', permanent: true },
      { source: '/v1/:path*', destination: '/:path*', permanent: true },
      // 대회별 팝업 화면을 전역 팝업 하나로 합쳤다(대회 어드민 '팝업' 항목도 이 링크로 간다).
      // 운영자 북마크가 죽지 않도록 옛 하위 탭 URL 을 경로 프리필한 전역 화면으로 넘긴다.
      {
        source: '/admin/tournaments/:id/popups',
        destination: '/admin/popups?targetPath=/tournaments/:id',
        permanent: false,
      },
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
