import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentSponsorsTab } from './tournament-sponsors-tab';
import type { V1AdminTournamentSponsor } from '@/types/api';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deactivateMutate = vi.fn();

const sponsor: V1AdminTournamentSponsor = {
  id: 'sponsor-1',
  tournamentId: 'tournament-1',
  name: '서울 스포츠랩',
  description: '풋살 장비 파트너',
  logoUrl: null,
  websiteUrl: null,
  instagramUrl: null,
  benefitText: '전 참가팀 10% 할인',
  boothText: null,
  eventTitle: null,
  eventDescription: null,
  eventResultText: null,
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentSponsors: () => ({
    data: { items: [sponsor] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1CreateTournamentSponsor: () => ({ mutate: createMutate, isPending: false }),
  useV1UpdateTournamentSponsor: () => ({ mutate: updateMutate, isPending: false }),
  useV1DeactivateTournamentSponsor: () => ({ mutate: deactivateMutate, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('TournamentSponsorsTab permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows sponsor data without mutation affordances when the admin has read-only access', () => {
    render(
      <TournamentSponsorsTab
        tournamentId="tournament-1"
        canWrite={false}
        showToast={vi.fn()}
      />,
    );

    // 협찬사명은 목록 행과 미리보기 양쪽에 렌더되므로 getAllByText로 확인한다
    expect(screen.getAllByText(sponsor.name).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '협찬 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '비공개' })).not.toBeInTheDocument();
  });

  it('keeps create, edit, and deactivate affordances for mutation-capable admins', async () => {
    const user = userEvent.setup();
    render(
      <TournamentSponsorsTab
        tournamentId="tournament-1"
        canWrite
        showToast={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText('예: 서울 스포츠랩'), '새 협찬사');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '협찬 추가' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '수정' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '비공개' })).toBeEnabled();
  });
});
