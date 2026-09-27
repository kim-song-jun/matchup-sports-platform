/**
 * 리그 상세 첫 HTML 계약 — 비-JS 크롤러가 받는 서버 HTML 본문에 순위표 팀과 일정이 있어야 한다.
 * API 경계(fetch)만 바꾸고 page → 클라이언트 → React Query 는 실제 코드로 렌더한다.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/league-matches/lg-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import LeagueMatchPage from './page';

const LEAGUE = {
  leagueId: 'lg-1', title: '송파 풋살 리그 1시즌', state: 'active',
  startsOn: '2026-09-17T00:00:00.000Z', endsOn: '2026-12-16T00:00:00.000Z',
  registrationDeadlineAt: null, registrationOpen: false, seriesId: null, seriesTitle: null,
  tier: null, tierLabel: null, seasonNo: null, seriesSiblings: [], teamIds: ['team-a', 'team-b'],
  fixtures: [{
    teamMatchId: 'fx-1', title: '송파 풋살 리그 1주차', homeTeamId: 'team-a', awayTeamId: 'team-b',
    startAt: '2026-09-20T01:00:00.000Z', placeName: '송파 풋살파크', status: 'completed',
    homeScore: 2, awayScore: 1, isForfeit: false, scoreHidden: false,
  }],
};

const row = (teamId: string, teamName: string, position: number) => ({
  teamId, teamName, teamLogoUrl: null, played: 1, wins: position === 1 ? 1 : 0, draws: 0,
  losses: position === 1 ? 0 : 1, goalsFor: 0, goalsAgainst: 0, points: position === 1 ? 3 : 0, position,
});

const STANDINGS = {
  leagueId: 'lg-1', tier: null, tierLabel: null,
  tieBreakOrder: ['points', 'goalDifference', 'goalsFor', 'headToHead', 'fewestGoalsAgainst'],
  standings: [row('team-a', '송파 유나이티드', 1), row('team-b', '한강 로버스', 2)],
  pendingFixtures: [], champions: [], cancelledFixtureCount: 0,
  promotionDecided: false, promotionForecast: null, tieBreakGroups: [],
};

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    if (path === '/league-matches/lg-1') return envelope(LEAGUE);
    if (path === '/league-matches/lg-1/standings') return envelope(STANDINGS);
    return new Response('unexpected', { status: 500 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('리그 상세 첫 HTML', () => {
  it('순위표 팀과 경기 일정을 서버 HTML 본문에 그린다', async () => {
    const node = await LeagueMatchPage({ params: Promise.resolve({ leagueId: 'lg-1' }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다.
    const html = renderToString(
      <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>,
    ).replace(/<script[\s\S]*?<\/script>/g, '');

    expect(html).toContain('송파 풋살 리그 1시즌');
    expect(html).toContain('송파 유나이티드');
    expect(html).toContain('한강 로버스');
    // 일정 행(장소·확정 스코어)도 본문에 있어야 한다. 선수 기록(득점 순위)은 따로 불러와 스켈레톤이 정상이다.
    expect(html).toContain('송파 풋살파크');
    expect(html).toMatch(/2\s*:\s*1/);
  });
});
