import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminTeamDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'team-1' }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTeam: () => ({
    data: {
      teamId: 'team-1',
      name: '성수 풋살 크루',
      status: 'active',
      sportName: '풋살',
      regionName: '서울 성동구',
      ownerName: '김도윤',
      ownerUserId: 'user-owner',
      memberCount: 7,
      managerCount: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      trustScore: null,
      recentHostedTeamMatches: [],
      members: [],
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('AdminTeamDetailPage — 상태와 인원은 한 번씩만', () => {
  it('상태는 원문("active") 없이 한글 배지로 한 번만 보인다', () => {
    render(<AdminTeamDetailPage />);

    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.getAllByText('활성')).toHaveLength(1);
  });

  it('멤버·매니저 수는 운영 요약에만 있고 상세 표에는 되풀이하지 않는다', () => {
    render(<AdminTeamDetailPage />);

    expect(screen.getAllByText('7')).toHaveLength(1);
    expect(screen.getAllByText('3')).toHaveLength(1);
    expect(screen.queryByText('멤버 수')).not.toBeInTheDocument();
    expect(screen.queryByText('매니저 수')).not.toBeInTheDocument();
  });
});
