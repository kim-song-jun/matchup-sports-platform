import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AdminMe,
  useV1CreateAdminTeamMatchRecruitment,
  useV1MasterRegions,
  useV1MasterSports,
} from '@/hooks/use-v1-api';
import AdminTeamMatchNewPage from './page';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/uuid', () => ({ randomUuid: () => '00000000-0000-4000-8000-000000000001' }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: vi.fn(),
  useV1CreateAdminTeamMatchRecruitment: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1MasterSports: vi.fn(),
}));

const useAdminMe = vi.mocked(useV1AdminMe, { partial: true });
const useCreate = vi.mocked(useV1CreateAdminTeamMatchRecruitment, { partial: true });
const useRegions = vi.mocked(useV1MasterRegions, { partial: true });
const useSports = vi.mocked(useV1MasterSports, { partial: true });

describe('AdminTeamMatchNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminMe.mockReturnValue({ data: { capabilities: ['status:write'] } } as never);
    useSports.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useRegions.mockReturnValue({
      data: [
        { id: 'region-seoul', name: '서울', parentId: null, level: 1 },
        { id: 'region-gangnam', name: '강남구', parentId: 'region-seoul', level: 2 },
      ],
    } as never);
  });

  it('opens recruitment without selecting teams', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      teamMatchId: 'tm-1',
      status: 'recruiting',
      detailRoute: '/admin/team-matches/tm-1',
      replayed: false,
    });
    useCreate.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    fireEvent.change(screen.getByLabelText('종목'), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-gangnam' } });
    fireEvent.change(screen.getByLabelText('매치 제목'), { target: { value: '  관리자 모집전  ' } });
    fireEvent.change(screen.getByLabelText('경기 장소'), { target: { value: '  잠실 풋살장  ' } });
    fireEvent.change(screen.getByLabelText('신청 마감'), { target: { value: '2026-10-18T19:00' } });
    fireEvent.change(screen.getByLabelText('경기 시작'), { target: { value: '2026-10-20T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 신청 모집 시작하기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      sportId: 'sport-futsal',
      regionId: 'region-gangnam',
      title: '관리자 모집전',
      manualPlaceName: '잠실 풋살장',
      deadlineAt: new Date('2026-10-18T19:00').toISOString(),
      startsAt: new Date('2026-10-20T19:00').toISOString(),
    })));
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('homeTeamId');
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('awayTeamId');
    expect(push).toHaveBeenCalledWith('/admin/team-matches/tm-1');
  });

  it('shows a read-only permission message to support admins', () => {
    useAdminMe.mockReturnValue({ data: { capabilities: ['overview:read'] } } as never);
    useCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('지원 관리자에게는 팀매치 모집 생성 권한이 없어요.');
    expect(screen.queryByRole('button', { name: '팀 신청 모집 시작하기' })).not.toBeInTheDocument();
  });
});
