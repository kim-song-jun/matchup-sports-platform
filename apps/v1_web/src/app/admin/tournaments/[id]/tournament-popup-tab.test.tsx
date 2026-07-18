import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentPopupTab } from './tournament-popup-tab';
import type { V1AdminTournamentPopup } from '@/types/api';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const popup: V1AdminTournamentPopup = {
  id: 'popup-1',
  tournamentId: 'tournament-1',
  title: '대회 운영 안내',
  body: '경기 시작 30분 전까지 체크인해 주세요.',
  imageUrl: null,
  status: 'published',
  displayStartAt: null,
  displayEndAt: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentPopups: () => ({
    data: { items: [popup] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1CreateTournamentPopup: () => ({ mutate: createMutate, isPending: false }),
  useV1UpdateTournamentPopup: () => ({ mutate: updateMutate, isPending: false }),
  useV1DeleteTournamentPopup: () => ({ mutate: deleteMutate, isPending: false }),
}));

describe('TournamentPopupTab permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows popup data without mutation affordances when the admin has read-only access', () => {
    render(
      <TournamentPopupTab
        tournamentId="tournament-1"
        canWrite={false}
        showToast={vi.fn()}
      />,
    );

    expect(screen.getByText(popup.title)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '팝업 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('keeps create, edit, and delete affordances for mutation-capable admins', async () => {
    const user = userEvent.setup();
    render(
      <TournamentPopupTab
        tournamentId="tournament-1"
        canWrite
        showToast={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('제목'), '새 팝업');
    await user.type(screen.getByLabelText('내용'), '새 운영 안내입니다.');

    expect(screen.getByRole('button', { name: '팝업 추가' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '수정' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
  });
});
