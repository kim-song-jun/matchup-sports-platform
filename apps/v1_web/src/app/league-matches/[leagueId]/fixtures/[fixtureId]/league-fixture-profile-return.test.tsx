import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1LeagueMatch, useV1LeagueMatchStandings, useV1ResolveChatRoom, useV1TeamMatch } from '@/hooks/use-v1-api';
import { usePublicLeagueFixtureRecord } from '@/components/public-game-records/use-public-game-records';
import type { PublicMatchDetail } from '@/components/public-game-records/types';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { resolveRouteChrome } from '@/lib/route-chrome';
import LeagueFixtureDetailClient from './league-fixture-detail-client';

const navigation = vi.hoisted(() => ({
  pathname: '/league-matches/league-one/fixtures/fixture-one' as string | null,
  searchParams: new URLSearchParams(),
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  useRouter: () => navigation.router,
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1LeagueMatch: vi.fn(), useV1LeagueMatchStandings: vi.fn(), useV1TeamMatch: vi.fn(), useV1ResolveChatRoom: vi.fn(),
}));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({ usePublicLeagueFixtureRecord: vi.fn() }));
// Unrelated participant actions are outside this public-link contract. The actual caller,
// shared renderer, current-URL hook, URL safety helper and Back component stay unmocked.
vi.mock('@/components/game-roster/use-my-match-roster-team', () => ({ useMyMatchRosterTeam: () => ({ status: 'none' }) }));
vi.mock('@/components/game-roster/match-team-roster-card', () => ({ MatchTeamRosterCard: () => null }));
vi.mock('@/components/public-game-records/attest-requests', () => ({ AttestRequestsSection: () => null }));
vi.mock('@/components/public-game-records/claim-my-record', () => ({ LeagueClaimMyRecordSection: () => null }));

const fixturePath = '/league-matches/league-one/fixtures/fixture-one';
const parentPath = '/league-matches/league-one?tab=fixtures&q=qa';
const anchor = '#match-events-period-1';
const source = `${fixturePath}?view=record&from=${encodeURIComponent(parentPath)}${anchor}`;
const players = [
  ['라인업 홈 선수', '/users/u-home'], ['라인업 원정 선수', '/users/u-away'],
  ['득점 선수', '/users/u-goal'], ['도움 선수', '/users/u-assist'],
  ['기타 득점 선수', '/users/u-other'], ['MVP 선수', '/users/u-mvp'],
] as const;

function makeRecord(profileHref: (path: string) => string | null = (path) => path): PublicMatchDetail {
  return {
    tournamentId: 'league-one', tournamentTitle: '검증 리그', fixtureId: 'fixture-one', gameId: 'game-one',
    round: '1주차', fixtureNumber: 1, legNumber: 1, groupId: null, groupName: null,
    scheduledAt: '2026-08-01T10:00:00.000Z', venue: null, fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '원정팀' },
    visibilityMode: 'live', status: 'ended', resultState: 'official', scoreStatus: 'official',
    score: { home: 1, away: 0, penalties: null }, clock: null, periodBreak: null,
    lineup: {
      home: [{ participantId: 'p-home', displayName: players[0][0], jerseyNumber: 1, position: null, profileHref: profileHref(players[0][1]) }],
      away: [{ participantId: 'p-away', displayName: players[1][0], jerseyNumber: 2, position: null, profileHref: profileHref(players[1][1]) }],
    },
    events: [
      {
        type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-goal',
        participantName: players[2][0], profileHref: profileHref(players[2][1]), jerseyNumber: 9, period: 1, clockMs: 600_000,
        assist: { participantName: players[3][0], jerseyNumber: 3, profileHref: profileHref(players[3][1]) },
      },
      {
        type: 'GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: 'p-other',
        participantName: players[4][0], profileHref: profileHref(players[4][1]), jerseyNumber: 10, period: null, clockMs: 300_000, assist: null,
      },
    ],
    mvp: { participantId: 'p-mvp', displayName: players[5][0], profileHref: profileHref(players[5][1]) },
    outcome: null, pendingProjection: false, history: [], videos: [], nextMatch: null,
  };
}

function setLocation(path: string) {
  window.history.replaceState(null, '', path);
  navigation.pathname = window.location.pathname;
  navigation.searchParams = new URLSearchParams(window.location.search);
}

function playerUrl(name: string): URL {
  const href = screen.getByRole('link', { name }).getAttribute('href');
  expect(href).not.toBeNull();
  return new URL(href!, window.location.origin);
}

function profileBack() {
  const fallback = resolveRouteChrome(window.location.pathname)?.chrome.backHref;
  expect(fallback).toBe('/teams');
  return <AppBackLink fallbackHref={fallback as string}>뒤로</AppBackLink>;
}

