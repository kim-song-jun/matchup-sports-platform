import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRecordsPageClient } from './user-records-page-client';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import type { PublicUserRecordsResponse } from '@/components/public-game-records/types';

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
 *
 * 셸 승격(U26) 이후 제목은 이 컴포넌트가 직접 렌더하지 않고 `useShellOverride`로 셸에
 * 밀어넣는다(app-shell-promotion.md §1.9 "fetch된 제목" 패턴) — 그래서 검증도 DOM 텍스트가
 * 아니라 그 훅 호출 인자를 본다.
 */

const shellOverride = vi.hoisted(() => ({ useShellOverride: vi.fn() }));

vi.mock('@/components/v1-ui/shell-override', () => ({
  useShellOverride: shellOverride.useShellOverride,
}));

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
  // AppBackLink 가 클릭 때 router.back/replace 를 쓴다 — 렌더만 하는 테스트라 빈 라우터면 된다.
  useRouter: () => ({ back: vi.fn(), forward: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({ usePublicUserRecords: vi.fn() }));

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicUserRecords: (...args: unknown[]) => mocks.usePublicUserRecords(...args),
}));

vi.mock('@/components/public-game-records/user-records-content', () => ({
  UserRecordsContent: ({ selfHref }: { selfHref?: string }) => <div data-testid="records-content" data-self-href={selfHref} />,
}));

function page(nickname: string | null): PublicUserRecordsResponse {
  return {
    userId: 'user-1',
    nickname,
    summary: { appearances: 0, goals: 0, mvpCount: 0, matchMvpCount: 0, tournamentAwardCount: 0 },
    tournamentAwards: [],
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

function lastOverrideTitle() {
  const calls = shellOverride.useShellOverride.mock.calls;
  return calls[calls.length - 1]?.[0]?.title as string | undefined;
}

function lastOverrideBackHref() {
  const calls = shellOverride.useShellOverride.mock.calls;
  return calls[calls.length - 1]?.[0]?.backHref as string | undefined;
}

describe('UserRecordsPageClient', () => {
  beforeEach(() => {
    mocks.usePublicUserRecords.mockReset();
    shellOverride.useShellOverride.mockReset();
    navigation.searchParams = new URLSearchParams();
  });

  it('names whose records these are so a deep-linked visitor can tell', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded('멤버현'));

    render(<UserRecordsPageClient userId="user-1" />);

    expect(lastOverrideTitle()).toBe('멤버현 님의 활동 기록');
  });

  // 닉네임이 없으면 다른 식별자(userId 등)로 채우지 않는다 — 공개 신원은 닉네임뿐이다.
  it('falls back to the generic heading instead of substituting another identifier', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded(null));

    render(<UserRecordsPageClient userId="user-1" />);

    expect(lastOverrideTitle()).toBe('활동 기록');
    expect(screen.queryByText(/user-1/)).toBeNull();
  });

  // MD-QA #15: 마이페이지 등 프로필을 거치지 않고 바로 들어온 진입점에서도 뒤로가기가
  // 그 화면으로 돌아와야 한다. D1: 이 화면은 더 이상 useShellOverride로 backHref를
  // 게시하지 않는다 — AppBackLink가 ?from=을 직접 읽으므로 그 컴포넌트로 실제 href를 본다.
  it('honors ?from= so back-navigation returns to the actual entry point', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded('멤버현'));
    navigation.searchParams = new URLSearchParams('from=%2Fmy');

    render(
      <>
        <AppBackLink fallbackHref="/users/user-1">뒤로가기</AppBackLink>
        <UserRecordsPageClient userId="user-1" />
      </>,
    );

    expect(lastOverrideBackHref()).toBeUndefined();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/my');
    // 경기 상세로 넘길 출처에도 받은 출처를 담아, 거기서 두 번 돌아와도 마이페이지에 닿는다.
    expect(screen.getByTestId('records-content')).toHaveAttribute('data-self-href', '/users/user-1/records?from=%2Fmy');
  });

  it('ignores an unsafe ?from= value and falls back to the default back target', () => {
    mocks.usePublicUserRecords.mockReturnValue(loaded('멤버현'));
    navigation.searchParams = new URLSearchParams('from=https%3A%2F%2Fevil.example');

    render(
      <>
        <AppBackLink fallbackHref="/users/user-1">뒤로가기</AppBackLink>
        <UserRecordsPageClient userId="user-1" />
      </>,
    );

    expect(lastOverrideBackHref()).toBeUndefined();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/users/user-1');
  });
});
