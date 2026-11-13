/**
 * robots 의 계약은 "무엇을 열었나"보다 **"열면서 무엇을 같이 열어 버리지 않았나"**다.
 * AI 크롤러를 허용하려고 `Allow: /` 를 주면 /admin·/my 까지 통째로 넘어간다 —
 * 이 파일은 그 사고를 막는다.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { shouldServeStreamingMetadata } from 'next/dist/server/lib/streaming-metadata';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';
import robots from './robots';

vi.mock('@/components/home/home-client', () => ({ HomePageClient: () => null }));
const { metadata: homeMetadata } = await import('./home/page');

const rules = () => {
  const value = robots().rules;
  return Array.isArray(value) ? value : [value];
};
const listOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Google 의 robots.txt 해석: 요청 경로에 맞는 Allow·Disallow 줄 가운데 **가장 긴 패턴**이 이기고,
 * 길이가 같으면 Allow 가 이긴다. `*` 는 아무 글자열, 끝의 `$` 는 경로 끝을 뜻한다.
 */
function crawlAllowed(rule: ReturnType<typeof rules>[number], pathname: string): boolean {
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith('$');
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(pathname);
  };
  let winner = { length: -1, allow: true };
  for (const [patterns, allow] of [[listOf(rule.allow), true], [listOf(rule.disallow), false]] as const) {
    for (const pattern of patterns.filter(matches)) {
      if (pattern.length > winner.length || (pattern.length === winner.length && allow)) {
        winner = { length: pattern.length, allow };
      }
    }
  }
  return winner.allow;
}

/** Next 가 헤더 규칙을 맞추는 것과 같은 경로 매처로, 이 경로에 붙는 X-Robots-Tag 값을 모은다. */
async function robotsTagsFor(pathname: string): Promise<string[]> {
  const entries = await nextConfig.headers!();
  return entries
    .filter((entry) => getPathMatch(entry.source)(pathname))
    .flatMap((entry) => entry.headers)
    .filter((header) => header.key === 'X-Robots-Tag')
    .map((header) => header.value);
}

const PRIVATE_PATHS = ['/admin/', '/my/', '/chat/', '/api/', '/auth/', '/users/'];

// 작성·수정·신청 화면 전수(app 아래 new·edit·apply·applications 폴더 중 사용자 화면).
const EDITOR_PATHS = [
  '/matches/new', '/matches/1/edit', '/matches/1/applications',
  '/team-matches/new', '/team-matches/1/edit',
  '/teams/new', '/teams/1/edit', '/teams/1/contact/new',
  '/teams/1/schedules/new', '/teams/1/schedules/2/edit',
  '/tournaments/1/apply',
];

// 로그인이 있어야 열리는 화면 표본. 공개 화면과 이름이 비슷한 것(record·records·schedules)과 짝을 이룬다.
const LOGIN_ONLY_PATHS = [
  '/tournament-management', '/tournament-ops/tournaments/1/operations', '/admin-content-preview',
  '/team-matches/1/edit/rules', '/team-matches/1/lineup/opponent', '/team-matches/1/result/approval', '/team-matches/1/operate',
  '/teams/1/games/2/roster', '/teams/1/tactics/2', '/teams/1/invite', '/teams/1/dissolve', '/teams/1/game-rosters',
  '/teams/1/contact/settings', '/teams/1/schedules/new', '/teams/1/schedules/2/edit', '/teams/1/contact/new',
];
const PUBLIC_PATHS = [
  '/landing', '/matches', '/matches/1', '/teams', '/teams/1', '/teams/1/records', '/teams/1/schedules', '/teams/1/schedules/2',
  '/team-matches', '/team-matches/1', '/team-matches/1/record', '/tournaments', '/tournaments/1', '/tournaments/1/bracket',
  '/tournaments/1/results', '/notices/1', '/help', '/contact',
];

