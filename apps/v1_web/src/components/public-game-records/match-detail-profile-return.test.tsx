import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { resolveRouteChrome } from '@/lib/route-chrome';
import { MatchDetailContent } from './match-detail-content';
import type { PublicMatchDetail } from './types';

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
  useRouter: () => navigation.router,
}));

const players = [
  ['라인업 홈 선수', '/users/u-home'],
  ['라인업 원정 선수', '/users/u-away'],
  ['득점 선수', '/users/u-goal'],
  ['도움 선수', '/users/u-assist'],
  ['기타 득점 선수', '/users/u-other'],
  ['MVP 선수', '/users/u-mvp'],
] as const;

const sources = [
  ['리그', `/league-matches/league-one/fixtures/fixture-one?view=record&from=${encodeURIComponent('/league-matches/league-one?tab=fixtures&q=qa')}#events`],
  ['대회', `/tournaments/tour-one/matches/fixture-one?tab=records&from=${encodeURIComponent('/tournaments/tour-one/bracket?tab=scorers')}#events`],
] as const;

/** Local synthetic response only. No consent inference or actual match data. */
function makeDetail(profileHref: (path: string) => string | null = (path) => path): PublicMatchDetail {
  return {
    tournamentId: 'tour-one', tournamentTitle: '테스트 대회', fixtureId: 'fixture-one', gameId: 'game-one',
    round: '조별리그', fixtureNumber: 1, legNumber: 1, groupId: null, groupName: null,
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

function playerHref(name: string): string {
  const href = screen.getByRole('link', { name }).getAttribute('href');
  expect(href).not.toBeNull();
  return href!;
}

function profileFallback(pathname: string): string {
  // Consume the real profile shell contract, rather than supplying a test-only return destination.
  const fallback = resolveRouteChrome(pathname)?.chrome.backHref;
  expect(fallback).toBe('/teams');
  return fallback as string;
}

beforeEach(() => {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  navigation.searchParams = new URLSearchParams();
  Object.values(navigation.router).forEach((fn) => fn.mockReset());
});
afterEach(() => {
  cleanup();
  __resetNavigationHistoryForTests();
});

describe('경기 기록 → 선수 프로필의 실제 링크', () => {
  describe.each(sources)('%s 경기의 query/hash와 중첩 출처', (_label, source) => {
    it.each(players)('%s는 현재 경기 URL을 출처로 전달한다', (name, path) => {
      render(<MatchDetailContent data={makeDetail()} from={source} />);

      const href = new URL(playerHref(name), window.location.origin);
      expect(href.pathname).toBe(path);
      expect(href.searchParams.get('from')).toBe(source);
    });
  });

  it('프로필 자체의 query/hash도 from 추가 후 유지한다', () => {
    render(<MatchDetailContent data={makeDetail((path) => `${path}?view=stats#profile`)} from={sources[0][1]} />);

    const href = new URL(playerHref(players[2][0]), window.location.origin);
    expect(href.pathname).toBe(players[2][1]);
    expect(href.searchParams.get('view')).toBe('stats');
    expect(href.searchParams.get('from')).toBe(sources[0][1]);
    expect(href.hash).toBe('#profile');
  });

  it('출처가 없으면 서버가 준 기존 프로필 href를 그대로 유지한다', () => {
    render(<MatchDetailContent data={makeDetail()} />);
    for (const [name, path] of players) expect(playerHref(name)).toBe(path);
  });

  it.each([
    'https://outside.example/record', '//outside.example/record', '/\\outside.example/record',
    '/..//outside.example/record', 'javascript:alert(1)', '/login?from=%2Fhome',
  ])('안전하지 않은 출처 %s는 여섯 프로필 링크에 추가하지 않는다', (source) => {
    render(<MatchDetailContent data={makeDetail()} from={source} />);
    for (const [name, path] of players) expect(playerHref(name)).toBe(path);
  });

  it('profileHref:null이면 공개된 이름이어도 출처나 participantId로 링크를 만들지 않는다', () => {
    render(<MatchDetailContent data={makeDetail(() => null)} from={sources[0][1]} />);
    for (const [name] of players) {
      if (name === players[3][0]) expect(screen.getByText(/도움 ·/)).toHaveTextContent(name);
      else expect(screen.getByText(name, { exact: true })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('같은 컴포넌트가 다음 경기 출처로 갱신되면 이전 출처를 남기지 않는다', () => {
    const { rerender } = render(<MatchDetailContent data={makeDetail()} from={sources[0][1]} />);
    rerender(<MatchDetailContent data={makeDetail()} from={sources[1][1]} />);
    for (const [name] of players) {
      expect(new URL(playerHref(name), window.location.origin).searchParams.get('from')).toBe(sources[1][1]);
    }
  });
});

describe('실제 선수 링크 → AppBackLink 클릭', () => {
  it.each(sources)('%s에서 온 프로필은 바로 앞 경기로 back한다', (_label, source) => {
    window.history.replaceState(null, '', source);
    installNavigationHistory();
    const { unmount } = render(<MatchDetailContent data={makeDetail()} from={source} />);
    const href = playerHref(players[2][0]);
    window.history.pushState({}, '', href);
    navigation.searchParams = new URLSearchParams(window.location.search);
    unmount();

    render(<AppBackLink fallbackHref={profileFallback(window.location.pathname)}>뒤로</AppBackLink>);
    const link = screen.getByRole('link', { name: '뒤로가기' });
    expect(link).toHaveAttribute('href', source);
    fireEvent.click(link);
    fireEvent.click(link);
    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it.each(['', `?from=${encodeURIComponent('//outside.example/record')}`])('직접/외부 출처 진입 %s는 기존 프로필 fallback을 유지한다', (query) => {
    window.history.replaceState(null, '', `/users/u-goal${query}`);
    installNavigationHistory();
    navigation.searchParams = new URLSearchParams(window.location.search);
    render(<AppBackLink fallbackHref={profileFallback(window.location.pathname)}>뒤로</AppBackLink>);

    const link = screen.getByRole('link', { name: '뒤로가기' });
    expect(link).toHaveAttribute('href', '/teams');
    fireEvent.click(link);
    expect(navigation.router.replace).toHaveBeenCalledWith('/teams');
    expect(navigation.router.back).not.toHaveBeenCalled();
  });
});
