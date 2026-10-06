import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueVisibilityControl } from './league-visibility-control';

const mocks = vi.hoisted(() => ({
  canWrite: true,
  mutate: vi.fn(),
  mutation: {
    isError: false,
    isPending: false,
    isSuccess: false,
    error: null as Error | null,
  },
}));

vi.mock('@/hooks/use-admin-can-write', () => ({
  useAdminCanWrite: () => mocks.canWrite,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateLeagueVisibility: () => ({ ...mocks.mutation, mutate: mocks.mutate }),
}));

describe('LeagueVisibilityControl', () => {
  beforeEach(() => {
    mocks.canWrite = true;
    mocks.mutate.mockReset();
    mocks.mutation = { isError: false, isPending: false, isSuccess: false, error: null };
  });

  it('sends the exact inverse visibility value when an authorized admin switches state', () => {
    render(<LeagueVisibilityControl leagueId="league-1" isPublic />);

    fireEvent.click(screen.getByRole('button', { name: '비공개로 전환' }));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith({ isPublic: false });
  });

  it('keeps the action read-only for an admin without write capability', () => {
    mocks.canWrite = false;
    render(<LeagueVisibilityControl leagueId="league-1" isPublic={false} />);

    expect(screen.getByText('현재 상태: 비공개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공개로 전환' })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('shows the mutation error instead of implying the setting was saved', () => {
    mocks.mutation = {
      isError: true,
      isPending: false,
      isSuccess: false,
      error: new Error('서버에서 저장을 거부했어요.'),
    };
    render(<LeagueVisibilityControl leagueId="league-1" isPublic />);

    expect(screen.getByRole('alert')).toHaveTextContent('서버에서 저장을 거부했어요.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