beforeEach(() => {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  Object.values(navigation.router).forEach((fn) => fn.mockReset());
  setLocation(source);
  vi.mocked(useV1LeagueMatch, { partial: true }).mockReturnValue({
    data: {
      leagueId: 'league-one', title: '검증 리그', state: 'completed', teamIds: ['team-home', 'team-away'],
      startsOn: '2026-08-01T00:00:00.000Z', endsOn: '2026-08-02T00:00:00.000Z', registrationDeadlineAt: null, registrationOpen: false, sportCode: 'futsal', coverImageUrl: null, entryFee: 0, entryFeeConfigured: false, seriesSiblings: [],
      fixtures: [{ teamMatchId: 'fixture-one', title: '검증 경기', homeTeamId: 'team-home', awayTeamId: 'team-away', startAt: '2026-08-01T10:00:00.000Z', placeName: '합성 검증장', status: 'completed', homeScore: 1, awayScore: 0 }],
    }, isError: false,
  });
  vi.mocked(useV1LeagueMatchStandings, { partial: true }).mockReturnValue({
    data: {
      leagueId: 'league-one', tier: null, tierLabel: null, tieBreakOrder: ['points'], standings: [], pendingFixtures: [],
      champions: [], cancelledFixtureCount: 0, promotionDecided: false, promotionForecast: null, tieBreakGroups: [],
    }, isError: false,
  });
  vi.mocked(useV1TeamMatch, { partial: true }).mockReturnValue({ data: undefined, isPending: false, isError: false });
  vi.mocked(useV1ResolveChatRoom, { partial: true }).mockReturnValue({ mutate: vi.fn(), isPending: false });
  vi.mocked(usePublicLeagueFixtureRecord, { partial: true }).mockReturnValue({ data: makeRecord(), isPending: false, isError: false });
});
afterEach(() => { cleanup(); __resetNavigationHistoryForTests(); });

const fixture = <LeagueFixtureDetailClient leagueId="league-one" fixtureId="fixture-one" />;

