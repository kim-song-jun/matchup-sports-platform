import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShellFrame } from '@/components/v1-ui/app-shell-frame';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { clearStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import { createHistoryRouter, nextPopState } from '@/test/history-router';
import { v1LeagueVisibilityFixture } from '@/test/msw/league-visibility-handlers';
import type { V1LeagueFixture } from '@/types/league-match';
import LeagueMatchStandingsClient from './league-match-standings-client';
import LeagueFixtureDetailClient from './fixtures/[fixtureId]/league-fixture-detail-client';

const navigation = vi.hoisted(() => ({ delayedSearch: null as string | null }));
const nativeRouter = createHistoryRouter();
const currentHref = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const notifyNavigation = () => window.dispatchEvent(new Event('fixture-return-navigation'));
const router = {
  ...nativeRouter,
  push: vi.fn((href: string) => { navigation.delayedSearch = null; nativeRouter.push(href); notifyNavigation(); }),
  replace: vi.fn((href: string) => { navigation.delayedSearch = null; nativeRouter.replace(href); notifyNavigation(); }),
};
function useHistoryHref() {
  return useSyncExternalStore((notify) => {
    window.addEventListener('popstate', notify);
    window.addEventListener('fixture-return-navigation', notify);
    return () => {
      window.removeEventListener('popstate', notify);
      window.removeEventListener('fixture-return-navigation', notify);
    };
  }, currentHref);
}

// Next의 탐색 경계만 연결한다. API/hooks/consumer/셸/Back/history는 실제 구현이다.
vi.mock('next/navigation', () => ({
  usePathname: () => { useHistoryHref(); return window.location.pathname; },
  useSearchParams: () => { useHistoryHref(); return new URLSearchParams(navigation.delayedSearch ?? window.location.search); },
  useRouter: () => router,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} href={href} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.push(String(href));
    }}>{children}</a>
  ),
}));

