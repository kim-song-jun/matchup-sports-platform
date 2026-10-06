import { useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session } from '@/lib/session-storage';
import type { V1TournamentDetail } from '@/types/api';
import { TournamentDetailPageClient } from './[id]/tournament-detail-client';
import { TournamentsListPageClient } from './tournaments-list-client';

// jsdom에는 Next 라우터가 없으므로 이동 경계만 대체한다. 목록·카드·상세·뒤로가기와 API 훅은 실제 구현이다.
const navigation = vi.hoisted(() => ({ path: '/tournaments', navigate: (_path: string) => {} }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.path.split('?')[0],
  useSearchParams: () => new URLSearchParams(navigation.path.split('?')[1]),
  useRouter: () => ({ push: navigation.navigate, replace: navigation.navigate, prefetch: vi.fn() }),
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

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  clearStoredV1Session();
  navigation.path = FILTERED_LIST;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  server.close();
  vi.unstubAllEnvs();
});

function PublicRoute() {
  const [path, setPath] = useState(navigation.path);
  navigation.navigate = (next) => {
    navigation.path = next;
    setPath(next);
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
