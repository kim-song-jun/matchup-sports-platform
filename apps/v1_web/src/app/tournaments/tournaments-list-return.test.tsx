import { useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session } from '@/lib/session-storage';
import type { V1LeagueOverallStandingsResponse, V1TournamentDetail } from '@/types/api';
import { TournamentDetailPageClient } from './[id]/tournament-detail-client';
import { TournamentsListPageClient } from './tournaments-list-client';

// jsdom에는 Next 라우터가 없으므로 이동 경계만 대체한다. 목록·카드·상세·뒤로가기와 API 훅은 실제 구현이다.
const navigation = vi.hoisted(() => ({
  path: '/tournaments',
  history: new Array<string>(),
  index: 0,
  navigate: (_path: string, _replace = false) => {},
  back: () => {},
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.path.split('?')[0],
  useSearchParams: () => new URLSearchParams(navigation.path.split('?')[1]),
  useRouter: () => ({
    push: (path: string) => navigation.navigate(path),
    replace: (path: string) => navigation.navigate(path, true),
    back: navigation.back,
    prefetch: vi.fn(),
  }),
}));
vi.mock('next/link', () => ({
  default: ({ href, onClick, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a
      {...props}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented && href) {
          event.preventDefault();
          navigation.navigate(href);
        }
      }}
    />
  ),
}));

const TOURNAMENT_ID = 'ad120000-0000-4000-8000-000000000001';
const FILTERED_LIST = '/tournaments?kind=tournament&status=in_progress';
const tournament: V1TournamentDetail = {
  id: TOURNAMENT_ID,
  sportId: 'sport-futsal',
  sport: { code: 'futsal', name: '풋살' },
  title: '(테스트) 12팀·팀당 5명 대진 직접 입력',
  status: 'in_progress',
  format: 'knockout',
  kind: 'regular_tournament',
  registrationDeadlineAt: null,
  rosterDeadlineAt: null,
  bracketPublishedAt: null,
  bracketPublishScheduledAt: null,
  scheduledAt: null,
  scheduledEndAt: null,
  venue: null,
  latitude: null,
  longitude: null,
  coverImageUrl: null,
  teamCount: 12,
  minPlayers: 5,
  maxPlayers: 5,
  genderCategory: null,
  genderMinMale: null,
  genderMaxMale: null,
  genderMinFemale: null,
  genderMaxFemale: null,
  entryFee: 0,
  entryFeeConfigured: true,
  prizePool: null,
  prizeSummary: null,
  prizeBreakdown: null,
  promoHomeEnabled: false,
  promoHomeTitle: null,
  promoHomeSubtitle: null,
  promoHomeImageUrl: null,
  promoHomeBadgeText: null,
  promoHomeDateText: null,
  promoHomeTeamsText: null,
  promoHomeLocationText: null,
  promoHomePrizeText: null,
  promoHomePriority: 0,
  promoListEnabled: false,
  promoListTitle: null,
  promoListSubtitle: null,
  promoListImageUrl: null,
  promoListBadgeText: null,
  promoListDateText: null,
  promoListTeamsText: null,
  promoListLocationText: null,
  promoListPrizeText: null,
  promoListPriority: 0,
  campaignSlug: null,
  rulesText: null,
  yellowAccumulationLimit: null,
  redCardSuspensionMatches: null,
  refundPolicyText: null,
  confirmedCount: 0,
  participantTeams: [],
  pendingPaymentCount: 0,
  groups: [],
  fixtures: [],
  leagueFixtures: [],
  announcements: [],
  sponsors: [],
  reviews: [],
  reviewsTotalCount: 0,
  awards: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const items: V1TournamentDetail[] = [
  tournament,
  ...Array.from({ length: 5 }, (_, index) => ({ ...tournament, id: `ongoing-${index}`, title: `진행 대회 ${index + 2}` })),
  { ...tournament, id: 'open', title: '모집 대회', status: 'open' },
  { ...tournament, id: 'league', title: '정규 리그', kind: 'regular_league' },
];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: tournament.createdAt });
const server = setupServer(
  http.get('*/api/v1/master/sports', () => ok([{ id: tournament.sportId, ...tournament.sport }])),
  http.get('*/api/v1/tournaments', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind');
    const status = params.get('status');
    const filtered = items.filter((item) => (
      (!status || item.status === status)
      && (kind === 'tournament' ? item.kind === 'regular_tournament' : kind === 'league' ? item.kind === 'regular_league' : true)
    ));
    return ok({ items: filtered, pageInfo: { hasNext: false, nextCursor: null, total: filtered.length, page: 1, totalPages: 1 } });
  }),
  http.get('*/api/v1/tournaments/:id', () => ok(tournament)),
  http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' }, { status: 401 })),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
