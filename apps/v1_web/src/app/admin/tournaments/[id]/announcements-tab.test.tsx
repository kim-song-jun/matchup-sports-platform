import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsTab } from './announcements-tab';
import type { V1AdminTournamentAnnouncement } from '@/types/api';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const publishMutate = vi.fn();
const deleteMutate = vi.fn();

const announcement: V1AdminTournamentAnnouncement = {
  id: 'ann-1',
  tournamentId: 'tournament-1',
  title: '주차장 안내',
  body: '경기장 뒤편 공영주차장을 이용해 주세요.',
  category: 'venue',
  audience: 'all_registered',
  publishedAt: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminAnnouncements: () => ({
    data: { items: [announcement] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1CreateAnnouncement: () => ({ mutate: createMutate, isPending: false }),
  useV1UpdateAnnouncement: () => ({ mutate: updateMutate, isPending: false }),
  useV1PublishAnnouncement: () => ({ mutate: publishMutate, isPending: false }),
  useV1DeleteAnnouncement: () => ({ mutate: deleteMutate, isPending: false }),
}));

describe('AnnouncementsTab category round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the announcement category into the edit form and includes it in the update payload', async () => {
    const user = userEvent.setup();
    render(<AnnouncementsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: `"${announcement.title}" 수정` }));

    // 편집 진입 시 기존 분류가 폼에 로드되어야 한다 (과거: general로 리셋되던 버그)
    expect(screen.getByLabelText('분류')).toHaveValue('venue');

    await user.selectOptions(screen.getByLabelText('분류'), 'media');
    await user.click(screen.getByRole('button', { name: /공지 수정/ }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [args] = updateMutate.mock.calls[0];
    expect(args.announcementId).toBe('ann-1');
    // 과거: update payload에 category 필드 자체가 빠져 서버에 반영되지 않던 버그
    expect(args.body).toMatchObject({ category: 'media' });
  });

  it('hides the compose form and every mutation button for read-only admins', () => {
    render(<AnnouncementsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);

    expect(screen.getByText(announcement.title)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: `"${announcement.title}" 수정` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `"${announcement.title}" 삭제` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `"${announcement.title}" 발행` })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('제목')).not.toBeInTheDocument();
  });
});