const leagueId = 'qa59-league';
const leaguePath = `/league-matches/${leagueId}`;
const upstream = '/tournaments?kind=league&page=2#league-list';
const fixtures: V1LeagueFixture[] = Array.from({ length: 9 }, (_, index) => ({
  teamMatchId: `qa59-fixture-${index + 1}`, title: `합성 경기 ${index + 1}`,
  homeTeamId: 'qa59-home', awayTeamId: 'qa59-away', placeName: `합성 구장 ${index + 1}`,
  startAt: index < 7 ? `2020-01-0${index + 1}T09:00:00.000Z` : `2027-01-0${index - 6}T09:00:00.000Z`,
  status: index < 7 ? 'completed' : 'matched', gameState: index < 7 ? 'ENDED' : 'SCHEDULED',
  homeScore: index < 7 ? 1 : null, awayScore: index < 7 ? 0 : null, isForfeit: false,
}));
const league = { ...v1LeagueVisibilityFixture.publicDetail, leagueId, title: '합성 복귀 검증 리그', teamIds: ['qa59-home', 'qa59-away'], fixtures };
const fixturePath = (id: string) => `${leaguePath}/fixtures/${id}`;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-08T00:00:00.000Z' });
const clients: QueryClient[] = [];
let server: ReturnType<typeof setupServer>;
let leagueGets = 0;
let claimGets = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-08T00:00:00.000Z');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.clearAllMocks();
  navigation.delayedSearch = null;
  clearStoredV1Session();
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  leagueGets = 0;
  claimGets = 0;
  server = setupServer(
    http.get(`*/api/v1${leaguePath}`, () => { leagueGets += 1; return ok(league); }),
    http.get(`*/api/v1${leaguePath}/standings`, () => ok({ leagueId, standings: [
      { teamId: 'qa59-home', teamName: '합성 홈팀', teamLogoUrl: null, position: 1, played: 7, wins: 7, draws: 0, losses: 0, goalsFor: 7, goalsAgainst: 0, points: 21 },
      { teamId: 'qa59-away', teamName: '합성 원정팀', teamLogoUrl: null, position: 2, played: 7, wins: 0, draws: 0, losses: 7, goalsFor: 0, goalsAgainst: 7, points: 0 },
    ], pendingFixtures: [], champions: [], promotionDecided: false, promotionForecast: null, tieBreakOrder: ['points'] })),
    http.get(`*/api/v1${leaguePath}/player-records`, () => ok({ leagueId, goals: [], assists: [], hiddenByEligibility: false })),
    http.get('*/api/v1/team-matches/:fixtureId', ({ params }) => ok({ teamMatchId: params.fixtureId, gameId: null, viewer: { state: 'none', manageableHostTeam: false, manageableOpponentTeam: false, participantMember: false } })),
    // 게임 비공개 404는 실제 공개기록 contract의 요약 화면을 사용한다.
    http.get(`*/api/v1${leaguePath}/fixtures/:fixtureId/record`, () => HttpResponse.json({ status: 'error', statusCode: 404, code: 'LEAGUE_FIXTURE_NOT_FOUND', message: '게임 비공개예요.' }, { status: 404 })),
    http.get('*/api/v1/auth/me', () => ok({ user: { id: 'qa59-viewer' } })),
    http.get('*/api/v1/me/teams', () => ok({ items: [] })),
    http.get('*/api/v1/notifications', () => ok({ items: [], nextCursor: null })),
    http.get(`*/api/v1${leaguePath}/claimable-fixtures`, () => { claimGets += 1; return ok({ fixtures: [{ ...fixtures[0], claimableCount: 1 }] }); }),
    http.get(`*/api/v1/tournaments/${leagueId}/registrations/my-registrations`, () => ok([])),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.close();
  __resetNavigationHistoryForTests();
  clearStoredV1Session();
  navigation.delayedSearch = null;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function HistoryPage() {
  useHistoryHref();
  const pathname = window.location.pathname;
  const fixtureId = pathname.startsWith(`${leaguePath}/fixtures/`) ? pathname.split('/').at(-1) : undefined;
  return <AppShellFrame>{fixtureId
    ? <LeagueFixtureDetailClient key={pathname} leagueId={leagueId} fixtureId={fixtureId} />
    : pathname === leaguePath
      ? <LeagueMatchStandingsClient key={pathname} leagueId={leagueId} />
      : <p>상위 화면으로 돌아왔어요.</p>}</AppShellFrame>;
}
function renderAt(href: string) {
  nativeRouter.push(href);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><HistoryPage /></QueryClientProvider>);
}
const filters = () => within(screen.getByRole('group', { name: '경기 일정 필터' }));
function scheduleLinks() {
  const section = document.getElementById('league-schedule');
  if (!section) throw new Error('실제 경기 일정 section이 없어요.');
  return Array.from(section.querySelectorAll<HTMLAnchorElement>('a')).filter((link) => new URL(link.href).pathname.startsWith(`${leaguePath}/fixtures/`));
}
async function expectList(upcoming: boolean) {
  await screen.findByRole('group', { name: '경기 일정 필터' });
  // 실제 HTTP 데이터에서 종료7/예정2를 분류하는 consumer 결과를 확인한다.
  await waitFor(() => {
    expect(scheduleLinks().map((link) => new URL(link.href).pathname)).toEqual((upcoming ? fixtures.slice(7) : fixtures).map((fixture) => fixturePath(fixture.teamMatchId)));
    for (const link of scheduleLinks()) expect(link).toHaveTextContent('합성 홈팀');
  });
  expect(filters().getByRole('button', { name: '예정만' })).toHaveAttribute('aria-pressed', String(upcoming));
  expect(scheduleLinks().map((link) => new URL(link.href).pathname)).toEqual((upcoming ? fixtures.slice(7) : fixtures).map((fixture) => fixturePath(fixture.teamMatchId)));
}
async function returnFromFixture(source: string) {
  await screen.findByRole('link', { name: league.title });
  const backs = screen.getAllByRole('link', { name: '뒤로가기' });
  fireEvent.click(backs[0]);
  await expectList(new URL(source, window.location.origin).searchParams.get('schedule') === 'upcoming');
  expect(currentHref()).toBe(source);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
}

