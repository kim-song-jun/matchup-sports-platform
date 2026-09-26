import type { MetadataRoute } from 'next';
import { ROBOTS_NAMED_USER_AGENTS } from '@/lib/crawler-agents';
import { absoluteSiteUrl, getSiteOrigin, NOTICES_FEED_PATH } from '@/lib/seo';

/**
 * 공개 크롤 대상 경로. 로그인·개인 데이터·운영 화면은 아래 DISALLOWED_PATHS로 차단한다.
 */
const ALLOWED_PATHS = [
  '/landing',
  '/matches',
  '/teams',
  '/team-matches',
  '/tournaments',
  '/league-matches',
  '/events',
  '/notices',
];

const DISALLOWED_PATHS = [
  '/api/',
  '/admin/',
  '/auth/',
  '/callback/',
  '/chat/',
  '/home',
  '/login',
  '/my/',
  '/notifications',
  '/onboarding/',
  '/search',
  '/signup',
  '/users/',
  '/*/edit',
  '/*/new',
  '/*/apply',
  '/*/applications',
];

/**
 * AI 크롤러(학습·검색 색인·실시간 열람)와 네이버 Yeti 에도 `User-agent: *`와 **같은 allow/disallow를
 * 그대로 적용**한다 — 전체 허용으로 열면 /admin·/my 같은 비공개 경로까지 넘어간다.
 * 명단과 각 크롤러를 허용하는 이유는 `@/lib/crawler-agents` 에 있다.
 */
export default function robots(): MetadataRoute.Robots {
  const publicRule = { allow: ALLOWED_PATHS, disallow: DISALLOWED_PATHS };

  return {
    rules: [
      { userAgent: '*', ...publicRule },
      ...ROBOTS_NAMED_USER_AGENTS.map((userAgent) => ({ userAgent, ...publicRule })),
    ],
    // Google·Bing 은 RSS 2.0 도 사이트맵 형식으로 받는다 — 공지 피드를 여기서 함께 알린다.
    sitemap: [absoluteSiteUrl('/sitemap.xml'), absoluteSiteUrl(NOTICES_FEED_PATH)],
    host: getSiteOrigin(),
  };
}
