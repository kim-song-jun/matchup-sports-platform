/**
 * 사이트맵 교차 시험(robots.test.ts · seo-meta-signals.test.ts)이 함께 쓰는 공개 API 자료.
 * `fetchPublicV1` 을 mock 해 경로별 응답을 준다 — 두 시험이 같은 자료로 `sitemap()` 을 돌리므로
 * 사이트맵 주소 판정과 화면 메타 판정이 같은 대회를 본다. 이름·id 는 지어낸 값이다.
 *
 * 자료가 덮는 모양: 끝난 대회(후기 있음·캠페인 주소 있음) / 진행 중 대회(후기 없음) / 정규 리그,
 * 친선 팀 매치 / 리그 경기, 매치·팀·공지, 대회 경기.
 */

export const COMPLETED_CUP_ID = 'done-cup';
export const LIVE_CUP_ID = 'live-cup';
export const REGULAR_LEAGUE_ID = 'season-league';

const TOURNAMENTS = [
  {
    id: COMPLETED_CUP_ID,
    title: '가을 풋살컵',
    kind: 'regular_tournament',
    format: 'group_knockout',
    status: 'completed',
    campaignSlug: 'autumn-futsal-cup',
    reviewsTotalCount: 3,
    fixtures: [{ id: 'game-1' }],
  },
  {
    id: LIVE_CUP_ID,
    title: '겨울 풋살컵',
    kind: 'regular_tournament',
    format: 'knockout',
    status: 'in_progress',
    campaignSlug: null,
    reviewsTotalCount: 0,
    fixtures: [{ id: 'game-2' }],
  },
  {
    id: REGULAR_LEAGUE_ID,
    title: '성수 주말 리그',
    kind: 'regular_league',
    format: 'group_knockout',
    status: 'in_progress',
    campaignSlug: null,
    reviewsTotalCount: 2,
    fixtures: [],
  },
].map((row) => ({
  ...row,
  sport: { name: '풋살' },
  updatedAt: '2026-11-01T03:00:00.000Z',
  coverImageUrl: null,
  listImageUrl: null,
  promoHomeImageUrl: null,
  promoListImageUrl: null,
}));

const paged = (items: unknown[]) => ({ items, nextCursor: null, pageInfo: { hasNext: false, nextCursor: null } });

/** 공개 API 경로(쿼리 포함)에 대한 응답. 모르는 경로는 404 처럼 null 이다. */
export function publicSeoApi(path: string): unknown {
  const pathname = path.split('?')[0]!;
  switch (pathname) {
    case '/matches': return paged([{ id: 'match-1' }]);
    case '/teams': return paged([{ id: 'team-1' }]);
    case '/team-matches': return paged([
      { teamMatchId: 'friendly-1', league: null },
      { teamMatchId: 'fixture-1', league: { leagueId: REGULAR_LEAGUE_ID } },
    ]);
    case '/league-matches': return paged([{ leagueId: REGULAR_LEAGUE_ID }]);
    case '/tournaments': return paged(TOURNAMENTS.map(({ fixtures: _fixtures, ...item }) => item));
    case '/notices': return { notices: [{ id: 'notice-1', publishedAt: '2026-10-20T00:00:00.000Z' }] };
    default: {
      const detailId = /^\/tournaments\/([^/]+)$/.exec(pathname)?.[1];
      return TOURNAMENTS.find(({ id }) => id === (detailId && decodeURIComponent(detailId))) ?? null;
    }
  }
}
