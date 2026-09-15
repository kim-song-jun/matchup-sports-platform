import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRecordsPageClient } from './user-records-page-client';
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

describe('UserRecordsPageClient', () => {
  beforeEach(() => {
    mocks.usePublicUserRecords.mockReset();
    shellOverride.useShellOverride.mockReset();
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
});
