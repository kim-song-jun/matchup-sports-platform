import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamRecordsPageClient } from './team-records-page-client';
import { TeamMatchSharedRecord } from '@/components/team-matches/team-match-shared-record';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { installActualNextReplaceBoundary, type NextRestoreAction } from '@/test/helpers/next-history-boundary';
import type { PublicTeamRecordItem, PublicTeamRecordsResponse, TeamRecordCategory } from '@/components/public-game-records/types';

const boundary = vi.hoisted(() => ({
  records: vi.fn(),
  searchOverride: undefined as string | undefined,
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(boundary.searchOverride ?? window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => boundary.router,
}));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: vi.fn() }));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTeamRecords: (...args: unknown[]) => boundary.records(...args),
}));
vi.mock('@/hooks/use-team-match-record', () => ({
  useTeamMatchRecord: () => ({ data: { phase: 'managed', leagueId: 'league-1', tournamentId: 'league-1', version: 1 } }),
  useMutateTeamMatchRecord: () => ({ isError: false }),
}));

const recordsPath = '/teams/team-1/records';
const bracketPath = '/tournaments/league-1/bracket?view=standings';
const labels = { league: '리그', tournament: '대회', friendly: '친선' } as const;
function item(type: TeamRecordCategory, year: string, index: number): PublicTeamRecordItem {
  return {
    gameId: `game-${index}`, teamMatchId: `match-${index}`,
    tournamentId: type === 'tournament' ? 'tournament-1' : null,
    tournamentTitle: type === 'tournament' ? '합성 대회' : null,
    leagueId: type === 'league' ? 'league-1' : null,
    leagueTitle: type === 'league' ? '합성 리그' : null,
    type, opponentTeamId: `opponent-${index}`, opponentTeamName: `합성 상대 ${index}`, opponentTeamLogoUrl: null,
    result: 'WON', goalsFor: 2, goalsAgainst: 1, playedAt: `${year}-09-20T09:00:00Z`, penalties: null, events: [],
  };
}
const items = [item('league', '2026', 1), item('league', '2025', 2), item('tournament', '2026', 3),
  item('tournament', '2025', 4), item('friendly', '2026', 5), item('friendly', '2025', 6)];
