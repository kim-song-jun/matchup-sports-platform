import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TournamentsPage from './page';

// useSearchParams 가 **suspend 된 상태**를 만든다 — 서버 렌더에서 실제로 일어나는 일이다.
// 그때 Suspense 폴백이 곧 첫 HTML 이다. fallback={null} 이던 동안 그 HTML 이 통째로 비어
// 느린 기기는 하이드레이션까지 7초 넘게 빈 화면을 봤고, 하단 탭 전환은 빈 화면으로
// 슬라이드했다(alpha 실측).
const NEVER = new Promise<never>(() => {});
vi.mock('next/navigation', () => ({
  useSearchParams: () => { throw NEVER; },
  usePathname: () => '/tournaments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AllTournaments: () => ({ data: [], isLoading: true, isError: false, refetch: vi.fn() }),
  useV1Tournaments: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
  useV1MasterSports: () => ({ data: undefined }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false, DESKTOP_LIST_MEDIA_QUERY: '' }));
vi.mock('@/hooks/use-infinite-scroll', () => ({ useInfiniteScroll: () => ({ sentinelRef: { current: null } }) }));

describe('/tournaments — 서버 렌더(Suspense 폴백)에 본문이 있어야 한다', () => {
  it('useSearchParams 가 suspend 돼도 스켈레톤 뼈대가 렌더된다(null 이 아니다)', () => {
    const { container } = render(<TournamentsPage />);

    // 로드된 화면과 같은 뼈대: 목록 섹션 · 대회 구분 세그먼트 · 스켈레톤 카드
    expect(container.querySelector('.tm-tournament-list')).not.toBeNull();
    expect(container.querySelector('.tm-tournament-list-section')).not.toBeNull();
    expect(container.querySelector('.tm-segmented-tabs')).not.toBeNull();
    expect(container.querySelectorAll('[aria-label="대회 목록 불러오는 중"] .tm-card').length).toBeGreaterThanOrEqual(3);
    // 정적 진입 카드도 그대로 — 폴백과 실제가 다르면 하이드레이션 때 밀린다
    expect(container.querySelector('.tm-tournament-event-hub-entry')).not.toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
