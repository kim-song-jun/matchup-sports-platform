import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminHubPage from './page';

const inboxMock = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminHubInbox: () => inboxMock(),
}));

describe('AdminHubPage — 할 일 인박스', () => {
  it('renders KPI counts and per-tournament rows with deep links', () => {
    inboxMock.mockReturnValue({
      data: {
        pendingRegistrations: {
          total: 10,
          tournaments: [{ tournamentId: 'tour-2', title: '주말 리그', count: 7 }],
        },
        resultReviewPending: {
          total: 2,
          tournaments: [{ tournamentId: 'tour-1', title: '가을 풋살컵', count: 2 }],
        },
        pendingInquiries: 4,
        tournamentsInProgress: 1,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminHubPage />);

    expect(screen.getByLabelText('미승인 대회 신청: 10건')).toBeInTheDocument();
    expect(screen.getByLabelText('결과 검토 대기: 2건')).toBeInTheDocument();
    expect(screen.getByLabelText('미답변 문의: 4건')).toBeInTheDocument();
    expect(screen.getByLabelText('진행중 대회: 1개')).toBeInTheDocument();

    // 대회별 딥링크 — 신청 관리 탭 / 운영 콘솔 결과 검토
    expect(screen.getByRole('link', { name: /신청 관리/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tour-2/registrations',
    );
    expect(screen.getByRole('link', { name: /검토하기/ })).toHaveAttribute(
      'href',
      '/admin/live/tour-1/result-review',
    );
    // 처리할 일이 남아 있으면 초록 안내는 없다
    expect(screen.queryByText('지금은 처리할 일이 없어요.')).not.toBeInTheDocument();
  });

  it('shows the all-clear notice when nothing is pending', () => {
    inboxMock.mockReturnValue({
      data: {
        pendingRegistrations: { total: 0, tournaments: [] },
        resultReviewPending: { total: 0, tournaments: [] },
        pendingInquiries: 0,
        tournamentsInProgress: 3,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminHubPage />);

    // 진행중 대회는 '할 일'이 아니므로 all-clear 판정에 포함되지 않는다
    expect(screen.getByText('지금은 처리할 일이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('대회별 미승인 신청')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the inbox query fails', () => {
    const refetch = vi.fn();
    inboxMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    });

    render(<AdminHubPage />);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });
});
