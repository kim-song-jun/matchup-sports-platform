import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AwardsTab } from './awards-tab';
import type { V1TournamentAward } from '@/types/api';

const setAwardsMutate = vi.fn();

const award: V1TournamentAward = {
  id: 'award-1',
  awardType: 'mvp',
  awardLabel: 'MVP',
  iconKey: 'trophy',
  recipientName: '김선수',
  teamName: 'A팀',
  note: '3골 1어시스트',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentRegistrations: () => ({
    data: { items: [{ id: 'reg-1', status: 'confirmed', teamId: 'team-1', teamName: 'A팀' }] },
  }),
  useV1AdminTournamentPlayers: () => ({
    data: { players: [{ id: 'player-1', realName: '김선수' }] },
    isFetching: false,
  }),
  useV1AdminTournamentAwards: () => ({ data: [award] }),
  useV1SetTournamentAwards: () => ({ mutate: setAwardsMutate, isPending: false }),
}));

describe('AwardsTab permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows award data without mutation affordances when the admin has read-only access', () => {
    render(<AwardsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);

    expect(screen.getByText('MVP')).toBeInTheDocument();
    expect(screen.getByText(/김선수/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '+ 항목 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '항목 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /어워드 저장/ })).not.toBeInTheDocument();
  });

  it('keeps add, remove, and save affordances for mutation-capable admins', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    expect(screen.getByRole('button', { name: '+ 항목 추가' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '항목 삭제' })).toBeEnabled();

    const saveButton = screen.getByRole('button', { name: /어워드 저장/ });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    expect(setAwardsMutate).toHaveBeenCalled();
  });
});
