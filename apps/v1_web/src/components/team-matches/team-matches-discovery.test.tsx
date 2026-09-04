import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TeamMatchDetailPageView } from './team-matches-page';
import { getTeamMatchDetailViewModel } from './team-matches.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/team-match-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const model = getTeamMatchDetailViewModel('default');
  model.match.hostTeamTrustState = 'sample';
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamMatchDetailPageView model={model} />
    </QueryClientProvider>,
  );
}

describe('TeamMatchDetailPageView discovery presentation', () => {
  it('sample 신뢰 상태를 숨기고 이미지 액션에는 공유만 노출한다', () => {
    renderDetail();

    expect(screen.queryByText('sample')).not.toBeInTheDocument();
    expect(screen.queryByText('샘플')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '공유' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '홈으로' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '알림' })).not.toBeInTheDocument();
  });
});
