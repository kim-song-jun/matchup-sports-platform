import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRecordsPageClient } from './user-records-page-client';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import type { PublicUserRecordItem, PublicUserRecordsResponse, TeamRecordCategory } from '@/components/public-game-records/types';
import { __resetNavigationHistoryForTests, decideBackAction, installNavigationHistory } from '@/lib/navigation-history';

const boundary = vi.hoisted(() => ({
  records: vi.fn(), personal: vi.fn(), refetch: vi.fn(), more: vi.fn(),
  searchOverride: undefined as string | undefined,
  owner: true, responseUserId: undefined as string | undefined,
  loading: false, failed: false, hasNext: false,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(boundary.searchOverride ?? window.location.search),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: vi.fn() }));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicUserRecords: (...args: unknown[]) => boundary.records(...args),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyMatchesInfinite: (...args: unknown[]) => boundary.personal(...args),
}));

const recordsPath = '/users/fixture-user/records';
const labels = { all: '전체', league: '리그', tournament: '대회', friendly: '친선', personal: '개인' };
function item(type: TeamRecordCategory, index: number): PublicUserRecordItem {
  return {
    id: `fixture-${type}-${index}`, gameId: `fixture-game-${index}`, teamMatchId: `fixture-match-${type}-${index}`,
    type, matchType: type === 'tournament' ? 'tournament' : 'team_match',
    tournamentId: type === 'tournament' ? 'fixture-tournament' : null,
    tournamentTitle: type === 'tournament' ? '합성 대회' : null,
    leagueId: type === 'league' ? 'fixture-league' : null, leagueTitle: type === 'league' ? '합성 리그' : null,
    round: null, teamId: 'fixture-team', teamName: '합성 홈팀', opponentTeamId: 'fixture-opponent', opponentTeamName: '합성 원정팀',
    result: 'WON', goals: 1, assists: 0, cards: { yellow: 0, red: 0 }, minutesPlayed: 90,
    started: true, goalkeeper: false, mvp: false, officialAt: '2026-09-20T00:00:00.000Z',
  };
}
const allItems = [item('league', 1), item('tournament', 2), item('tournament', 3), item('friendly', 4), item('friendly', 5)];
function totals(appearances: number) {
  return { appearances, goals: appearances, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 };
}
function response(userId: string, type?: TeamRecordCategory): PublicUserRecordsResponse {
  return {
    userId: boundary.responseUserId ?? userId, nickname: '합성 사용자', viewerIsOwner: boundary.owner,
    ...(boundary.owner ? { consentGranted: false } : {}),
    summary: { ...totals(5), matchMvpCount: 0, tournamentAwardCount: 0, byType: { league: totals(1), tournament: totals(2), friendly: totals(2) } },
    tournamentAwards: [], items: type ? allItems.filter((entry) => entry.type === type) : allItems, nextCursor: null,
  };
}
function pageUi(userId = 'fixture-user') {
  return <><AppBackLink fallbackHref={`/users/${userId}`}>기록 뒤로가기</AppBackLink><UserRecordsPageClient userId={userId} /></>;
}
function renderPage(userId = 'fixture-user') { return render(pageUi(userId)); }
function tab(key: keyof typeof labels) { return screen.getByRole('tab', { name: labels[key] }); }
function selected(key: keyof typeof labels) { expect(tab(key)).toHaveAttribute('aria-selected', 'true'); }
function recordLinks() {
  return screen.getAllByRole('link').filter((link) => /^\/(league-matches|tournaments|team-matches)\//.test(link.getAttribute('href') ?? ''));
}
function currentType() { return new URLSearchParams(window.location.search).get('type'); }
async function traverse(method: 'back' | 'forward') {
  await act(async () => {
    const pop = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history[method]();
    await pop;
  });
}

describe('활동 기록 실제 client의 URL·상세 복귀 계약', () => {
  beforeEach(() => {
    __resetNavigationHistoryForTests();
    window.history.replaceState(null, '', `${recordsPath}?from=%2Fmy`);
    boundary.searchOverride = undefined; boundary.owner = true; boundary.responseUserId = undefined;
    boundary.loading = false; boundary.failed = false; boundary.hasNext = false;
    boundary.refetch.mockReset(); boundary.more.mockReset();
    boundary.records.mockReset().mockImplementation((userId: string, _season: unknown, type?: TeamRecordCategory) => ({
      data: boundary.loading ? undefined : { pages: [response(userId, type)] },
      isLoading: boundary.loading, isError: boundary.failed, error: boundary.failed ? new Error('합성 조회 오류') : null,
      refetch: boundary.refetch, hasNextPage: boundary.hasNext, isFetchingNextPage: false, fetchNextPage: boundary.more,
    }));
    boundary.personal.mockReset().mockImplementation((mode: 'joined' | 'created') => ({
      isLoading: false, isError: false, hasNextPage: false,
      data: { pages: [{ items: mode === 'joined' ? [{
        id: 'fixture-personal', title: '합성 개인 매치', startsAt: '2026-09-20T09:00:00.000Z',
        status: 'completed', displayState: 'completed', viewer: { participantStatus: 'active' },
        host: { displayName: '합성 호스트' }, hostParticipates: true,
      }] : [] }] },
    }));
  });

  it.each(['league', 'tournament', 'friendly'] as const)('%s URL 진입의 탭·조회 조건·목록·상세 복귀 주소가 일치한다', (type) => {
    window.history.replaceState(null, '', `${recordsPath}?type=${type}&from=%2Fmy`);
    renderPage();
    selected(type);
    expect(boundary.records).toHaveBeenLastCalledWith('fixture-user', undefined, type);
    expect(recordLinks()).toHaveLength(type === 'league' ? 1 : 2);
    const from = new URL(recordLinks()[0]!.getAttribute('href')!, window.location.origin).searchParams.get('from')!;
    expect(new URL(from, window.location.origin).searchParams.get('type')).toBe(type);
    expect(new URL(from, window.location.origin).searchParams.get('from')).toBe('/my');
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/my');
  });

  it('선택 → 실제 상세 href의 from으로 재마운트해도 리그 1건과 마이 복귀를 유지한다', () => {
    const page = renderPage();
    fireEvent.click(tab('league'));
    const from = new URL(recordLinks()[0]!.getAttribute('href')!, window.location.origin).searchParams.get('from')!;
    page.unmount();
    window.history.replaceState(null, '', from);
    renderPage();
    selected('league'); expect(recordLinks()).toHaveLength(1);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/my');
  });

  it('실제 native Back/Forward 뒤 query snapshot 재렌더가 선택 탭과 조회를 복원한다', async () => {
    window.history.replaceState(null, '', `${recordsPath}?type=league&from=%2Fmy`);
    const page = renderPage();
    window.history.pushState(null, '', `${recordsPath}?type=tournament&from=%2Fmy`);
    page.rerender(pageUi());
    await traverse('back'); page.rerender(pageUi());
    await waitFor(() => selected('league')); expect(recordLinks()).toHaveLength(1);
    await traverse('forward'); page.rerender(pageUi());
    await waitFor(() => selected('tournament')); expect(recordLinks()).toHaveLength(2);
  });

  it('빠른 연속 선택은 현재 query/hash를 보존하며 history 항목을 늘리지 않는다', () => {
    window.history.replaceState(null, '', `${recordsPath}?from=%2Fmy&trace=fixture#records`);
    const length = window.history.length;
    renderPage();
    for (const key of ['league', 'friendly', 'tournament', 'all', 'league'] as const) fireEvent.click(tab(key));
    selected('league'); expect(recordLinks()).toHaveLength(1); expect(currentType()).toBe('league');
    expect(new URLSearchParams(window.location.search).get('trace')).toBe('fixture');
    expect(window.location.hash).toBe('#records'); expect(window.history.length).toBe(length);
  });

  it('옛 query echo가 늦게 도착해도 마지막 선택과 상세 from을 덮어쓰지 않는다', () => {
    boundary.searchOverride = 'from=%2Fmy';
    const page = renderPage();
    fireEvent.click(tab('league')); fireEvent.click(tab('friendly'));
    selected('friendly'); expect(currentType()).toBe('friendly'); expect(window.location.pathname).toBe(recordsPath);
    boundary.searchOverride = 'from=%2Fmy&type=league';
    page.rerender(pageUi());
    selected('friendly'); expect(currentType()).toBe('friendly'); expect(recordLinks()).toHaveLength(2);
    expect(new URL(new URL(recordLinks()[0]!.getAttribute('href')!, window.location.origin).searchParams.get('from')!, window.location.origin).searchParams.get('type')).toBe('friendly');
  });

  it('다른 사용자 route에서는 이전 사용자 선택을 가져오지 않는다', () => {
    const page = renderPage(); fireEvent.click(tab('league'));
    window.history.replaceState(null, '', '/users/fixture-other/records?from=%2Fmy');
    boundary.owner = false;
    page.rerender(pageUi('fixture-other'));
    selected('all'); expect(recordLinks()).toHaveLength(5);
    expect(boundary.records).toHaveBeenLastCalledWith('fixture-other', undefined, undefined);
    expect(screen.queryByRole('tab', { name: '개인' })).not.toBeInTheDocument();
  });

  it('현재 사용자 본인 확인 후 개인 URL은 실제 기존 내 매치 패널과 복귀 주소를 사용한다', () => {
    window.history.replaceState(null, '', `${recordsPath}?type=personal&from=%2Fmy`);
    renderPage(); selected('personal');
    expect(screen.getByRole('link', { name: /합성 개인 매치/ })).toBeInTheDocument();
    expect(boundary.personal).toHaveBeenCalledWith('joined'); expect(boundary.personal).toHaveBeenCalledWith('created');
    expect(boundary.records).toHaveBeenLastCalledWith('fixture-user', undefined, undefined);
    const from = new URL(screen.getByRole('link', { name: /합성 개인 매치/ }).getAttribute('href')!, window.location.origin).searchParams.get('from')!;
    expect(new URL(from, window.location.origin).searchParams.get('type')).toBe('personal');
  });

  it('타인의 personal URL은 개인 패널을 열거나 내 매치 조회를 시작하지 않는다', () => {
    boundary.owner = false;
    window.history.replaceState(null, '', `${recordsPath}?type=personal`);
    renderPage(); selected('all'); expect(boundary.personal).not.toHaveBeenCalled();
    expect(screen.queryByText('합성 개인 매치')).not.toBeInTheDocument();
  });

  it('본인 미확인 로딩 상태는 personal 패널을 렌더하지 않는다', () => {
    boundary.loading = true;
    window.history.replaceState(null, '', `${recordsPath}?type=personal`);
    renderPage(); expect(boundary.personal).not.toHaveBeenCalled(); expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('이전 사용자 본인 응답으로 새 route의 personal 패널을 열지 않는다', () => {
    boundary.responseUserId = 'fixture-other';
    window.history.replaceState(null, '', `${recordsPath}?type=personal`);
    renderPage(); selected('all'); expect(boundary.personal).not.toHaveBeenCalled();
    fireEvent.click(tab('personal')); selected('all'); expect(boundary.personal).not.toHaveBeenCalled();
  });

  it.each(['', 'unknown', 'LEAGUE'])('허용하지 않은 type=%s는 전체 대조군을 렌더한다', (type) => {
    window.history.replaceState(null, '', `${recordsPath}?type=${type}`);
    renderPage(); selected('all'); expect(recordLinks()).toHaveLength(5);
    expect(boundary.records).toHaveBeenLastCalledWith('fixture-user', undefined, undefined);
  });

  it('전체 선택은 type을 제거하고 재마운트에도 전체 5건을 유지한다', () => {
    window.history.replaceState(null, '', `${recordsPath}?type=league&from=%2Fmy`);
    const page = renderPage(); fireEvent.click(tab('all'));
    expect(currentType()).toBeNull(); page.unmount(); renderPage(); selected('all'); expect(recordLinks()).toHaveLength(5);
  });

  it('조회 실패 후 실제 재시도에도 선택과 비공개 안내를 유지한다', () => {
    window.history.replaceState(null, '', `${recordsPath}?type=league&from=%2Fmy`);
    boundary.failed = true;
    const page = renderPage(); fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(boundary.refetch).toHaveBeenCalledTimes(1); expect(currentType()).toBe('league');
    boundary.failed = false; page.rerender(pageUi());
    selected('league'); expect(screen.getByText('이 기록은 아직 나에게만 보여요')).toBeInTheDocument(); expect(recordLinks()).toHaveLength(1);
  });

  it('외부 from은 제외하면서 선택 탭을 상세 복귀 주소에 유지한다', () => {
    window.history.replaceState(null, '', `${recordsPath}?type=league&from=https%3A%2F%2Fevil.example`);
    renderPage(); selected('league');
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/users/fixture-user');
    const from = new URL(recordLinks()[0]!.getAttribute('href')!, window.location.origin).searchParams.get('from')!;
    expect(new URL(from, window.location.origin).searchParams.get('type')).toBe('league');
    expect(new URL(from, window.location.origin).searchParams.get('from')).toBeNull();
  });

  it('공유 history mirror도 탭 replace 후 동일 상세 출처에 실제 back을 선택한다', () => {
    installNavigationHistory();
    const page = renderPage(); fireEvent.click(tab('league'));
    const href = recordLinks()[0]!.getAttribute('href')!;
    const from = new URL(href, window.location.origin).searchParams.get('from')!;
    page.unmount(); window.history.pushState(null, '', href);
    expect(decideBackAction(from)).toBe('back');
    __resetNavigationHistoryForTests();
  });

  it('종류 선택 뒤 실제 더 보기 handler와 해당 조회 조건을 유지한다', () => {
    boundary.hasNext = true;
    renderPage(); fireEvent.click(tab('league')); fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(boundary.more).toHaveBeenCalledTimes(1); selected('league'); expect(currentType()).toBe('league');
    expect(boundary.records).toHaveBeenLastCalledWith('fixture-user', undefined, 'league');
  });
});
