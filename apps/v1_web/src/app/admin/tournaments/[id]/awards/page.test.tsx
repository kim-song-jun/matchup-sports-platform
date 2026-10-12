import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminTournamentAwardsPage from './page';

const mocks = vi.hoisted(() => ({
  tournamentQuery: { data: undefined as unknown, isPending: true, isError: false, error: null as unknown, refetch: vi.fn() },
  admin: { tournamentId: 't-1', canWrite: true, showToast: vi.fn() },
}));

vi.mock('../tournament-admin-context', () => ({ useTournamentAdmin: () => mocks.admin }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTournament: () => mocks.tournamentQuery }));
vi.mock('../awards-tab', () => ({
  AwardsTab: (props: { allowSplitAwards?: boolean }) => <div data-testid="awards-editor" data-split={String(props.allowSplitAwards)} />,
}));

describe('AdminTournamentAwardsPage tournament-kind gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tournamentQuery.data = undefined;
    mocks.tournamentQuery.isPending = true;
    mocks.tournamentQuery.isError = false;
    mocks.tournamentQuery.error = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps every awards editor action unavailable until the actual tournament kind is hydrated', () => {
    const { rerender } = render(<AdminTournamentAwardsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('awards-editor')).not.toBeInTheDocument();

    mocks.tournamentQuery.data = { kind: 'regular_tournament' };
    mocks.tournamentQuery.isPending = false;
    rerender(<AdminTournamentAwardsPage />);
    expect(screen.getByTestId('awards-editor')).toHaveAttribute('data-split', 'true');
  });

  it('shows a retryable detail error instead of opening a possibly wrong-scope editor', () => {
    mocks.tournamentQuery.isPending = false;
    mocks.tournamentQuery.isError = true;
    mocks.tournamentQuery.error = new Error('detail unavailable');
    render(<AdminTournamentAwardsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('detail unavailable');
    expect(screen.queryByTestId('awards-editor')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mocks.tournamentQuery.refetch).toHaveBeenCalledTimes(1);
  });
});
