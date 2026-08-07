import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRecordsPageClient } from './user-records-page-client';
import type { PublicUserRecordsResponse } from '@/components/public-game-records/types';

// AppChrome 이 알림 벨을 렌더하며 react-query 를 쓴다 — 다른 화면 테스트와 같은 래퍼를 쓴다.
function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/**
 * 공유 링크로 들어온 방문자에게 헤더가 "활동 기록" 만 보여주면 **누구의 기록인지 알 수 없다**.
 * page.tsx 의 metadata 는 이미 닉네임을 붙이고 있었고 응답에도 필드가 있었는데 화면 헤더만
 * 제네릭이었다. 아래 테스트는 그 신원 표기가 사라지면 깨진다.
 *
 * 공개 신원으로 쓸 수 있는 값은 닉네임뿐이다(D-03/D-11). 닉네임이 없을 때 다른 식별자로
 * 대체하면 프라이버시 계약이 깨지므로, 그 경우엔 제네릭 문구로 남아야 한다.
 */

// AppChrome 하위가 navigation 훅을 쓴다 — 다른 화면 테스트와 같은 스텁을 둔다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/users/user-1/records',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mocks = vi.hoisted(() => ({ usePublicUserRecords: vi.fn() }));

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicUserRecords: (...args: unknown[]) => mocks.usePublicUserRecords(...args),
}));

vi.mock('@/components/public-game-records/user-records-content', () => ({
  UserRecordsContent: () => <div data-testid="records-content" />,
}));

function page(nickname: string | null): PublicUserRecordsResponse {
  return {
    userId: 'user-1',
    nickname,
    summary: { appearances: 0, goals: 0, mvpCount: 0 },
    items: [],
    nextCursor: null,
  } as unknown as PublicUserRecordsResponse;
}

function loaded(nickname: string | null) {
  return {
    data: { pages: [page(nickname)] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
}

describe('UserRecordsPageClient', () => {
  beforeEach(() => {
    mocks.usePublicUserRecords.mockReset();
  });

  it('names whose records these are so a deep-linked visitor can tell', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded('멤버현'));

    render(<UserRecordsPageClient userId="user-1" />);

    expect(screen.getAllByText('멤버현 님의 활동 기록').length).toBeGreaterThan(0);
  });

  // 닉네임이 없으면 다른 식별자(userId 등)로 채우지 않는다 — 공개 신원은 닉네임뿐이다.
  it('falls back to the generic heading instead of substituting another identifier', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded(null));

    render(<UserRecordsPageClient userId="user-1" />);

    expect(screen.getAllByText('활동 기록').length).toBeGreaterThan(0);
    expect(screen.queryByText(/user-1/)).toBeNull();
  });

  // 데스크톱(>=1024px)에서는 .tm-topbar 가 숨겨지므로 desktopHead 가 빠지면 제목·뒤로가기가
  // 통째로 사라진다. 실제로 그 회귀가 있었다.
  it('renders the desktop page head so the title survives above 1024px', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded('멤버현'));

    const { container } = render(<UserRecordsPageClient userId="user-1" />);

    expect(container.querySelector('.tm-desktop-page-head')).not.toBeNull();
  });
});
