import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BracketScheduleTab } from '@/app/tournaments/[id]/bracket/bracket-page-client';
import { LeagueScheduleContent } from './league-schedule-content';
import { V1ApiError } from '@/lib/api-client';
import type { PublicScheduleEntry, PublicStandingRow, PublicTournamentScheduleResponse } from './types';

const mocks = vi.hoisted(() => ({ teams: vi.fn(), schedule: vi.fn(), fixtures: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTeams: mocks.teams, useV1MyTournamentFixtures: mocks.fixtures, useV1Tournament: vi.fn(),
}));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTournamentSchedule: mocks.schedule, usePublicTournamentPlayerRecords: () => ({}),
}));

const path = '/tournaments/league-1/bracket';
const base = `${path}?from=%2Ftournaments%3Fkind%3Dleague&keep=1#schedule`;
const side = (id: string) => ({ registrationId: id, teamId: id, teamName: id });
function entry(id: string, home: string, away: string, overrides: Partial<PublicScheduleEntry> = {}): PublicScheduleEntry {
  return { fixtureId: id, round: '1주차', fixtureNumber: 1, legNumber: 1, groupId: null, groupName: null,
    scheduledAt: '2026-10-20T10:00:00Z', venue: null, fieldId: null, fieldName: null,
    home: side(home), away: side(away), homeSlotLabel: null, awaySlotLabel: null,
    visibilityMode: 'live', status: 'scheduled', resultState: 'pending', scoreStatus: 'unavailable', score: null,
    clock: null, periodBreak: null, scorers: [], cards: [], outcome: null, hasVideo: false, ...overrides };
}
function standing(teamId: string): PublicStandingRow {
  return { groupId: 'league-1', groupName: '리그 순위', teamId, teamName: teamId, teamLogoUrl: null,
    position: 1, sharedRank: null, points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
}
function data(): PublicTournamentScheduleResponse {
  return { tournamentId: 'league-1', tournamentTitle: '합성 리그', bracketPublished: true,
    items: [entry('home-game', 'mine-a', 'other'), entry('away-game', 'other', 'mine-b', { status: 'ended' }),
      entry('live-mine', 'mine-a', 'other', { status: 'live' }), entry('live-other', 'other', 'other-2', { status: 'live' }),
      entry('other-game', 'other', 'other-2')],
    unscheduled: [entry('unset-mine', 'other', 'mine-b', { scheduledAt: null }),
      entry('unset-other', 'other', 'other-2', { scheduledAt: null })],
    standings: [standing('mine-a'), standing('mine-b'), standing('other')], nextCursor: null };
}
const query = (value = data(), hasNextPage = false) => ({ data: { pages: [value] },
  isPending: false, isError: false, isFetching: false, hasNextPage, isFetchingNextPage: hasNextPage,
  fetchNextPage: vi.fn(), refetch: vi.fn() });
const mine = () => fireEvent.click(screen.getByRole('switch', { name: '내 팀만' }));
const all = () => fireEvent.click(screen.getByRole('switch', { name: '내 팀만' }));
const gameIds = () => screen.queryAllByRole('link').flatMap((link) => {
  const href = link.getAttribute('href') ?? '';
  return href.includes('/fixtures/') ? [new URL(href, 'https://teameet.invalid').pathname.split('/').at(-1)] : [];
});
const href = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
function mount() { return render(<BracketScheduleTab tournamentId="league-1" isRegularLeague fromHref={href()} />); }

beforeEach(() => {
  window.history.replaceState({ marker: 'keep' }, '', base);
  window.localStorage.clear();
  window.localStorage.setItem('teameet.v1.userId', 'synthetic-user');
  mocks.teams.mockReturnValue({ data: { items: [
    { teamId: 'mine-a', role: 'member', status: 'active' }, { teamId: 'mine-b', role: 'manager', status: 'active' },
    { teamId: 'other', role: 'member', status: 'pending' },
  ] }, isPending: false, isError: false, error: null, refetch: vi.fn() });
  mocks.schedule.mockReturnValue(query());
  mocks.fixtures.mockReturnValue({ data: undefined });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); window.localStorage.clear(); });

