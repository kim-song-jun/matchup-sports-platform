import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AdminMe,
  useV1AdminTeams,
  useV1CreateAdminAssignedTeamMatch,
  useV1MasterRegions,
} from '@/hooks/use-v1-api';
import AdminTeamMatchNewPage from './page';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/uuid', () => ({
  randomUuid: () => '00000000-0000-4000-8000-000000000001',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: vi.fn(),
  useV1AdminTeams: vi.fn(),
  useV1CreateAdminAssignedTeamMatch: vi.fn(),
  useV1MasterRegions: vi.fn(),
}));

const useV1AdminMeMock = vi.mocked(useV1AdminMe, { partial: true });
const useV1AdminTeamsMock = vi.mocked(useV1AdminTeams, { partial: true });
const useV1CreateAdminAssignedTeamMatchMock = vi.mocked(useV1CreateAdminAssignedTeamMatch, { partial: true });
const useV1MasterRegionsMock = vi.mocked(useV1MasterRegions, { partial: true });

describe('AdminTeamMatchNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1AdminMeMock.mockReturnValue({ data: { capabilities: ['status:write'] } } as never);
    useV1AdminTeamsMock.mockReturnValue({
      data: {
        items: [
          { teamId: 'team-a', name: '팀A', sportId: 'sport-futsal', sportName: '풋살', status: 'active' },
          { teamId: 'team-b', name: '팀B', sportId: 'sport-futsal', sportName: '풋살', status: 'active' },
        ],
      },
      isFetching: false,
    } as never);
    useV1MasterRegionsMock.mockReturnValue({
      data: [
        { id: 'region-seoul', name: '서울', parentId: null, level: 1 },
        { id: 'region-gangnam', name: '강남구', parentId: 'region-seoul', level: 2 },
      ],
    } as never);
  });

  it('selects two same-sport teams and creates a directly matched team match', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ teamMatchId: 'tm-1', status: 'matched' });
    useV1CreateAdminAssignedTeamMatchMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    const homePicker = screen.getByLabelText('홈팀');
    fireEvent.focus(homePicker);
    fireEvent.change(homePicker, { target: { value: '팀A' } });
    fireEvent.click(await screen.findByText('팀A'));

    const awayPicker = screen.getByLabelText('상대팀');
    fireEvent.focus(awayPicker);
    fireEvent.change(awayPicker, { target: { value: '팀B' } });
    fireEvent.click(await screen.findByText('팀B'));

    fireEvent.change(screen.getByLabelText('매치 제목'), { target: { value: '  관리자 친선전  ' } });
    fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-gangnam' } });
    fireEvent.change(screen.getByLabelText('경기 장소'), { target: { value: '  잠실 풋살장  ' } });
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '2026-10-20T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '두 팀 매치 확정하기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      clientCommandId: '00000000-0000-4000-8000-000000000001',
      homeTeamId: 'team-a',
      awayTeamId: 'team-b',
      regionId: 'region-gangnam',
      title: '관리자 친선전',
      manualPlaceName: '잠실 풋살장',
      startsAt: new Date('2026-10-20T19:00').toISOString(),
    })));
    expect(push).toHaveBeenCalledWith('/admin/team-matches?status=matched');
  });

  it('shows a read-only permission message to support admins', () => {
    useV1AdminMeMock.mockReturnValue({ data: { capabilities: ['overview:read'] } } as never);
    useV1CreateAdminAssignedTeamMatchMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('지원 관리자에게는 팀매치 생성 권한이 없어요.');
    expect(screen.queryByRole('button', { name: '두 팀 매치 확정하기' })).not.toBeInTheDocument();
  });
});
