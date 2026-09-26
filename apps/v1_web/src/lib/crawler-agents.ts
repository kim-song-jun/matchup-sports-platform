/**
 * 크롤러 이름의 단일 출처. `robots.ts`(무엇을 허용하나)와 `next.config.ts`의 `htmlLimitedBots`
 * (누구에게 `<head>`를 완성해서 보내나)가 이 목록을 함께 읽는다 — 한쪽에만 추가하면
 * "허용은 했는데 콜드 렌더에서 title·canonical·JSON-LD 가 body 끝 스트림으로만 가는" 크롤러가 생긴다.
 *
 * `next.config.ts`가 import 하므로 `@/` 별칭이나 런타임 의존성을 두지 않는다.
 */

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
 * 크롤러 명단은 각 사가 수시로 바꾸므로 분기마다 공식 문서로 재확인이 필요하다.
 */
export const AI_CRAWLER_USER_AGENTS = [
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
] as const;

/**
 * 네이버 크롤러. 한국 생활체육 서비스의 검색 유입 절반이 네이버에서 오는데,
 * `User-agent: *`만 두면 네이버 AI 브리핑·검색 색인 정책이 암묵에 맡겨진다.
 * Yeti를 명시해 두는 것이 서치어드바이저 진단에서도 권장 사항이다.
 */
export const NAVER_USER_AGENT = 'Yeti';

/** robots.txt 에 이름으로 규칙을 받는 크롤러(`*` 제외). */
export const ROBOTS_NAMED_USER_AGENTS: readonly string[] = [NAVER_USER_AGENT, ...AI_CRAWLER_USER_AGENTS];

/**
 * robots 에 이름은 없지만(`User-agent: *` 규칙을 받는다) head 를 완성해서 받아야 하는 검색 크롤러.
 * Googlebot 은 JS 를 실행하므로 Next 기본값이 일부러 빼 두었는데, 1차 HTML 파싱에서도 head 가
 * 완성돼 있는 편이 색인이 빠르다. 다음은 `Daumoa`(구) · `Daum/`(현행) 두 형태로 온다 —
 * 다음 앱 인앱 브라우저(`DaumApps/`)는 잡지 않도록 `Daum` 단독 토큰은 쓰지 않는다.
 */
const SEARCH_CRAWLER_TOKENS = ['Googlebot', 'Bingbot', NAVER_USER_AGENT, 'Daumoa', 'Daum/'] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * `htmlLimitedBots` 는 Next 기본 목록을 **대체**한다(확장이 아니다) — 기본 정규식을 앞에 그대로
 * 이어 붙여 facebookexternalhit·Twitterbot·Slackbot 같은 링크 미리보기 봇을 잃지 않게 한다.
 */
export function buildHtmlLimitedBotsPattern(nextDefault: RegExp): RegExp {
  const tokens = [...new Set([...ROBOTS_NAMED_USER_AGENTS, ...SEARCH_CRAWLER_TOKENS])];
  return new RegExp([nextDefault.source, ...tokens.map(escapeRegExp)].join('|'), 'i');
}