describe('MD-QA59 실제 리그 일정→경기 상세→페이지 복귀', () => {
  it.each(['', `?from=${encodeURIComponent(upstream)}&extra=keep#league-schedule`, '?schedule=upcoming'])('예정2를 선택하고 실제 상세·셸 Back으로 같은 URL과 목록을 복원한다 (%s)', async (query) => {
    renderAt(`${leaguePath}${query}`);
    await expectList(query === '?schedule=upcoming');
    if (query !== '?schedule=upcoming') fireEvent.click(filters().getByRole('button', { name: '예정만' }));
    await expectList(true);
    const source = currentHref();
    fireEvent.click(scheduleLinks()[0]);
    await returnFromFixture(source);
    // Back이 list를 replace/push해 중복시키지 않아야 다음 native Back이 상위 항목에 도달한다.
    await act(async () => { const pop = nextPopState(); window.history.back(); await pop; });
    expect(currentHref()).toBe('/home');
    expect(screen.getByText('상위 화면으로 돌아왔어요.')).toBeInTheDocument();
    expect(leagueGets).toBe(1);
  });

  it('늦은 Next query에서 예정만·전체·예정만을 연속 선택해도 최신 fixture 출처를 넘긴다', async () => {
    renderAt(`${leaguePath}?from=${encodeURIComponent(upstream)}&extra=keep#league-schedule`);
    await expectList(false);
    navigation.delayedSearch = window.location.search;
    const historyLength = window.history.length;
    fireEvent.click(filters().getByRole('button', { name: '예정만' }));
    fireEvent.click(filters().getByRole('button', { name: '전체' }));
    fireEvent.click(filters().getByRole('button', { name: '예정만' }));
    await expectList(true);
    expect(window.history.length).toBe(historyLength);
    const source = currentHref();
    expect(new URL(source, window.location.origin).searchParams.get('schedule')).toBe('upcoming');
    expect(new URL(source, window.location.origin).searchParams.get('from')).toBe(upstream);
    fireEvent.click(scheduleLinks()[0]);
    await returnFromFixture(source);
  });

  it('기록 연결 카드의 실제 GET·경기 링크에서도 예정2의 출처를 보존한다', async () => {
    saveStoredV1Session({ userId: 'qa59-viewer' });
    server.use(http.get(`*/api/v1${leaguePath}/player-records`, () => ok({ leagueId, goals: [], assists: [], hiddenByEligibility: true })));
    renderAt(`${leaguePath}?schedule=upcoming&from=${encodeURIComponent(upstream)}#league-schedule`);
    await expectList(true);
    const source = currentHref();
    fireEvent.click(await screen.findByRole('link', { name: '합성 경기 1 경기 상세로 이동, 아직 연결되지 않은 참가자 1명' }));
    await returnFromFixture(source);
    expect(claimGets).toBe(1);
  });

  it('직접 경기 진입의 같은 리그 출처는 본문 복귀에서도 query·hash·상위 출처를 유지한다', async () => {
    const source = `${leaguePath}?schedule=upcoming&from=${encodeURIComponent(upstream)}&extra=keep#league-schedule`;
    renderAt(`${fixturePath(fixtures[7].teamMatchId)}?from=${encodeURIComponent(source)}`);
    const parent = await screen.findByRole('link', { name: league.title });
    fireEvent.click(parent);
    await expectList(true);
    expect(currentHref()).toBe(source);
    expect(screen.queryByRole('link', { name: '전체 순위표·일정 보기' })).not.toBeInTheDocument();
  });

  it.each(['', 'https://unsafe.example/league', '//unsafe.example/league', '/..//unsafe.example/league'])('직접 진입·위험 출처는 같은 리그 전체9로 안전하게 복귀한다 (%s)', async (source) => {
    renderAt(`${fixturePath(fixtures[7].teamMatchId)}${source ? `?from=${encodeURIComponent(source)}` : ''}`);
    fireEvent.click(await screen.findByRole('link', { name: league.title }));
    await expectList(false);
    expect(currentHref()).toBe(leaguePath);
  });

  it('다른 리그 출처는 현재 리그 parent를 바꾸지 않고 안전한 상위 체인으로만 남긴다', async () => {
    const source = '/league-matches/qa59-other?schedule=upcoming#league-schedule';
    renderAt(`${fixturePath(fixtures[7].teamMatchId)}?from=${encodeURIComponent(source)}`);
    const parent = await screen.findByRole('link', { name: league.title });
    expect(parent).toHaveAttribute('href', `${leaguePath}?from=${encodeURIComponent(source)}`);
    expect(screen.getAllByRole('link', { name: '뒤로가기' }).every((link) => link.getAttribute('href') === source)).toBe(true);
  });
});
