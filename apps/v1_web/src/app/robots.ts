import type { MetadataRoute } from 'next';
import { AI_CRAWLER_USER_AGENTS, NAVER_USER_AGENT } from '@/lib/crawler-agents';
import { absoluteSiteUrl, NOTICES_FEED_PATH } from '@/lib/seo';
import { PUBLIC_SITE_ALLOW_PATHS } from '@/lib/public-site/routes';

/**
 * 공개 크롤 대상 경로. 개인 데이터·운영·인증 영역은 아래 DISALLOWED_PATHS로 차단한다.
 */
const ALLOWED_PATHS = [
  '/landing',
  // 수집을 막으면 검색엔진이 /home의 noindex를 읽지 못해 URL만 검색 결과에 남는다.
  '/home',
  '/matches',
  '/teams',
  '/team-matches',
  '/tournaments',
  '/league-matches',
  '/events',
  '/notices',
  ...PUBLIC_SITE_ALLOW_PATHS,
];

// 글자로 고정된 경로 앞부분만 쓴다. '/*/edit' 같은 와일드카드는 더 긴 Allow 줄('/teams' 등)에 져서
// 경로마다 효력이 갈린다. 작성·수정·신청 화면은 수집을 허용하고 next.config.ts 의 noIndexRoutes 헤더로 검색에서 뺀다.
const DISALLOWED_PATHS = [
  '/api/',
  '/admin/',
  '/auth/',
  '/callback/',
  '/chat/',
  '/login',
  '/my/',
  '/notifications',
  '/onboarding/',
  '/search',
  '/signup',
  '/users/',
];

// 사이트 안 링크가 붙이는 `from=`(되돌아갈 곳) 꼬리 주소는 정식 주소와 같은 내용이다.
// Allow 접두('/teams')가 `/*from=` 보다 길어서 한 줄 차단은 가장 긴 일치에 져, Allow 접두마다 짝을 둔다.
const FROM_TAIL_PATTERN = '*from=';
const fromTailDisallow = (allow: readonly string[]) => ['/', ...allow].map((prefix) => `${prefix}${FROM_TAIL_PATTERN}`);

/**
 * `User-agent: *`와 네이버 Yeti 는 정식 주소 신호(canonical)를 읽도록 꼬리 주소도 막지 않는다.
 * AI 크롤러(학습·검색 색인·실시간 열람)는 같은 allow/disallow 에 꼬리 주소 차단을 더한다 —
 * 전체 허용으로 열면 /admin·/my 같은 비공개 경로까지 넘어간다.
 * 명단과 각 크롤러를 허용하는 이유는 `@/lib/crawler-agents` 에 있다.
 */
export default function robots(): MetadataRoute.Robots {
  const publicRule = { allow: ALLOWED_PATHS, disallow: DISALLOWED_PATHS };
  const aiRule = { allow: ALLOWED_PATHS, disallow: [...DISALLOWED_PATHS, ...fromTailDisallow(ALLOWED_PATHS)] };

  return {
    rules: [
      { userAgent: '*', ...publicRule },
      { userAgent: NAVER_USER_AGENT, ...publicRule },
      ...AI_CRAWLER_USER_AGENTS.map((userAgent) => ({ userAgent, ...aiRule })),
    ],
    // Google·Bing 은 RSS 2.0 도 사이트맵 형식으로 받는다 — 공지 피드를 여기서 함께 알린다.
    sitemap: [absoluteSiteUrl('/sitemap.xml'), absoluteSiteUrl(NOTICES_FEED_PATH)],
  };
}