function totals(played: number) {
  return { played, won: played, drawn: 0, lost: 0, goalsFor: played * 2, goalsAgainst: played };
}
function response(teamId: string, season?: string, type?: TeamRecordCategory): PublicTeamRecordsResponse {
  const seasonal = items.filter((entry) => !season || entry.playedAt.startsWith(season));
  return {
    teamId, teamName: '합성 팀', teamLogoUrl: null, availableSeasons: ['2026', '2025'],
    summary: { ...totals(seasonal.length), byType: {
      league: totals(seasonal.filter((entry) => entry.type === 'league').length),
      tournament: totals(seasonal.filter((entry) => entry.type === 'tournament').length),
      friendly: totals(seasonal.filter((entry) => entry.type === 'friendly').length),
    } },
    items: type ? seasonal.filter((entry) => entry.type === type) : seasonal, nextCursor: null,
  };
}
function renderRecords(teamId = 'team-1') {
  // The test router handles ordinary Next links; AppBackLink still runs its real click action.
  return render(<div onClick={(event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const href = event.target.closest('a')?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    boundary.router.push(href);
  }}><TeamRecordsPageClient teamId={teamId} /></div>);
}
function recordLinks() {
  return screen.queryAllByRole('link').filter((link) => /^\/(team-matches|tournaments)\//.test(link.getAttribute('href') ?? ''));
}
function selected(type: string, season = 'all') {
  expect(screen.getByRole('tab', { name: type })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('combobox', { name: '시즌' })).toHaveValue(season);
}
function count(played: number) {
  const stat = screen.getByText('경기', { exact: true, selector: 'div.tm-text-micro' }).parentElement;
  if (!stat) throw new Error('경기 요약을 찾지 못했어요.');
  expect(within(stat).getByText(String(played), { exact: true, selector: 'div.tab-num' })).toHaveTextContent(`${played}경기`);
  expect(recordLinks()).toHaveLength(played);
}
function url(href = window.location.href) { return new URL(href, window.location.origin); }
let restoreNextHistory: (() => void) | undefined;

describe('팀 전적의 실제 필터·경기 상세·화면 뒤로가기 계약', () => {
  afterEach(() => {
    restoreNextHistory?.();
    restoreNextHistory = undefined;
  });
  beforeEach(() => {
    __resetNavigationHistoryForTests();
    boundary.searchOverride = undefined;
    window.history.replaceState(null, '', `${recordsPath}?from=${encodeURIComponent(bracketPath)}`);
    boundary.router.push.mockReset().mockImplementation((href: string) => window.history.pushState(null, '', href));
    boundary.router.replace.mockReset().mockImplementation((href: string) => window.history.replaceState(null, '', href));
    boundary.router.back.mockReset();
    boundary.records.mockReset().mockImplementation((teamId: string, season?: string, type?: TeamRecordCategory) => ({
      data: { pages: [response(teamId, season, type)] }, isPending: false, isError: false, error: null,
      refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    }));
  });

  it('리그+2026시즌 선택과 1경기 집계를 정상 리그 redirect 및 앱 뒤로가기 뒤에도 유지한다', () => {
    let view = renderRecords();
    selected('전체'); count(6);
    fireEvent.click(screen.getByRole('tab', { name: '리그' }));
    fireEvent.change(screen.getByRole('combobox', { name: '시즌' }), { target: { value: '2026' } });
    selected('리그', '2026'); count(1);
    const matchLink = recordLinks()[0];
    if (!matchLink) throw new Error('리그 경기 링크가 없어요.');
    fireEvent.click(matchLink);
    expect(window.location.pathname).toBe('/team-matches/match-1/record');
    view.unmount();

    view = render(<TeamMatchSharedRecord teamMatchId="match-1" />);
    expect(window.location.pathname).toBe('/league-matches/league-1/fixtures/match-1');
    view.unmount();
    view = render(<AppBackLink fallbackHref="/league-matches/league-1">뒤로가기</AppBackLink>);
    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
    expect(window.location.pathname).toBe(recordsPath);
    view.unmount();

    renderRecords();
    selected('리그', '2026'); count(1);
    expect(boundary.records).toHaveBeenLastCalledWith('team-1', '2026', 'league');
    expect(url().searchParams.get('type')).toBe('league');
    expect(url().searchParams.get('season')).toBe('2026');
    expect(url().searchParams.get('from')).toBe(bracketPath);
    render(<AppBackLink fallbackHref="/teams/team-1">뒤로가기</AppBackLink>);
    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
    expect(window.location.pathname).toBe('/tournaments/league-1/bracket');
    expect(url().searchParams.get('view')).toBe('standings');
  });

  it.each(['league', 'tournament', 'friendly'] as const)('%s+2025 URL 진입이 탭·시즌·조회·집계·복귀 주소에 함께 반영된다', (type) => {
    window.history.replaceState(null, '', `${recordsPath}?type=${type}&season=2025&from=${encodeURIComponent(bracketPath)}`);
    renderRecords();
    selected(labels[type], '2025'); count(1);
    expect(boundary.records).toHaveBeenLastCalledWith('team-1', '2025', type);
    const returnHref = url(recordLinks()[0]?.getAttribute('href') ?? '').searchParams.get('from');
    if (!returnHref) throw new Error('복귀 주소가 없어요.');
    expect(url(returnHref).searchParams.get('type')).toBe(type);
    expect(url(returnHref).searchParams.get('season')).toBe('2025');
    expect(url(returnHref).searchParams.get('from')).toBe(bracketPath);
  });

  it('연속 선택은 두 조건과 기존 query를 보존하고 전체로 돌릴 때 해당 조건만 지운다', () => {
    window.history.replaceState(null, '', `${recordsPath}?keep=summary&from=${encodeURIComponent(bracketPath)}`);
    renderRecords();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: '리그' }));
      fireEvent.change(screen.getByRole('combobox', { name: '시즌' }), { target: { value: '2026' } });
    });
    selected('리그', '2026'); count(1);
    expect(url().searchParams.get('type')).toBe('league');
    expect(url().searchParams.get('season')).toBe('2026');
    expect(url().searchParams.get('keep')).toBe('summary');
    fireEvent.click(screen.getByRole('tab', { name: '전체' }));
    selected('전체', '2026'); count(3);
    expect(url().searchParams.has('type')).toBe(false);
    expect(url().searchParams.get('season')).toBe('2026');
    fireEvent.change(screen.getByRole('combobox', { name: '시즌' }), { target: { value: 'all' } });
    selected('전체'); count(6);
    expect(url().searchParams.has('season')).toBe(false);
    expect(url().searchParams.get('from')).toBe(bracketPath);
  });

  it('잘못된 종류·시즌은 서버로 전달하지 않고 외부 출처를 복귀 링크에서 제거한다', () => {
    window.history.replaceState(null, '', `${recordsPath}?type=personal&season=2026bad&from=https%3A%2F%2Fevil.invalid`);
    renderRecords();
    selected('전체'); count(6);
    expect(boundary.records).toHaveBeenLastCalledWith('team-1', undefined, undefined);
    const returnHref = url(recordLinks()[0]?.getAttribute('href') ?? '').searchParams.get('from');
    expect(returnHref).toBe(recordsPath);
  });

  it('설치된 Next의 native replace가 필터 URL을 복원하고 내부 router tree를 유지한다', () => {
    const tree = ['synthetic-records-tree'];
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree }, '', window.location.href);
    const restores: NextRestoreAction[] = [];
    restoreNextHistory = installActualNextReplaceBoundary((action) => restores.push(action));
    renderRecords();
    fireEvent.click(screen.getByRole('tab', { name: '리그' }));
    fireEvent.change(screen.getByRole('combobox', { name: '시즌' }), { target: { value: '2026' } });
    selected('리그', '2026'); count(1);
    expect(restores).toHaveLength(2);
    expect(restores[1]?.url.searchParams.get('type')).toBe('league');
    expect(restores[1]?.url.searchParams.get('season')).toBe('2026');
    expect(window.history.state).toMatchObject({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree });
  });

  it('늦게 온 이전 query는 최신 선택을 덮지 않고 실제 URL 이동은 두 조건을 갱신한다', () => {
    const view = render(<TeamRecordsPageClient teamId="team-1" />);
    fireEvent.click(screen.getByRole('tab', { name: '리그' }));
    fireEvent.change(screen.getByRole('combobox', { name: '시즌' }), { target: { value: '2026' } });
    boundary.searchOverride = `type=tournament&season=2025&from=${encodeURIComponent(bracketPath)}`;
    view.rerender(<TeamRecordsPageClient teamId="team-1" />);
    selected('리그', '2026'); count(1);
    expect(boundary.records).toHaveBeenLastCalledWith('team-1', '2026', 'league');
    window.history.replaceState(null, '', `${recordsPath}?type=friendly&season=2025`);
    boundary.searchOverride = undefined;
    view.rerender(<TeamRecordsPageClient teamId="team-1" />);
    selected('친선', '2025'); count(1);
    expect(boundary.records).toHaveBeenLastCalledWith('team-1', '2025', 'friendly');
  });
});
