import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminInquiriesPage from './page';
import type { AdminListFilters, V1AdminInquiryRow } from '@/types/api';

const inquiriesMock = vi.fn<(filters?: AdminListFilters) => unknown>();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminInquiries: (filters?: AdminListFilters) => inquiriesMock(filters),
}));

const reportRow: V1AdminInquiryRow = {
  inquiryId: 'inquiry-1',
  userId: 'user-1',
  isGuest: false,
  requesterName: '김테스트',
  requesterEmail: 'test@example.com',
  guestEmail: null,
  guestPhone: null,
  category: 'report',
  title: '허위 팀 신고',
  status: 'received',
  relatedType: 'team_contact',
  relatedId: 'team-contact-1',
  reportReason: 'spam',
  replyCount: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  closedAt: null,
};

function mockInquiriesData() {
  inquiriesMock.mockReturnValue({
    data: {
      items: [reportRow],
      pageInfo: { nextCursor: null, hasNext: false },
      summary: {
        total: 1,
        byStatus: { received: 1, reviewing: 0, answered: 0, closed: 0 },
        byCategory: { account: 0, match: 0, team: 0, tournament: 0, payment_refund: 0, report: 1, other: 0 },
        byReportReason: { spam: 1, harassment: 0, impersonation: 0, inappropriate: 0, other: 0 },
      },
    },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('AdminInquiriesPage — 신고 사유 필터', () => {
  beforeEach(() => {
    inquiriesMock.mockReset();
    mockInquiriesData();
  });

  it('분류가 신고일 때만 사유 필터가 보인다', async () => {
    const user = userEvent.setup();
    render(<AdminInquiriesPage />);

    expect(screen.queryByLabelText('신고 사유 필터')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('문의 분류 필터'), 'report');
    expect(screen.getByLabelText('신고 사유 필터')).toBeInTheDocument();
  });

  it('사유를 고르면 목록 훅에 정확한 reportReason 값이 전달된다', async () => {
    const user = userEvent.setup();
    render(<AdminInquiriesPage />);

    await user.selectOptions(screen.getByLabelText('문의 분류 필터'), 'report');
    await user.selectOptions(screen.getByLabelText('신고 사유 필터'), 'spam');

    expect(inquiriesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'report', reportReason: 'spam' }),
    );
  });

  it('분류를 신고에서 다른 값으로 바꾸면 선택돼 있던 사유가 초기화된다', async () => {
    const user = userEvent.setup();
    render(<AdminInquiriesPage />);

    await user.selectOptions(screen.getByLabelText('문의 분류 필터'), 'report');
    await user.selectOptions(screen.getByLabelText('신고 사유 필터'), 'spam');
    expect(inquiriesMock).toHaveBeenLastCalledWith(expect.objectContaining({ reportReason: 'spam' }));

    await user.selectOptions(screen.getByLabelText('문의 분류 필터'), 'account');

    // 필터가 안 보인다고 끝이 아니다 — 안 보이는 필터가 목록을 계속 좁히면 안 되므로
    // 실제로 훅에 전달되는 값에서도 reportReason이 사라졌는지 확인한다.
    expect(screen.queryByLabelText('신고 사유 필터')).not.toBeInTheDocument();
    const lastCallArgs = inquiriesMock.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toMatchObject({ category: 'account' });
    expect(lastCallArgs).not.toHaveProperty('reportReason');
  });

  it('신고 문의 행에는 분류 옆에 사유 라벨이 함께 보인다', () => {
    render(<AdminInquiriesPage />);

    // AdminDataTable은 데스크톱 표와 모바일 스택 뷰를 함께 렌더링해 같은 셀 텍스트가
    // 중복으로 나온다(반응형 CSS로만 전환) — 존재 여부만 확인한다.
    expect(screen.getAllByText('신고').length).toBeGreaterThan(0);
    expect(screen.getAllByText('스팸·광고').length).toBeGreaterThan(0);
  });
});