describe('robots', () => {
  it('공개 주소는 모든 user-agent 에 허용하고 비공개 영역은 차단한다(최장 일치 계산)', () => {
    for (const rule of rules()) {
      for (const pathname of PUBLIC_PATHS) {
        expect(crawlAllowed(rule, pathname), `${String(rule.userAgent)} 가 ${pathname} 를 막는다`).toBe(true);
      }
      for (const pathname of ['/my/', '/my/profile/edit', '/admin/users', '/users/1', '/api/v1/teams', '/chat/room-1', '/login', '/signup', '/search']) {
        expect(crawlAllowed(rule, pathname), `${String(rule.userAgent)} 가 ${pathname} 를 허용한다`).toBe(false);
      }
    }
  });

  it('선언한 차단 줄은 모두 자기 경로를 실제로 막고, 경로마다 효력이 갈리는 와일드카드 차단은 두지 않는다', () => {
    for (const rule of rules()) {
      const disallow = listOf(rule.disallow);
      expect(disallow.filter((pattern) => pattern.includes('*')), '와일드카드 차단은 더 긴 Allow 줄에 져 경로마다 효력이 갈린다').toEqual([]);
      for (const pattern of disallow) {
        expect(crawlAllowed(rule, pattern), `${String(rule.userAgent)} 의 Disallow ${pattern} 가 더 긴 Allow 에 가려진다`).toBe(false);
      }
    }
  });

  it.each(EDITOR_PATHS)('작성·수정·신청 화면 %s 는 수집을 막지 않고 검색 제외 헤더로 다룬다', async (pathname) => {
    // 수집을 막으면 크롤러가 검색 제외 표시를 읽지 못해 주소만 검색 결과에 남는다.
    for (const rule of rules()) {
      expect(crawlAllowed(rule, pathname), `${String(rule.userAgent)} 가 ${pathname} 수집을 막는다`).toBe(true);
    }
    expect(await robotsTagsFor(pathname), `${pathname} 에 검색 제외 헤더가 없다`).toEqual([expect.stringContaining('noindex')]);
  });

  it.each(LOGIN_ONLY_PATHS)('로그인이 필요한 화면 %s 에는 검색 제외 헤더가 걸린다', async (pathname) => {
    expect(await robotsTagsFor(pathname)).toEqual([expect.stringContaining('noindex')]);
  });

  it.each(PUBLIC_PATHS)('공개 화면 %s 에는 검색 제외 헤더가 걸리지 않는다', async (pathname) => {
    expect(await robotsTagsFor(pathname)).toEqual([]);
  });

  it('앱 홈은 수집을 허용하고 검색 제외는 메타(noindex, follow)로만 한다', async () => {
    for (const rule of rules()) {
      expect(rule.allow).toContain('/home');
      expect(crawlAllowed(rule, '/home')).toBe(true);
    }
    // 헤더가 nofollow 를 보태면 메타가 정한 「링크는 따라간다」를 덮어쓴다.
    expect(await robotsTagsFor('/home')).toEqual([]);
    expect(homeMetadata.robots).toEqual({ index: false, follow: true });
  });

  it('옛 대회 일정 주소는 대진 허브로 영구 이동한다', async () => {
    expect(await nextConfig.redirects!()).toContainEqual({
      source: '/tournaments/:id/schedule', destination: '/tournaments/:id/bracket', permanent: true,
    });
  });

  it('브라우저가 먼저 찾는 아이콘 주소는 이미 있는 파일로 이어진다', async () => {
    const rewrites = await nextConfig.rewrites!();
    const afterFiles = Array.isArray(rewrites) ? rewrites : rewrites.afterFiles;
    for (const [source, destination] of [
      ['/favicon.ico', '/favicon.png'],
      ['/apple-touch-icon.png', '/brand/apple-touch-icon.png'],
    ]) {
      expect(afterFiles).toContainEqual({ source, destination });
      expect(existsSync(path.join(__dirname, '../../public', destination)), `public${destination} 가 없다`).toBe(true);
    }
  });

  it('AI 크롤러와 네이버 Yeti 를 명시적으로 다룬다', () => {
    const agents = rules().map((rule) => rule.userAgent);

    expect(agents).toContain('*');
    expect(agents).toContain('Yeti');
    // 학습 / 검색 색인 / 실시간 열람 세 용도가 모두 이름을 올려야 한다.
    expect(agents).toContain('GPTBot');
    expect(agents).toContain('OAI-SearchBot');
    expect(agents).toContain('ChatGPT-User');
    expect(agents).toContain('ClaudeBot');
    expect(agents).toContain('Claude-SearchBot');
    expect(agents).toContain('PerplexityBot');
  });

  it('모든 user-agent 가 같은 비공개 경로 차단을 받는다', () => {
    for (const rule of rules()) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow ?? ''];
      for (const path of PRIVATE_PATHS) {
        expect(disallow, `${String(rule.userAgent)} 가 ${path} 를 차단하지 않는다`).toContain(path);
      }
    }
  });

  it('어떤 user-agent 에도 전체 허용(Allow: /)을 주지 않는다', () => {
    for (const rule of rules()) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow ?? ''];
      expect(allow, `${String(rule.userAgent)} 에 전체 허용이 들어갔다`).not.toContain('/');
    }
  });

  it('공개 도움말·이용 대상·문의 경로를 모든 user-agent 에 연다', () => {
    for (const rule of rules()) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow ?? ''];
      expect(allow).toEqual(expect.arrayContaining(['/help', '/faq', '/for/', '/contact']));
    }
  });

  it('sitemap 을 절대 URL 로 알리고 Google 이 무시하는 Host 줄은 내지 않는다', () => {
    const result = robots();
    expect(result.sitemap).toEqual([
      'https://teameet.co.kr/sitemap.xml',
      'https://teameet.co.kr/notices/feed.xml',
    ]);
    expect(result).not.toHaveProperty('host');
  });
});

/**
 * robots 가 이름을 올린 크롤러는 콜드 렌더에서도 <head>(title·canonical·JSON-LD)를 받아야 한다.
 * 판정은 Next 가 요청마다 쓰는 함수 그대로 돌린다 — "blocking" 이면 head 가 완성돼서 나간다.
 */
describe('htmlLimitedBots', () => {
  // Next 는 config 로드 때 RegExp 를 .source 문자열로 바꿔 서버에 넘긴다.
  const pattern = nextConfig.htmlLimitedBots?.source;
  const getsFullHead = (userAgent: string) => !shouldServeStreamingMetadata(userAgent, pattern);

  it('robots 에 이름이 있는 모든 크롤러가 head 를 완성해서 받는다', () => {
    const named = rules()
      .map((rule) => String(rule.userAgent))
      .filter((agent) => agent !== '*');
    expect(named.length).toBeGreaterThan(5);
    for (const agent of named) {
      const userAgent = `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ${agent}/1.0)`;
      expect(getsFullHead(userAgent), agent).toBe(true);
    }
  });

  it('Next 기본 봇과 국내외 검색 크롤러를 잃지 않는다', () => {
    for (const userAgent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)',
      'Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=28966)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    ]) {
      expect(getsFullHead(userAgent), userAgent).toBe(true);
    }
  });

  it('일반 브라우저와 다음 앱 인앱 브라우저는 스트리밍을 그대로 받는다', () => {
    for (const userAgent of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 DaumApps/7.9.0',
    ]) {
      expect(getsFullHead(userAgent), userAgent).toBe(false);
    }
  });
});
