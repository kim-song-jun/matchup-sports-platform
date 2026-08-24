import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminReportedTeamsPage from './page';
import type { V1AdminReportedTeamRow } from '@/types/api';

const reportedTeamsMock = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminReportedTeams: (limit?: number) => reportedTeamsMock(limit),
}));

function rowA(): V1AdminReportedTeamRow {
  return {
    teamId: 'team-a',
    name: 'A팀',
    status: 'active',
    totalCount: 5,
    recentCount: 3,
    topReason: 'spam',
    lastReportedAt: '2026-08-10T00:00:00.000Z',
  };
}

function rowB(): V1AdminReportedTeamRow {
  return {
    teamId: 'team-b',
    name: 'B팀',
    status: 'active',
    totalCount: 2,
    recentCount: 1,
    topReason: 'harassment',
    lastReportedAt: '2026-07-01T00:00:00.000Z',
  };
}

function rowSuspended(): V1AdminReportedTeamRow {
  return {
    teamId: 'team-c',
    name: 'C팀',
    status: 'suspended',
    totalCount: 8,
    recentCount: 4,
    topReason: 'impersonation',
    lastReportedAt: '2026-08-15T00:00:00.000Z',
  };
}

function rowDeletedTeamNoReason(): V1AdminReportedTeamRow {
  // 팀 삭제·사유 없음 케이스 — name/status/topReason/lastReportedAt 전부 null.
  return {
    teamId: 'team-deleted-id',
    name: null,
    status: null,
    totalCount: 2,
    recentCount: 0,
    topReason: null,
    lastReportedAt: null,
  };
}

describe('AdminReportedTeamsPage', () => {
  beforeEach(() => {
    reportedTeamsMock.mockReset();
  });

  it('신고 건수 내림차순으로 팀을 보여준다', () => {
    // 서버가 이미 건수 내림차순으로 정렬해 보내므로 화면은 받은 순서를 그대로 렌더한다.
    reportedTeamsMock.mockReturnValue({
      data: { items: [rowA(), rowB()], windowDays: 30 },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AdminReportedTeamsPage />);

    const rows = screen.getAllByRole('row');
    // rows[0]는 헤더 행 — 첫 데이터 행(rows[1])이 items[0](rowA)이어야 한다.
    expect(rows[1]).toHaveTextContent('A팀');
  });

  it('행을 누르면 그 팀의 신고만 필터된 문의 목록으로 간다', () => {
    reportedTeamsMock.mockReturnValue({
      data: { items: [rowA()], windowDays: 30 },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AdminReportedTeamsPage />);

    // AdminDataTable은 데스크톱 표와 모바일 스택 뷰를 함께 렌더링해 같은 링크가 중복으로
    // 나온다(반응형 CSS로만 전환, 이웃 inquiries 목록 테스트와 같은 이유) — 존재 여부와
    // href 일치만 확인한다.
    const links = screen.getAllByRole('link', { name: /A팀/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin/inquiries?category=report&reportedTeamId=team-a');
    }
  });

  it('정지된 팀은 상태를 함께 보여준다', () => {
    reportedTeamsMock.mockReturnValue({
      data: { items: [rowSuspended()], windowDays: 30 },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AdminReportedTeamsPage />);

    expect(screen.getAllByText('정지됨').length).toBeGreaterThan(0);
  });

  it('신고가 없으면 빈 상태를 보여준다', () => {
    reportedTeamsMock.mockReturnValue({
      data: { items: [], windowDays: 30 },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AdminReportedTeamsPage />);

    expect(screen.getByText('신고 누적된 팀이 없어요')).toBeInTheDocument();
  });

  it('팀이 삭제됐거나 사유가 없어도 깨지지 않고 대체 텍스트를 보여준다', () => {
    reportedTeamsMock.mockReturnValue({
      data: { items: [rowDeletedTeamNoReason()], windowDays: 30 },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AdminReportedTeamsPage />);

    expect(screen.getAllByText(/삭제된 팀/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('상태 알 수 없음').length).toBeGreaterThan(0);
    // topReason·lastReportedAt null 은 대시로 표시된다.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  // flex-col 의 기본 align-items: stretch 가 상태 pill 을 열 폭 전체로 늘렸다
  // (alpha 캡처에서 파란 배지가 팀 칸을 가득 채웠다). items-start 로 고정한다.
  it('상태 배지가 열 폭 전체로 늘어나지 않는다', () => {
    reportedTeamsMock.mockReturnValue({ data: { items: [rowA()], windowDays: 30 }, isPending: false, isError: false, error: null, refetch: vi.fn() });

    const { container } = render(<AdminReportedTeamsPage />);

    const cell = container.querySelector('.flex.flex-col');
    expect(cell).not.toBeNull();
    expect(cell?.className).toContain('items-start');
  });

});
