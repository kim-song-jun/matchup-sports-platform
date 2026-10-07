import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShellOverrideForRoute } from '@/components/v1-ui/shell-override';
import { TournamentReviewsPageClient } from './reviews-page-client';

const navState = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1/reviews',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navState.search),
}));

const idle = { isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1Tournament: () => ({ ...idle, data: undefined }),
  useV1Reviews: () => ({ ...idle, data: undefined }),
  useV1TournamentReviews: () => ({ ...idle, data: { items: [], total: 0, page: 1, pageSize: 10 } }),
}));

function ShellBackProbe() {
  const { backHref } = useShellOverrideForRoute('/tournaments/t1/reviews');
  return <output data-testid="shell-back">{backHref ?? ''}</output>;
}

function renderReviews() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TournamentReviewsPageClient tournamentId="t1" />
      <ShellBackProbe />
    </QueryClientProvider>,
  );
}

describe('TournamentReviewsPageClient — 상단 뒤로가기 출처(MD-QA #34)', () => {
  beforeEach(() => {
    navState.search = '';
  });

  it('유효한 from 이 있으면 셸 뒤로가기가 그 주소로 바뀐다', () => {
    navState.search = 'from=%2Ftournaments%2Ft1';
    renderReviews();
    expect(screen.getByTestId('shell-back')).toHaveTextContent('/tournaments/t1');
  });

  it('시상 화면(자기 from 포함)에서 온 경우 그 시상 화면으로 돌아간다', () => {
    navState.search = `from=${encodeURIComponent('/tournaments/t1/awards?from=%2Ftournaments%2Ft1')}`;
    renderReviews();
    expect(screen.getByTestId('shell-back')).toHaveTextContent('/tournaments/t1/awards?from=%2Ftournaments%2Ft1');
  });

  it('from 이 없으면 덮어쓰지 않는다', () => {
    renderReviews();
    expect(screen.getByTestId('shell-back')).toBeEmptyDOMElement();
  });

  it.each(['https://evil.example', '//evil.example'])('외부 주소 from(%s)은 무시한다', (evil) => {
    navState.search = `from=${encodeURIComponent(evil)}`;
    renderReviews();
    expect(screen.getByTestId('shell-back')).toBeEmptyDOMElement();
  });
});
