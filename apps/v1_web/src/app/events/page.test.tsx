import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import EventsPage from './page';

const refetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MasterSports: () => ({ data: [] }),
}));

vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/use-v1-tournament-campaign', () => ({
  useV1TournamentCampaignsInfinite: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error('network unavailable'),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    refetch,
  }),
}));

describe('EventsPage', () => {
  it('offers an in-page retry after the initial campaign request fails', () => {
    render(<EventsPage />);

    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('network unavailable')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(refetch).toHaveBeenCalledOnce();
  });
});
