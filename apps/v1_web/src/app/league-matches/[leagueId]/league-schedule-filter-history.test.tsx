import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistoryRouter, nextPopState } from '@/test/history-router';
import LeagueMatchStandingsClient from './league-match-standings-client';
import { LeagueAwardsPageClient } from './awards/league-awards-page-client';

const state = vi.hoisted(() => ({ snapshot: null as string | null, error: false, pending: false }));
const router = createHistoryRouter();
const detailPath = '/league-matches/synthetic-league';
const fixturePath = `${detailPath}/fixtures/synthetic-fixture`;

// Only the Next navigation boundary is adapted. Selection, links, return-path helpers,
// both route clients and jsdom's real history/back/forward remain production behavior.
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (notify) => {
      window.addEventListener('popstate', notify);
      return () => window.removeEventListener('popstate', notify);
    },
    () => state.snapshot ?? window.location.search,
  )),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} href={href} onClick={(event) => {
      event.preventDefault();
      router.push(String(href));
    }}>{children}</a>
  ),
}));

const fixture = {
  teamMatchId: 'synthetic-fixture', title: '합성 완료 경기', homeTeamId: 'synthetic-home',
  awayTeamId: 'synthetic-away', startAt: '2020-01-01T09:00:00Z', placeName: '합성 구장',
  status: 'completed', homeScore: 1, awayScore: 0, isForfeit: false, scoreHidden: false,
};
const league = {
  leagueId: 'synthetic-league', title: '합성 완료 리그', state: 'completed',
  startsOn: '2020-01-01T00:00:00Z', endsOn: '2020-02-01T00:00:00Z',
  teamIds: ['synthetic-home', 'synthetic-away'], fixtures: [fixture],
  seriesId: null, tier: null, tierLabel: null, seasonNo: null, seriesSiblings: [],
  registrationOpen: false, sportCode: 'futsal', coverImageUrl: null, entryFee: 0, entryFeeConfigured: false, registrationDeadlineAt: null,
};
vi.mock('@/hooks/use-v1-api', () => ({
  useV1LeagueMatch: () => ({
    data: state.error || state.pending ? undefined : league,
    isError: state.error, error: new Error('합성 API 오류'), refetch: vi.fn(),
  }),
  useV1LeagueMatchStandings: () => ({
    data: {
      leagueId: 'synthetic-league', tieBreakOrder: ['points'], standings: [],
      pendingFixtures: [], champions: [], promotionDecided: false, promotionForecast: null,
    },
  }),
  useV1LeagueMatchPlayerRecords: () => ({
    data: { leagueId: 'synthetic-league', goals: [], assists: [], hiddenByEligibility: false },
  }),
  useV1AuthMe: () => ({ data: undefined }),
  useV1LeagueClaimableFixtures: () => ({ data: undefined }),
  useV1MyTeams: () => ({ data: undefined }),
  useV1RecordConsent: () => ({ data: undefined }),
  useV1MyRegistrations: () => ({ data: [] }),
}));

