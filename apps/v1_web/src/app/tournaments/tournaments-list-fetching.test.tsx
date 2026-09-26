import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import TournamentsPage from './page';

// motion-audit 그룹3(F1 subtab) — CompetitionKindSegment 는 kind='tab' 으로 정확히 분류돼
// route-progress.tsx 가 진행바를 켜지 않는다. useV1Tournaments 는 placeholderData:
// keepPreviousData 라 재요청 동안 isLoading 이 계속 false 로 유지되므로(카드 유지·스크롤
// 보존 목적) TournamentSkeletonList 도 안 뜬다. 그 사이 유일한 로딩 신호가 이 그리드의
// aria-busy/opacity 다 — isFetching 이 꺼지면 신호도 사라져야 한다.
function buildItem(overrides: Partial<V1TournamentListItem> = {}): V1TournamentListItem {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '2026 서울 풋살 오픈',
    status: 'open',
    format: 'knockout',
    registrationDeadlineAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 16,
    genderCategory: 'mixed',
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
    confirmedCount: 0,
    pendingPaymentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as V1TournamentListItem;
}

let isFetching = false;

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/tournaments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AllTournaments: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useV1Tournaments: () => ({
    data: {
      items: [buildItem()],
      pageInfo: { hasNext: false, totalPages: 1, total: 1, page: 1, nextCursor: null },
    },
    // keepPreviousData 설계: 재요청 중에도 isLoading 은 false 로 유지된다 — 그래서
    // TournamentSkeletonList 가 아니라 isFetching 하나로만 로딩을 신호해야 한다.
    isLoading: false,
    isError: false,
    error: null,
    isFetching,
    refetch: vi.fn(),
  }),
  useV1MasterSports: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false, DESKTOP_LIST_MEDIA_QUERY: '' }));
vi.mock('@/hooks/use-infinite-scroll', () => ({ useInfiniteScroll: () => ({ current: null }) }));

describe('/tournaments 목록 그리드 — 세부 탭 재요청 중 aria-busy', () => {
  it('isFetching=false 면 그리드에 aria-busy 가 없다', () => {
    isFetching = false;
    const { container } = render(<TournamentsPage />);

    const grid = container.querySelector('.tm-tournament-list-grid');
    expect(grid).not.toBeNull();
    expect(grid).not.toHaveAttribute('aria-busy');
  });

  it('isFetching=true 면 그리드에 aria-busy="true" 가 붙는다(재요청 중 유일한 로딩 신호)', () => {
    isFetching = true;
    const { container } = render(<TournamentsPage />);

    const grid = container.querySelector('.tm-tournament-list-grid');
    expect(grid).toHaveAttribute('aria-busy', 'true');
  });
});
