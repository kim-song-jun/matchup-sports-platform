import type { MetadataRoute } from 'next';
import { absoluteSiteUrl, getSiteOrigin } from '@/lib/seo';

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
 * AI 크롤러는 용도가 세 갈래이고, 셋 다 우리에게 필요하다:
 *
 * - **학습**(GPTBot·ClaudeBot·Google-Extended·CCBot·Applebot-Extended): 모델이 "팀밋"이라는
 *   서비스를 아예 알게 되는 경로. 막으면 미래 모델이 우리를 모른다.
 * - **검색 색인**(OAI-SearchBot·Claude-SearchBot·PerplexityBot): ChatGPT/Claude/Perplexity가
 *   검색할 때 쓰는 자체 인덱스. 막으면 AI 검색 인용이 원천 차단된다.
 * - **실시간 열람**(ChatGPT-User·Perplexity-User·Claude-User): 사용자가 질문한 그 순간
 *   페이지를 여는 경로. 인용과 유입이 실제로 발생하는 지점이다.
 *
 * 우리 공개 콘텐츠(대회 일정·결과·팀 정보)는 노출될수록 이득이므로 셋 다 허용한다.
 * 다만 `User-agent: *`와 **같은 allow/disallow를 그대로 적용**한다 — 전체 허용으로 열면
 * /admin·/my 같은 비공개 경로까지 AI 크롤러에 노출된다.
 *
 * 크롤러 명단은 각 사가 수시로 바꾸므로 분기마다 공식 문서로 재확인이 필요하다.
 */
const AI_CRAWLER_USER_AGENTS = [
  // 학습
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  // 검색 색인
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
  // 실시간 열람
  'ChatGPT-User',
  'Claude-User',
  'Perplexity-User',
];

/**
 * 네이버 크롤러. 한국 생활체육 서비스의 검색 유입 절반이 네이버에서 오는데,
 * `User-agent: *`만 두면 네이버 AI 브리핑·검색 색인 정책이 암묵에 맡겨진다.
 * Yeti를 명시해 두는 것이 서치어드바이저 진단에서도 권장 사항이다.
 */
const NAVER_USER_AGENT = 'Yeti';

export default function robots(): MetadataRoute.Robots {
  const publicRule = { allow: ALLOWED_PATHS, disallow: DISALLOWED_PATHS };

  return {
    rules: [
      { userAgent: '*', ...publicRule },
      { userAgent: NAVER_USER_AGENT, ...publicRule },
      ...AI_CRAWLER_USER_AGENTS.map((userAgent) => ({ userAgent, ...publicRule })),
    ],
    sitemap: absoluteSiteUrl('/sitemap.xml'),
    host: getSiteOrigin(),
  };
}