const detail = () => render(<LeagueMatchStandingsClient leagueId="synthetic-league" />);
const awards = () => render(<LeagueAwardsPageClient leagueId="synthetic-league" />);
const filters = () => within(screen.getByRole('group', { name: '경기 일정 필터' }));
const upcoming = () => filters().getByRole('button', { name: '예정만' });
const all = () => filters().getByRole('button', { name: '전체' });
const currentHref = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
function expectSelection(upcomingOnly: boolean) {
  expect(upcoming()).toHaveAttribute('aria-pressed', String(upcomingOnly));
  expect(all()).toHaveAttribute('aria-pressed', String(!upcomingOnly));
  const fixtureLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
    .filter((link) => new URL(link.href).pathname === fixturePath);
  expect(fixtureLinks).toHaveLength(upcomingOnly ? 0 : 1);
  if (upcomingOnly) expect(screen.getByText('예정된 경기가 없어요')).toBeInTheDocument();
  else {
    expect(fixtureLinks[0]).toHaveTextContent(/1\s*:\s*0/);
    const source = new URL(fixtureLinks[0].href).searchParams.get('from');
    if (!source) throw new Error('실제 경기 링크에 리그 복귀 출처가 없어요.');
    const returnUrl = new URL(source, window.location.origin);
    const expected = new URL(currentHref(), window.location.origin);
    expect(returnUrl.pathname).toBe(expected.pathname);
    expect([...returnUrl.searchParams].sort()).toEqual([...expected.searchParams].sort());
    expect(returnUrl.hash).toBe(expected.hash);
  }
}
async function travel(direction: 'back' | 'forward') {
  await act(async () => {
    const changed = nextPopState();
    window.history[direction]();
    await changed;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.snapshot = null;
  state.error = false;
  state.pending = false;
  window.history.replaceState(null, '', detailPath);
});
afterEach(() => { cleanup(); state.snapshot = null; });

describe('#1533 리그 경기 일정 필터의 URL/history 계약', () => {
  it('전체 선택도 시즌 결산에서 history Back 후 그대로 복원한다', async () => {
    const view = detail();
    expectSelection(false);
    fireEvent.click(screen.getByRole('link', { name: '시즌 결산 자세히 보기 →' }));
    view.unmount();
    await travel('back');
    detail();
    expectSelection(false);
    expect(new URLSearchParams(window.location.search).has('schedule')).toBe(false);
  });

  it.each(['', '?from=%2Fmy%2Fleagues'])('예정만→실제 시즌 결산 링크→history Back/Forward 복귀 (%s)', async (query) => {
    window.history.replaceState(null, '', `${detailPath}${query}`);
    const view = detail();
    const historyLength = window.history.length;
    const user = userEvent.setup();
    upcoming().focus();
    await user.keyboard(' ');
    expectSelection(true);
    expect(window.history.length).toBe(historyLength);
    fireEvent.click(screen.getByRole('link', { name: '시즌 결산 자세히 보기 →' }));
    const awardsHref = currentHref();
    expect(window.location.pathname).toBe(`${detailPath}/awards`);
    view.unmount();

    await travel('back');
    const restored = detail();
    expectSelection(true);
    expect(new URLSearchParams(window.location.search).get('schedule')).toBe('upcoming');
    expect(new URLSearchParams(window.location.search).get('from')).toBe(query ? '/my/leagues' : null);
    restored.unmount();
    await travel('forward');
    expect(currentHref()).toBe(awardsHref);
    const summary = awards();
    fireEvent.click(screen.getByRole('link', { name: '리그 상세로' }));
    summary.unmount();
    detail();
    expectSelection(true);
  });

  it.each(['', '&from=%2Fmy%2Fleagues'])('시즌 결산의 실제 페이지 복귀 링크는 필터·출처·hash를 유지한다 (%s)', (from) => {
    const source = `${detailPath}?schedule=upcoming${from}#league-schedule`;
    window.history.replaceState(null, '', `${detailPath}/awards?from=${encodeURIComponent(source)}`);
    const view = awards();
    fireEvent.click(screen.getByRole('link', { name: '리그 상세로' }));
    view.unmount();
    detail();
    expect(currentHref()).toBe(source);
    expectSelection(true);
  });

  it.each([
    ['', false], ['?from=%2Fmy%2Fleagues', false], ['?schedule=upcoming', true],
    ['?schedule=all', false], ['?schedule=unknown', false],
  ] as const)('직접 진입·새 마운트에서 허용된 URL 필터만 반영한다 (%s)', (query, selected) => {
    window.history.replaceState(null, '', `${detailPath}${query}`);
    const view = detail();
    expectSelection(selected);
    view.unmount();
    detail();
    expectSelection(selected);
  });

  it('빠른 연속 선택은 다른 query/hash와 history 길이를 보존하고 마지막 선택을 유지한다', () => {
    window.history.replaceState(null, '', `${detailPath}?from=%2Fmy%2Fleagues&q=합성&extra=keep#league-schedule`);
    detail();
    const historyLength = window.history.length;
    act(() => { upcoming().click(); all().click(); upcoming().click(); });
    expectSelection(true);
    const query = new URLSearchParams(window.location.search);
    expect(query.get('schedule')).toBe('upcoming');
    expect(query.get('from')).toBe('/my/leagues');
    expect(query.get('q')).toBe('합성');
    expect(query.get('extra')).toBe('keep');
    expect(window.location.hash).toBe('#league-schedule');
    expect(window.history.length).toBe(historyLength);
    expect(fixture.homeScore).toBe(1);
    expect(fixture.awayScore).toBe(0);
  });

  it('빈 결과의 전체 보기 CTA도 URL 필터를 제거하고 종료 경기 결과를 복원한다', () => {
    window.history.replaceState(null, '', `${detailPath}?schedule=upcoming&extra=keep`);
    detail();
    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
    expectSelection(false);
    expect(new URLSearchParams(window.location.search).has('schedule')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('extra')).toBe('keep');
  });

  it('마운트를 유지한 실제 Back/Forward도 URL 선택을 복원한다', async () => {
    window.history.replaceState(null, '', `${detailPath}?schedule=upcoming`);
    detail();
    act(() => {
      router.push(`${detailPath}?extra=keep`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expectSelection(false);
    await travel('back');
    expectSelection(true);
    await travel('forward');
    expectSelection(false);
  });

  it('늦은 router snapshot이 마지막 로컬 선택을 덮어쓰지 않는다', () => {
    window.history.replaceState(null, '', `${detailPath}?schedule=upcoming`);
    const view = detail();
    fireEvent.click(all());
    state.snapshot = '?schedule=upcoming';
    view.rerender(<LeagueMatchStandingsClient leagueId="synthetic-league" />);
    expectSelection(false);
    expect(new URLSearchParams(window.location.search).has('schedule')).toBe(false);
    state.snapshot = null;
    view.rerender(<LeagueMatchStandingsClient leagueId="synthetic-league" />);
    expectSelection(false);
  });

  it.each(['error', 'pending'] as const)('URL 필터가 있어도 API %s를 정상 빈 결과로 숨기지 않는다', (kind) => {
    state[kind] = true;
    window.history.replaceState(null, '', `${detailPath}?schedule=upcoming`);
    detail();
    expect(screen.queryByText('예정된 경기가 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '경기 일정 필터' })).not.toBeInTheDocument();
    if (kind === 'error') expect(screen.getByText('합성 API 오류')).toBeInTheDocument();
  });
});