describe('정규 리그 bracket 일정의 전체/내 팀 계약', () => {
  it('전체가 기본이며 일반 멤버·복수 팀·홈/원정·종료·live·시간 미정 경기를 모두 필터한다', () => {
    const result = mount();
    expect(screen.queryByRole('heading', { name: '경기 일정' })).not.toBeInTheDocument();
    const phaseFilters = screen.getByRole('tablist', { name: '경기 일정 보기' });
    expect(phaseFilters.parentElement).toContainElement(screen.getByRole('switch', { name: '내 팀만' }));
    expect(gameIds()).toHaveLength(7);
    mine();
    expect(gameIds().sort()).toEqual(['away-game', 'home-game', 'live-mine', 'unset-mine']);
    expect(screen.getByText('총 4경기')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '진행 중인 경기' })).getAllByRole('link')).toHaveLength(1);
    expect(result.container.querySelectorAll('.tm-schedule-card-mine')).toHaveLength(4);
    expect(screen.getAllByRole('switch', { name: '내 팀만' })).toHaveLength(1);
    expect(mocks.fixtures).toHaveBeenCalledWith('league-1', { enabled: false });
    all();
    expect(gameIds()).toHaveLength(7);
  });

  it('비로그인은 로그인 안내와 원래 필터·출처가 담긴 redirect를 받는다', () => {
    window.localStorage.clear(); mount(); mine();
    expect(gameIds()).toHaveLength(0);
    const url = new URL(screen.getByRole('link', { name: '로그인하기' }).getAttribute('href')!, 'https://teameet.invalid');
    const redirect = new URL(url.searchParams.get('redirect')!, 'https://teameet.invalid');
    expect(redirect.pathname).toBe(path);
    expect(redirect.searchParams.get('teamScope')).toBe('mine');
    expect(redirect.searchParams.get('from')).toBe('/tournaments?kind=league');
    expect(redirect.hash).toBe('#schedule');
    expect(mocks.teams).toHaveBeenLastCalledWith(undefined, { enabled: false });
  });

  it('미참가 안내와 전체 일정 복귀 버튼을 제공한다', () => {
    mocks.teams.mockReturnValue({ data: { items: [] }, isPending: false, isError: false });
    window.history.replaceState({}, '', base.replace('#schedule', '&teamScope=mine#schedule'));
    mount();
    expect(screen.getByText('이 리그에 참가하는 내 팀이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '전체 일정 보기' }));
    expect(gameIds()).toHaveLength(7);
    expect(new URL(window.location.href).searchParams.has('teamScope')).toBe(false);
    expect(screen.queryByRole('switch', { name: '내 팀만' })).not.toBeInTheDocument();
  });

  it('참가 후 대진 미배정은 미참가와 구별한다', () => {
    mocks.schedule.mockReturnValue(query({ ...data(), items: [], unscheduled: [] }));
    mount(); mine();
    expect(screen.getByText('내 팀에 배정된 경기가 아직 없어요')).toBeInTheDocument();
    expect(screen.queryByText('이 리그에 참가하는 내 팀이 없어요')).not.toBeInTheDocument();
  });

  it('팀 API 실패는 빈 결과로 숨기지 않고 원인·재시도를 표시한다', () => {
    const refetch = vi.fn();
    mocks.teams.mockReturnValue({ data: undefined, isPending: false, isError: true,
      error: new Error('합성 팀 조회 실패'), refetch });
    mount(); mine();
    expect(screen.getByRole('alert')).toHaveTextContent('합성 팀 조회 실패');
    expect(gameIds()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('만료된 세션은 로그인 복귀로 안내한다', () => {
    mocks.teams.mockReturnValue({ isPending: false, isError: true,
      error: new V1ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: '만료' } as never) });
    mount(); mine();
    expect(screen.getByRole('link', { name: '로그인하기' })).toBeInTheDocument();
  });

  it('후속 페이지가 남으면 빈 결과를 확정하지 않고 마지막 페이지의 내 팀 경기를 표시한다', () => {
    mocks.schedule.mockReturnValue(query({ ...data(), items: [entry('other-game', 'other', 'other-2')], unscheduled: [] }, true));
    const result = mount(); mine();
    expect(screen.getByRole('status', { name: '내 팀 일정 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('내 팀에 배정된 경기가 아직 없어요')).not.toBeInTheDocument();
    mocks.schedule.mockReturnValue({ ...query(), data: { pages: [
      { ...data(), items: [entry('other-game', 'other', 'other-2')], unscheduled: [] },
      { ...data(), items: [entry('late-mine', 'other', 'mine-a')], unscheduled: [] },
    ] } });
    result.rerender(<BracketScheduleTab tournamentId="league-1" isRegularLeague fromHref={base} />);
    expect(gameIds()).toEqual(['late-mine']);
    expect(screen.getByText('총 1경기')).toBeInTheDocument();
  });

  it('후속 페이지 실패는 전체 일정 오류로 표시한다', () => {
    mocks.schedule.mockReturnValue({ ...query(data(), true), isError: true, error: new Error('합성 커서 조회 실패') });
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('합성 커서 조회 실패');
    expect(gameIds()).toHaveLength(0);
  });

  it('팀 소속 로딩 동안 내 팀 빈 결과·건수를 표시하지 않는다', () => {
    mocks.teams.mockReturnValue({ data: undefined, isPending: true, isError: false });
    mount(); mine();
    expect(screen.getByRole('status', { name: '내 팀 일정 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('총 0경기')).not.toBeInTheDocument();
  });

  it('팀 공개 전에는 미참가로 단정하거나 숨겨진 ID를 추론하지 않는다', () => {
    const hidden = { registrationId: 'hidden-registration', teamId: null, teamName: null };
    mocks.schedule.mockReturnValue(query({ ...data(), items: [entry('hidden', 'mine-a', 'other', { home: hidden, away: hidden })],
      unscheduled: [], standings: [] }));
    mount(); mine();
    expect(screen.getByText('참가팀 공개 후 내 팀 일정을 확인할 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText('이 리그에 참가하는 내 팀이 없어요')).not.toBeInTheDocument();
  });

  it('선택·연속 토글·새로고침·상세 출처에 필터를 유지하며 from/hash/단계와 history state를 보존한다', () => {
    window.history.replaceState({ marker: 'keep' }, '', `${path}?from=%2Ftournaments%3Fkind%3Dleague&schedulePhase=knockout#schedule`);
    const result = mount(); mine(); all(); mine();
    const selected = href();
    expect(window.history.state).toMatchObject({ marker: 'keep' });
    const selectedUrl = new URL(selected, 'https://teameet.invalid');
    expect(selectedUrl.searchParams.get('schedulePhase')).toBe('knockout');
    expect(selectedUrl.searchParams.get('from')).toBe('/tournaments?kind=league');
    expect(selectedUrl.searchParams.get('teamScope')).toBe('mine');
    expect(selectedUrl.hash).toBe('#schedule');
    const gameLink = screen.getAllByRole('link').find((link) => link.getAttribute('href')?.includes('/fixtures/'))!;
    const returnUrl = new URL(new URL(gameLink.getAttribute('href')!, 'https://teameet.invalid').searchParams.get('from')!, 'https://teameet.invalid');
    expect(returnUrl.pathname).toBe(selectedUrl.pathname);
    expect([...returnUrl.searchParams].sort()).toEqual([...selectedUrl.searchParams].sort());
    expect(returnUrl.hash).toBe(selectedUrl.hash);
    result.unmount(); mount();
    expect(gameIds()).toHaveLength(4);
    expect(screen.getByRole('switch', { name: '내 팀만' })).toHaveAttribute('aria-checked', 'true');
  });

  it('history 복귀 이벤트는 최신 URL의 전체/내 팀 선택을 반영한다', () => {
    mount(); mine();
    act(() => { window.history.replaceState({}, '', base); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(gameIds()).toHaveLength(7);
  });

  it('대회 일정에는 새 소속 팀 필터를 추가하지 않는다', () => {
    render(<BracketScheduleTab tournamentId="league-1" fromHref={base} />);
    expect(screen.queryByRole('switch', { name: '내 팀만' })).not.toBeInTheDocument();
    expect(mocks.teams).not.toHaveBeenCalled();
  });

  it('공개 전 일정은 내 팀 배정 여부보다 공개 게이트를 우선한다', () => {
    render(<LeagueScheduleContent tournamentId="league-1" data={{ ...data(), bracketPublished: false }}
      fromHref={base} onLoadMore={vi.fn()} />); mine();
    expect(screen.getByText('대진표가 아직 공개되지 않았어요')).toBeInTheDocument();
    expect(gameIds()).toHaveLength(0);
  });
});