describe('실제 리그 caller → shared 선수 링크', () => {
  describe.each([['중첩 리그 출처', source], ['부모 출처 없음', `${fixturePath}?view=record${anchor}`]])('%s', (_label, current) => {
    it.each(players)('%s의 출처는 현재 query/hash까지 포함한다', (name, path) => {
      setLocation(current);
      render(fixture);
      const href = playerUrl(name);
      expect(href.pathname).toBe(path);
      expect(href.searchParams.get('from')).toBe(current);
    });
  });

  it.each([
    `view=record&mode=public&from=${encodeURIComponent(parentPath)}`,
    `from=${encodeURIComponent(parentPath)}&view=record&mode=public`,
    `view=record&from=${encodeURIComponent(parentPath)}&mode=public`,
  ])('같은 탭의 페이지 Back은 query 순서 %s에서도 바로 앞 경기로 한 번만 back한다', (search) => {
    setLocation(`${fixturePath}?${search}${anchor}`);
    installNavigationHistory();
    const { unmount } = render(fixture);
    const href = playerUrl(players[2][0]);
    window.history.pushState({}, '', `${href.pathname}${href.search}${href.hash}`);
    navigation.searchParams = new URLSearchParams(window.location.search);
    unmount();
    render(profileBack());
    const back = screen.getByRole('link', { name: '뒤로가기' });
    fireEvent.click(back);
    fireEvent.click(back);
    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    const target = new URL(back.getAttribute('href')!, window.location.origin);
    expect(target.pathname).toBe(fixturePath);
    expect(target.searchParams.get('view')).toBe('record');
    expect(target.searchParams.get('mode')).toBe('public');
    expect(target.searchParams.get('from')).toBe(parentPath);
    expect(target.hash).toBe(anchor);
  });

  it('새 탭 첫 진입의 Back도 실제 caller가 만든 경기 query/hash로 replace한다', () => {
    const { unmount } = render(fixture);
    const href = playerUrl(players[2][0]);
    unmount();
    setLocation(`${href.pathname}${href.search}${href.hash}`);
    installNavigationHistory();
    render(profileBack());
    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
    expect(navigation.router.replace).toHaveBeenCalledWith(source);
    expect(navigation.router.back).not.toHaveBeenCalled();
  });

  it.each([
    '/league-matches/league-one?from=%2Fhome&tab=fixtures&q=qa#league-schedule',
    '/league-matches/league-one?tab=fixtures&from=%2Fhome&q=qa#league-schedule',
  ])('부모 내부의 from query 순서 %s가 바뀌어도 같은 탭 Back을 보존한다', (parent) => {
    setLocation(`${fixturePath}?view=record&from=${encodeURIComponent(parent)}${anchor}`);
    installNavigationHistory();
    const { unmount } = render(fixture);
    const href = playerUrl(players[2][0]);
    window.history.pushState({}, '', `${href.pathname}${href.search}${href.hash}`);
    navigation.searchParams = new URLSearchParams(window.location.search);
    unmount();
    render(profileBack());
    const back = screen.getByRole('link', { name: '뒤로가기' });
    fireEvent.click(back);
    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    const target = new URL(back.getAttribute('href')!, window.location.origin);
    expect(target.searchParams.get('view')).toBe('record');
    expect(target.hash).toBe(anchor);
    const ancestor = new URL(target.searchParams.get('from')!, window.location.origin);
    expect(ancestor.pathname).toBe('/league-matches/league-one');
    expect(ancestor.searchParams.get('tab')).toBe('fixtures');
    expect(ancestor.searchParams.get('q')).toBe('qa');
    expect(ancestor.searchParams.get('from')).toBe('/home');
    expect(ancestor.hash).toBe('#league-schedule');
  });

  it('앵커가 바뀌면 이전 앵커를 선수 링크에 남기지 않는다', () => {
    render(fixture);
    act(() => {
      window.history.replaceState(null, '', source.replace(anchor, '#match-events-period-2'));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(playerUrl(players[2][0]).searchParams.get('from')).toBe(source.replace(anchor, '#match-events-period-2'));
  });

  it('query 변경 후 rerender하면 새 query와 hash를 전달한다', () => {
    const { rerender } = render(fixture);
    const changed = source.replace('view=record', 'view=summary').replace(anchor, '#match-events-period-2');
    setLocation(changed);
    rerender(<LeagueFixtureDetailClient leagueId="league-one" fixtureId="fixture-one" />);
    expect(playerUrl(players[2][0]).searchParams.get('from')).toBe(changed);
  });

  it('SSR은 현재 query를 담고 hash는 hydration 이후에만 담는다', () => {
    const html = renderToString(fixture);
    const document = new DOMParser().parseFromString(html, 'text/html');
    const link = Array.from(document.querySelectorAll('a')).find((a) => a.textContent === players[2][0]);
    expect(link).toBeDefined();
    const href = new URL(link!.getAttribute('href')!, window.location.origin);
    expect(href.searchParams.get('from')).toBe(source.replace(anchor, ''));
    render(fixture);
    expect(playerUrl(players[2][0]).searchParams.get('from')).toBe(source);
  });

  it('query 없는 기존 링크와 부모 리그 버튼은 유지한다', () => {
    setLocation(fixturePath);
    render(fixture);
    expect(playerUrl(players[2][0]).searchParams.get('from')).toBe(fixturePath);
    expect(screen.getByRole('link', { name: '전체 순위표·일정 보기' })).toHaveAttribute('href', '/league-matches/league-one');
  });

  it.each(['https://outside.example/record', '//outside.example/record', '/\\outside.example/record', '/..//outside.example/record', 'javascript:alert(1)', '/login?from=%2Fhome'])('외부/비정상 부모 %s는 선수 복귀 체인에 남기지 않는다', (parent) => {
    setLocation(`${fixturePath}?view=record&from=${encodeURIComponent(parent)}${anchor}`);
    render(fixture);
    const target = new URL(playerUrl(players[2][0]).searchParams.get('from')!, window.location.origin);
    expect(target.pathname).toBe(fixturePath);
    expect(target.searchParams.get('view')).toBe('record');
    expect(target.searchParams.has('from')).toBe(false);
    expect(target.hash).toBe(anchor);
    expect(screen.getByRole('link', { name: '전체 순위표·일정 보기' })).toHaveAttribute('href', '/league-matches/league-one');
  });

  it('서버가 profileHref:null을 주면 실제 caller에도 선수 링크가 생기지 않는다', () => {
    vi.mocked(usePublicLeagueFixtureRecord, { partial: true }).mockReturnValue({ data: makeRecord(() => null), isPending: false, isError: false });
    render(fixture);
    for (const [name] of players) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    expect(screen.getByText('라인업 홈 선수')).toBeInTheDocument();
    expect(screen.getByText(/도움 ·/)).toHaveTextContent('도움 선수');
  });

  it('라우터 밖에서 현재 pathname을 모르면 임의의 복귀 출처를 만들지 않는다', () => {
    navigation.pathname = null;
    render(fixture);
    expect(playerUrl(players[2][0]).searchParams.has('from')).toBe(false);
  });
});
