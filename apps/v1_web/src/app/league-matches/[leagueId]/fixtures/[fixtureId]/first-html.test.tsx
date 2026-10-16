/**
 * 리그 경기 상세 첫 HTML 계약 — 실제 route와 실제 client가 첫 응답에 공개 경기 정보를 그린다.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stripScriptTags } from '@/test/html-sanitize';
import type { V1TeamMatch } from '@/types/api';
import type { V1LeagueStandingsResponse, V1PublicLeagueDetail } from '@/types/league-match';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/league-matches/lg-1/fixtures/fx-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

const { loadPublic } = vi.hoisted(() => ({ loadPublic: vi.fn() }));
vi.mock('../../load-public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../load-public')>()),
  loadPublic,
}));

import LeagueFixturePage from './page';

const FIXTURE = {
  teamMatchId: 'fx-1', title: '송파 풋살 리그 1주차', sportName: '풋살',
  startsAt: '2026-09-20T01:00:00.000Z', placeName: '송파 풋살파크', status: 'matched',
  hostTeamId: 'team-a', hostTeamName: '송파 유나이티드',
  hostTeam: { teamId: 'team-a', name: '송파 유나이티드' },
  approvedOpponentTeam: { teamId: 'team-b', name: '한강 로버스' },
  league: { leagueId: 'lg-1', title: '송파 풋살 리그 1시즌' },
} as unknown as V1TeamMatch;

const LEAGUE = {
  leagueId: 'lg-1', title: '송파 풋살 리그 1시즌', state: 'active', startsOn: '2026-09-17T00:00:00.000Z',
  endsOn: '2026-12-16T00:00:00.000Z', registrationDeadlineAt: null, registrationOpen: false,
  sportCode: 'futsal', coverImageUrl: null, entryFee: 0, entryFeeConfigured: false,
  seriesId: null, seriesTitle: null, tier: null, tierLabel: null, seasonNo: null, seriesSiblings: [],
  teamIds: ['team-a', 'team-b'], fixtures: [{
    teamMatchId: 'fx-1', title: '송파 풋살 리그 1주차', homeTeamId: 'team-a', awayTeamId: 'team-b',
    startAt: '2026-09-20T01:00:00.000Z', placeName: '송파 풋살파크', status: 'matched',
    homeScore: null, awayScore: null, isForfeit: false, scoreHidden: false,
  }],
} as unknown as V1PublicLeagueDetail;

const STANDINGS = {
  leagueId: 'lg-1', tier: null, tierLabel: null,
  tieBreakOrder: ['points', 'goalDifference', 'goalsFor', 'headToHead', 'fewestGoalsAgainst'],
  standings: [
    { teamId: 'team-a', teamName: '송파 유나이티드', teamLogoUrl: null, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, position: 1 },
    { teamId: 'team-b', teamName: '한강 로버스', teamLogoUrl: null, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, position: 2 },
  ],
  pendingFixtures: [], champions: [], cancelledFixtureCount: 0,
  promotionDecided: false, promotionForecast: null, tieBreakGroups: [],
} as unknown as V1LeagueStandingsResponse;

beforeEach(() => {
  loadPublic.mockReset().mockImplementation(async (path: string) => {
    if (path === '/team-matches/fx-1') return { ok: true, data: FIXTURE };
    if (path === '/league-matches/lg-1') return { ok: true, data: LEAGUE };
    if (path === '/league-matches/lg-1/standings') return { ok: true, data: STANDINGS };
    return { ok: false };
  });
});

afterEach(() => vi.restoreAllMocks());

describe('리그 경기 상세 첫 HTML', () => {
  it('서버 HTML 본문에 실제 경기 제목, 양 팀, 일시와 장소를 그린다', async () => {
    const node = await LeagueFixturePage({ params: Promise.resolve({ leagueId: 'lg-1', fixtureId: 'fx-1' }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = stripScriptTags(renderToString(
      <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>,
    ));

    expect(html).toContain('송파 풋살 리그 1시즌');
    expect(html).toContain('송파 유나이티드');
    expect(html).toContain('한강 로버스');
    expect(html).toContain('2026년 9월 20일');
    expect(html).toContain('송파 풋살파크');
    expect(html).not.toContain('tm-skeleton');
  });

  it('경기 경로의 leagueId가 달라도 실제 소속 리그 ID를 본문 링크와 조회에 쓴다', async () => {
    const node = await LeagueFixturePage({ params: Promise.resolve({ leagueId: 'wrong-id', fixtureId: 'fx-1' }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = stripScriptTags(renderToString(
      <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>,
    ));

    expect(html).toContain('href="/tournaments/lg-1"');
    expect(loadPublic).toHaveBeenCalledWith('/league-matches/lg-1');
    expect(loadPublic).toHaveBeenCalledWith('/league-matches/lg-1/standings');
  });

  it('경기 API 404는 없는 fixture로 처리한다', async () => {
    loadPublic.mockResolvedValueOnce({ ok: true, data: null });

    await expect(LeagueFixturePage({
      params: Promise.resolve({ leagueId: 'lg-1', fixtureId: 'missing' }),
    })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('일반 팀매치는 리그 경기 URL에서 404로 처리한다', async () => {
    loadPublic.mockResolvedValueOnce({ ok: true, data: { ...FIXTURE, league: null } });

    await expect(LeagueFixturePage({
      params: Promise.resolve({ leagueId: 'lg-1', fixtureId: 'friendly-match' }),
    })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('경기 API upstream 실패는 shell 성공 대신 서버 오류로 드러낸다', async () => {
    loadPublic.mockResolvedValueOnce({ ok: false });

    await expect(LeagueFixturePage({
      params: Promise.resolve({ leagueId: 'lg-1', fixtureId: 'fx-1' }),
    })).rejects.toThrow('리그 경기 상세에 필요한 공개 경기 정보를 불러오지 못했어요');
  });

  it('필수 공개 리그 조회 실패는 빈 성공 화면 대신 서버 오류로 드러낸다', async () => {
    loadPublic.mockImplementation(async (path: string) => {
      if (path === '/team-matches/fx-1') return { ok: true, data: FIXTURE };
      if (path === '/league-matches/lg-1') return { ok: false };
      return { ok: true, data: STANDINGS };
    });

    await expect(LeagueFixturePage({
      params: Promise.resolve({ leagueId: 'lg-1', fixtureId: 'fx-1' }),
    })).rejects.toThrow('리그 경기 상세에 필요한 공개 리그 정보를 불러오지 못했어요');
  });

  it('순위표 API 실패 시에도 매치 seed에 있는 실제 양 팀 이름을 표시한다', async () => {
    loadPublic.mockImplementation(async (path: string) => {
      if (path === '/league-matches/lg-1/standings') return { ok: false };
      if (path === '/team-matches/fx-1') return { ok: true, data: FIXTURE };
      return { ok: true, data: LEAGUE };
    });

    const node = await LeagueFixturePage({ params: Promise.resolve({ leagueId: 'lg-1', fixtureId: 'fx-1' }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = stripScriptTags(renderToString(
      <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>,
    ));

    expect(html).toContain('송파 유나이티드');
    expect(html).toContain('한강 로버스');
    expect(html).not.toContain('홈팀 정보 없음');
    expect(html).not.toContain('상대팀 정보 없음');
  });
});