let queryClient: QueryClient;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  clearStoredV1Session();
  navigation.path = FILTERED_LIST;
  navigation.history = [];
  navigation.index = 0;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  server.close();
  server.resetHandlers();
  window.matchMedia = originalMatchMedia;
  vi.unstubAllEnvs();
});

function PublicRoute() {
  const [path, setPath] = useState(navigation.path);
  if (navigation.history.length === 0) navigation.history = [navigation.path];
  navigation.navigate = (next, replace = false) => {
    if (replace) navigation.history[navigation.index] = next;
    else {
      navigation.history = [...navigation.history.slice(0, navigation.index + 1), next];
      navigation.index += 1;
    }
    navigation.path = next;
    setPath(next);
  };
  navigation.back = () => {
    const previous = navigation.history[navigation.index - 1];
    if (previous === undefined) return;
    navigation.index -= 1;
    navigation.path = previous;
    setPath(previous);
  };
  return path.split('?')[0] === '/tournaments'
    ? <TournamentsListPageClient />
    : <TournamentDetailPageClient tournamentId={TOURNAMENT_ID} />;
}
function renderRoute() {
  return render(<QueryClientProvider client={queryClient}><PublicRoute /></QueryClientProvider>);
}
async function expectFilteredList() {
  await waitFor(() => expect(within(screen.getByRole('list', { name: '대회 목록' })).getAllByRole('listitem')).toHaveLength(6));
  expect(within(screen.getByRole('navigation', { name: '대회 유형' })).getByRole('link', { name: '정규 대회' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: '필터 열기 — 현재 진행 중' })).toBeInTheDocument();
  expect(screen.queryByText('모집 대회')).not.toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: '대회 목록' })).queryByRole('link', { name: /정규 리그/ })).not.toBeInTheDocument();
}

describe('MD-QA #22 — 공개 대회 상세 복귀', () => {
  it.each([
    [null, FILTERED_LIST],
    ['/home', `${FILTERED_LIST}&from=%2Fhome`],
    ['https://outside.example/tournaments', FILTERED_LIST],
  ])('정규 대회·진행 중 목록에서 상세 뒤로가기를 누르면 같은 선택과 6개 결과로 돌아온다 (상위 출처: %s)', async (parentFrom, returnPath) => {
    // Given: 유형·상태가 반영된 목록과 실제 API 필터 결과.
    navigation.path = parentFrom ? `${FILTERED_LIST}&from=${encodeURIComponent(parentFrom)}` : FILTERED_LIST;
    const user = userEvent.setup();
    renderRoute();
    await expectFilteredList();
    await user.click(screen.getByRole('link', { name: (name) => name.includes(tournament.title) }));
    await screen.findByRole('heading', { level: 1, name: tournament.title });

    // When: 상세 화면의 공통 뒤로가기 액션.
    await user.click(screen.getByRole('link', { name: '뒤로가기' }));

    // Then: URL뿐 아니라 선택 제어와 다른 종류·상태가 섞이지 않은 결과도 복원된다.
    expect(navigation.path).toBe(returnPath);
    await expectFilteredList();
  });

  it.each([null, 'https://outside.example/tournaments', '//outside.example/tournaments'])('직접 상세 진입의 출처 %s는 안전한 기본 목록으로 돌아간다', async (from) => {
    // Given: 목록 출처가 없거나 신뢰할 수 없는 상세 URL.
    navigation.path = `/tournaments/${TOURNAMENT_ID}${from ? `?from=${encodeURIComponent(from)}` : ''}`;
    renderRoute();
    await screen.findByRole('heading', { level: 1, name: tournament.title });

    // When: 앱 뒤로가기.
    await userEvent.click(screen.getByRole('link', { name: '뒤로가기' }));

    // Then: 외부로 이동하지 않고 기본 전체 목록의 결과를 보여준다.
    expect(navigation.path).toBe('/tournaments');
    await waitFor(() => expect(within(screen.getByRole('list', { name: '대회 목록' })).getAllByRole('listitem')).toHaveLength(8));
  });
});

