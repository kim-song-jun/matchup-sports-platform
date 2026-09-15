import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminInquiriesPage from './page';
import type { AdminListFilters, V1AdminInquiryRow } from '@/types/api';

const inquiriesMock = vi.fn<(filters?: AdminListFilters) => unknown>();
const replaceMock = vi.fn();
// 딥링크용 초기 쿼리. 테스트마다 바꿔 끼울 수 있게 변수로 둔다.
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/admin/inquiries',
}));

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
    searchParamsValue = new URLSearchParams();
    replaceMock.mockReset();
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

  // 딥링크: 운영자가 "스팸 신고 목록" 링크를 받아 그대로 그 화면에 도착해야 한다.
  describe('URL 딥링크', () => {
    it('URL 의 분류·사유가 초기 필터로 적용된다', () => {
      searchParamsValue = new URLSearchParams('category=report&reportReason=spam');

      render(<AdminInquiriesPage />);

      expect(inquiriesMock).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'report', reportReason: 'spam' }),
      );
      expect(screen.getByLabelText('신고 사유 필터')).toBeInTheDocument();
    });

    it('분류가 신고가 아닌데 사유만 있는 링크는 사유를 무시한다', () => {
      // 보이지 않는 필터가 목록을 좁혀 "왜 결과가 없지?" 를 만드는 것을 막는다.
      searchParamsValue = new URLSearchParams('category=team&reportReason=spam');

      render(<AdminInquiriesPage />);

      const args = inquiriesMock.mock.calls.at(-1)?.[0];
      expect(args).toMatchObject({ category: 'team' });
      expect(args).not.toHaveProperty('reportReason');
    });

    it('허용 목록에 없는 값은 무시한다', () => {
      // 손으로 고친 URL 이 그대로 서버에 실려 400 이 되지 않아야 한다.
      searchParamsValue = new URLSearchParams('status=bogus&category=nope');

      render(<AdminInquiriesPage />);

      const args = inquiriesMock.mock.calls.at(-1)?.[0];
      expect(args).not.toHaveProperty('status');
      expect(args).not.toHaveProperty('category');
    });

    it('화면에서 필터를 바꾸면 주소가 갱신된다', async () => {
      const user = userEvent.setup();
      render(<AdminInquiriesPage />);

      await user.selectOptions(screen.getByLabelText('문의 분류 필터'), 'report');

      expect(replaceMock).toHaveBeenLastCalledWith('/admin/inquiries?category=report', { scroll: false });
    });

    it('필터를 모두 비우면 쿼리 없는 주소로 되돌린다', async () => {
      searchParamsValue = new URLSearchParams('category=report');
      const user = userEvent.setup();
      render(<AdminInquiriesPage />);

      await user.selectOptions(screen.getByLabelText('문의 분류 필터'), '');

      expect(replaceMock).toHaveBeenLastCalledWith('/admin/inquiries', { scroll: false });
    });

    // 신고 누적 팀 목록(#7) → 문의 목록 딥링크. 팀 id 는 자유 문자열이라 pickAllowed(허용
    // 목록 대조)가 아니라 존재 여부만으로 적용한다.
    describe('reportedTeamId (신고 누적 팀 딥링크)', () => {
      it('URL 의 reportedTeamId 가 초기 필터로 적용되고 배너로 보인다', () => {
        searchParamsValue = new URLSearchParams('category=report&reportedTeamId=team-2');

        render(<AdminInquiriesPage />);

        expect(inquiriesMock).toHaveBeenCalledWith(
          expect.objectContaining({ reportedTeamId: 'team-2' }),
        );
        // 보이지 않는 필터가 목록을 좁히면 안 된다 — 걸려 있다는 표시가 항상 있어야 한다.
        // 배너 안에 팀 id를 담은 별도 span이 있어 전체 텍스트에는 부가 정보가 더 붙는다 — 부분 일치로 확인.
        expect(screen.getByText(/이 팀의 신고만 보는 중이에요/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '팀 필터 해제' })).toBeInTheDocument();
      });

      it('필터 해제 버튼을 누르면 훅과 주소 양쪽에서 reportedTeamId 가 빠진다', async () => {
        searchParamsValue = new URLSearchParams('reportedTeamId=team-2');
        const user = userEvent.setup();
        render(<AdminInquiriesPage />);

        await user.click(screen.getByRole('button', { name: '팀 필터 해제' }));

        expect(screen.queryByText(/이 팀의 신고만 보는 중이에요/)).not.toBeInTheDocument();
        const args = inquiriesMock.mock.calls.at(-1)?.[0];
        expect(args).not.toHaveProperty('reportedTeamId');
        expect(replaceMock).toHaveBeenLastCalledWith('/admin/inquiries', { scroll: false });
      });

      it('다른 필터를 바꿔도 reportedTeamId 는 주소·훅에서 사라지지 않는다', async () => {
        // 함정: 안 보이는 필터가 다른 조작 한 번에 조용히 빠지면 "왜 결과가 없지?"가 된다.
        searchParamsValue = new URLSearchParams('reportedTeamId=team-2');
        const user = userEvent.setup();
        render(<AdminInquiriesPage />);

        await user.selectOptions(screen.getByLabelText('문의 분류 필터'), 'report');

        expect(replaceMock).toHaveBeenLastCalledWith(
          '/admin/inquiries?category=report&reportedTeamId=team-2',
          { scroll: false },
        );
        const args = inquiriesMock.mock.calls.at(-1)?.[0];
        expect(args).toMatchObject({ category: 'report', reportedTeamId: 'team-2' });
      });
    });
  });
});
