import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Team } from '@/types/api';

const hookMocks = vi.hoisted(() => ({
  useV1TeamPages: vi.fn(),
  useV1MasterSports: vi.fn(() => ({ data: [] })),
  useV1RecentSearches: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useV1RecordSearch: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hookMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

import { TeamListPageClient } from './teams-client';

function team(index: number): V1Team {
  return {
    id: `team-${index}`,
    teamId: `team-${index}`,
    name: `테스트 팀 ${index}`,
    sportName: '풋살',
    regionName: '서울',
    memberCount: 5,
    joinPolicy: 'approval_required',
  } as unknown as V1Team;
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('TeamListPageClient pagination', () => {
  beforeEach(() => vi.clearAllMocks());

  it('서버 전체 건수와 현재 표시 건수를 구분하고 다음 커서 페이지를 요청한다', () => {
    const fetchNextPage = vi.fn();
    hookMocks.useV1TeamPages.mockReturnValue({
      data: {
        pages: [{
          items: [team(1), team(2)],
          pageInfo: { nextCursor: 'team-2', hasNext: true, total: 52 },
        }],
      },
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    });

    render(<TeamListPageClient />, { wrapper });

    expect(screen.getAllByText('52')).toHaveLength(2);
    expect(screen.getAllByText('2')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '팀 더 보기' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