describe('MD-QA #42 — 대회 목록 페이지 복귀', () => {
  const leagueList = '/tournaments?kind=league';
  const secondPage = `${leagueList}&page=2`;
  const leagues = Array.from({ length: 22 }, (_, index) => ({
    ...tournament,
    id: index === 20 ? TOURNAMENT_ID : `league-${index + 1}`,
    title: `정규 리그 ${index + 1}`,
    kind: 'regular_league',
  }));

  beforeEach(() => {
    window.matchMedia = (query: string) => ({
      matches: query.includes('1024px'), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
    server.use(
      http.get('*/api/v1/tournaments', ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = Number(params.get('page') ?? 1);
        const limit = Number(params.get('limit') ?? 20);
        const filtered = leagues.filter((item) => !params.get('status') || item.status === params.get('status'));
        return ok({
          items: filtered.slice((page - 1) * limit, page * limit),
          pageInfo: { page, total: filtered.length, totalPages: Math.ceil(filtered.length / limit), hasNext: page * limit < filtered.length, nextCursor: null },
        });
      }),
      http.get('*/api/v1/tournaments/:id', () => ok(leagues[20])),
      http.get('*/api/v1/tournaments/:id/standings/overall', () => ok({
        standings: [], progress: { total: 0, played: 0, remaining: 0, percent: 0 },
        magicNumber: null, recalculatedAt: null, champions: [], tieBreakGroups: [],
      } satisfies V1LeagueOverallStandingsResponse)),
    );
  });

  async function expectSecondPage() {
    await screen.findByText(/전체 22건 중 21–22/);
    const list = within(screen.getByRole('list', { name: '대회 목록' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect(list.getByRole('link', { name: /정규 리그 21/ })).toBeInTheDocument();
    expect(list.queryByText('정규 리그 1', { exact: true })).not.toBeInTheDocument();
  }

  it.each(['상단 뒤로가기', '브라우저 Back'])('2페이지에서 상세를 보고 %s 하면 URL과 21–22/22 결과를 복원한다', async (backAction) => {
    // Given: 실제 page API 응답으로 22개 리그의 두 번째 페이지를 선택한다.
    navigation.path = leagueList;
    const user = userEvent.setup();
    renderRoute();
    await screen.findByText(/전체 22건 중 1–20/);
    await user.click(screen.getByRole('button', { name: '2페이지' }));
    await expectSecondPage();
    expect(navigation.path).toBe(secondPage);
    await user.click(screen.getByRole('link', { name: /정규 리그 21/ }));
    await screen.findByRole('heading', { level: 1, name: '정규 리그 21' });
    expect(new URL(navigation.path, 'https://teameet.example').searchParams.get('from')).toBe(secondPage);

    // When: 상세의 앱 링크 또는 브라우저의 직전 history entry로 돌아간다.
    if (backAction === '상단 뒤로가기') await user.click(screen.getByRole('link', { name: '뒤로가기' }));
    else act(() => navigation.back());

    // Then: 같은 페이지의 URL과 실제 두 개 결과가 복원된다.
    expect(navigation.path).toBe(secondPage);
    await expectSecondPage();
  });

  it('page=2 URL로 직접 진입하면 두 번째 페이지를 조회한다', async () => {
    // Given: 새 목록 인스턴스에 전달된 두 번째 페이지 URL.
    navigation.path = secondPage;

    // When: 실제 API 훅을 사용하는 목록을 마운트한다.
    renderRoute();

    // Then: 첫 페이지가 아닌 21–22/22 결과를 보여준다.
    await expectSecondPage();
  });

  it.each([22, 1, 0])('범위를 벗어난 저장 URL은 실제 %i개 결과의 마지막 유효 페이지로 한 번 보정한다', async (count) => {
    // Given: 삭제 후 결과 범위를 벗어난 양수 페이지와 실제 서버의 더 작은 totalPages.
    navigation.path = `${leagueList}&page=9`;
    const requestedPages: number[] = [];
    const remaining = leagues.slice(0, count);
    const lastPage = Math.max(1, Math.ceil(count / 20));
    server.use(http.get('*/api/v1/tournaments', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') ?? 1);
      if (params.has('page')) requestedPages.push(page);
      return ok({
        items: remaining.slice((page - 1) * 20, page * 20),
        pageInfo: { page, total: count, totalPages: Math.ceil(count / 20), hasNext: page * 20 < count, nextCursor: null },
      });
    }));

    // When: 실제 목록 consumer가 저장 URL의 응답을 받는다.
    renderRoute();

    // Then: 유효한 주소를 다시 조회하며, 결과가 있는데 빈 목록으로 남지 않는다.
    await waitFor(() => expect(navigation.path).toBe(lastPage === 1 ? leagueList : `${leagueList}&page=${lastPage}`));
    if (count > 0) {
      await waitFor(() => expect(within(screen.getByRole('list', { name: '대회 목록' })).getAllByRole('listitem')).toHaveLength(count === 22 ? 2 : 1));
      expect(screen.queryByText('조건에 맞는 대회가 없어요')).not.toBeInTheDocument();
    } else {
      await screen.findByText('조건에 맞는 대회가 없어요');
    }
    expect(requestedPages).toEqual([9, lastPage]);
  });

  it('느린 페이지 이동 중 보이는 이전 카드의 상세 뒤로가기는 실제 표시 중인 페이지를 복원한다', async () => {
    // Given: 두 번째 페이지 카드가 남아 있는 상태로 첫 페이지 응답을 기다린다.
    navigation.path = secondPage;
    const user = userEvent.setup();
    renderRoute();
    await expectSecondPage();
    let releaseFirstPage = () => {};
    const firstPageReady = new Promise<void>((resolve) => { releaseFirstPage = resolve; });
    let waiting = false;
    server.use(http.get('*/api/v1/tournaments', async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') ?? 1);
      if (params.has('page') && page === 1) {
        waiting = true;
        await firstPageReady;
      }
      return ok({
        items: leagues.slice((page - 1) * 20, page * 20),
        pageInfo: { page, total: 22, totalPages: 2, hasNext: page < 2, nextCursor: null },
      });
    }));
    try {
      await user.click(screen.getByRole('button', { name: '1페이지' }));
      await waitFor(() => expect(waiting).toBe(true));
      const oldCard = screen.getByRole('link', { name: /정규 리그 21/ });
      expect(new URL(oldCard.getAttribute('href')!, 'https://teameet.test').searchParams.get('from')).toBe(secondPage);

      // When: 로딩 동안 실제로 남아 있는 카드를 열고 상세의 뒤로가기를 누른다.
      await user.click(oldCard);
      await screen.findByRole('heading', { level: 1, name: '정규 리그 21' });
      await user.click(screen.getByRole('link', { name: '뒤로가기' }));

      // Then: 요청한 첫 페이지가 아니라 선택했던 카드의 두 번째 페이지로 돌아온다.
      expect(navigation.path).toBe(secondPage);
      await expectSecondPage();
    } finally {
      releaseFirstPage();
    }
  });

  it('범위를 보정한 페이지의 응답을 기다릴 때 이전의 빈 응답을 실제 빈 결과처럼 표시하지 않는다', async () => {
    // Given: page=9에는 결과가 없지만 실제 한 페이지에는 대회가 있다.
    navigation.path = `${leagueList}&page=9`;
    let release = () => {};
    const responseReady = new Promise<void>((resolve) => { release = resolve; });
    let waiting = false;
    server.use(http.get('*/api/v1/tournaments', async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') ?? 1);
      if (params.has('page') && page === 1) {
        waiting = true;
        await responseReady;
      }
      return ok({
        items: page === 1 ? leagues.slice(0, 1) : [],
        pageInfo: { page, total: 1, totalPages: 1, hasNext: false, nextCursor: null },
      });
    }));
    try {
      // When: 잘못된 범위를 보정하고 실제 첫 페이지 응답을 기다린다.
      renderRoute();
      await waitFor(() => expect(waiting).toBe(true));

      // Then: 실제 조회 완료 전에는 빈 결과 대신 기존 로딩 표면을 유지한다.
      expect(navigation.path).toBe(leagueList);
      expect(screen.queryByText('조건에 맞는 대회가 없어요')).not.toBeInTheDocument();
      expect(screen.getByLabelText('대회 목록 불러오는 중')).toBeInTheDocument();
      release();
      await screen.findByRole('link', { name: /정규 리그 1/ });
    } finally {
      release();
    }
  });

  it('이전 페이지의 placeholder totalPages로 아직 응답하지 않은 새 페이지를 보정하지 않는다', async () => {
    // Given: 기존 두 페이지의 결과를 표시한 채 확장된 목록의 9페이지로 이동한다.
    navigation.path = secondPage;
    renderRoute();
    await expectSecondPage();
    let release = () => {};
    const responseReady = new Promise<void>((resolve) => { release = resolve; });
    let waiting = false;
    server.use(http.get('*/api/v1/tournaments', async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
      if (page === 9) {
        waiting = true;
        await responseReady;
      }
      return ok({
        items: [{ ...tournament, id: 'expanded-page-9', title: '확장된 목록의 9페이지 리그', kind: 'regular_league' }],
        pageInfo: { page, total: 161, totalPages: 9, hasNext: false, nextCursor: null },
      });
    }));
    try {
      // When: URL 전환의 실제 HTTP 응답은 아직 오지 않았고 직전 카드가 남아 있다.
      act(() => navigation.navigate(`${leagueList}&page=9`));
      await waitFor(() => expect(waiting).toBe(true));
      expect(screen.getByRole('link', { name: /정규 리그 21/ })).toBeInTheDocument();
      expect(navigation.path).toBe(`${leagueList}&page=9`);
      release();

      // Then: 새 응답의 유효한 9페이지를 유지한다.
      await screen.findByRole('link', { name: /확장된 목록의 9페이지 리그/ });
      expect(navigation.path).toBe(`${leagueList}&page=9`);
    } finally {
      release();
    }
  });

  it('2페이지의 필터를 여닫을 때는 페이지를 유지하고 상태를 바꾸면 첫 페이지로 돌아간다', async () => {
    // Given: 두 번째 페이지에서 연 필터 시트.
    navigation.path = secondPage;
    const user = userEvent.setup();
    renderRoute();
    await expectSecondPage();
    await user.click(screen.getByRole('link', { name: '필터 열기 — 현재 전체' }));
    await expectSecondPage();
    await user.click(screen.getByRole('link', { name: '닫기' }));
    await expectSecondPage();
    await user.click(screen.getByRole('link', { name: '필터 열기 — 현재 전체' }));

    // When: 상태 필터를 바꾼다.
    await user.click(screen.getByRole('link', { name: '진행 중' }));

    // Then: URL의 페이지도 지우고 바뀐 필터의 1–20 결과를 조회한다.
    const params = new URL(navigation.path, 'https://teameet.example').searchParams;
    expect(params.get('status')).toBe('in_progress');
    expect(params.has('page')).toBe(false);
    await screen.findByText(/전체 22건 중 1–20/);
  });
});
