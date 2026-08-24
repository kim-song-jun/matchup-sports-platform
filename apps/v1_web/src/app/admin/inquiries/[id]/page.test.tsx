/**
 * 신고 상세 — 대상 팀 누적 요약과 조치(정지·대리 차단) 버튼.
 *
 * 여기서 고정하는 것: reasonBreakdown 롤업 문구(부재 키는 건너뛴다), status:write 없을 때
 * 조치 버튼 미노출, 두 조치 모두 2단계 인라인 확인을 거쳐야 mutate 가 불린다는 것,
 * 대상 팀을 모를 때(reportedTeam: null) 조치 버튼 대신 안내가 뜬다는 것.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminInquiryDetail } from '@/types/api';
import AdminInquiryDetailPage from './page';

const { inquiryMock, adminMeMock, blockMock, suspendMock, replyMock, updateReplyMock, statusMock } = vi.hoisted(
  () => ({
    inquiryMock: vi.fn(),
    adminMeMock: vi.fn(),
    blockMock: vi.fn(),
    suspendMock: vi.fn(),
    replyMock: vi.fn(),
    updateReplyMock: vi.fn(),
    statusMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'inq-1' }) }));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminInquiry: () => inquiryMock(),
  useV1AdminMe: () => adminMeMock(),
  useV1BlockReportedTeam: () => blockMock(),
  useV1ChangeTeamStatus: () => suspendMock(),
  useV1ReplyAdminInquiry: () => replyMock(),
  useV1UpdateAdminInquiryReply: () => updateReplyMock(),
  useV1ChangeAdminInquiryStatus: () => statusMock(),
}));

function detailWithReportedTeam(overrides: Partial<V1AdminInquiryDetail> = {}): V1AdminInquiryDetail {
  return {
    inquiryId: 'inq-1',
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
    body: '이 팀이 스팸을 보내요.',
    contact: null,
    replies: [],
    reportedTeam: {
      teamId: 'team-9',
      name: '수상한FC',
      status: 'active',
      windowDays: 30,
      recentReportCount: 3,
      reasonBreakdown: { spam: 2, harassment: 1 },
    },
    ...overrides,
  };
}

function mockInquiryDetail(overrides: Partial<V1AdminInquiryDetail> = {}) {
  inquiryMock.mockReturnValue({
    data: detailWithReportedTeam(overrides),
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('AdminInquiryDetailPage — 신고 대상 팀 롤업/조치', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminMeMock.mockReturnValue({ data: { capabilities: ['status:write', 'overview:read'] } });
    replyMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    updateReplyMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    statusMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    blockMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    suspendMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('신고 상세에 대상 팀의 누적 요약이 보인다', () => {
    mockInquiryDetail();
    render(<AdminInquiryDetailPage />);

    expect(screen.getByText(/최근 30일/)).toBeInTheDocument();
    expect(screen.getByText(/3건/)).toBeInTheDocument();
    expect(screen.getByText(/스팸·광고 2/)).toBeInTheDocument();
    expect(screen.getByText(/괴롭힘·욕설 1/)).toBeInTheDocument();
  });

  it('건수가 0인 사유는 요약 문구에 나오지 않는다', () => {
    mockInquiryDetail({
      reportedTeam: {
        teamId: 'team-9',
        name: '수상한FC',
        status: 'active',
        windowDays: 30,
        recentReportCount: 2,
        reasonBreakdown: { spam: 2 },
      },
    });
    render(<AdminInquiryDetailPage />);

    expect(screen.queryByText(/괴롭힘·욕설/)).not.toBeInTheDocument();
  });

  it('status:write 가 없으면 조치 버튼이 보이지 않는다', () => {
    adminMeMock.mockReturnValue({ data: { capabilities: ['overview:read'] } });
    mockInquiryDetail();
    render(<AdminInquiryDetailPage />);

    expect(screen.queryByRole('button', { name: '신고한 팀 대신 차단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '팀 정지' })).not.toBeInTheDocument();
    // 요약 자체는 조회 권한만으로도 보여야 한다 — 숨는 건 조치뿐이다.
    expect(screen.getByText('수상한FC')).toBeInTheDocument();
  });

  it('대리 차단은 확인 단계를 거쳐 inquiryId 로 호출된다', async () => {
    const mutate = vi.fn();
    blockMock.mockReturnValue({ mutate, isPending: false });
    mockInquiryDetail();
    const user = userEvent.setup();
    render(<AdminInquiryDetailPage />);

    await user.click(screen.getByRole('button', { name: '신고한 팀 대신 차단' }));
    expect(mutate).not.toHaveBeenCalled(); // 한 번 눌러선 실행되지 않는다

    await user.click(within(screen.getByRole('group', { name: '차단 확인' })).getByRole('button', { name: '차단' }));
    expect(mutate).toHaveBeenCalledWith('inq-1', expect.objectContaining({ onError: expect.any(Function) }));
  });

  it('취소를 누르면 차단 확인이 닫히고 mutate 가 불리지 않는다', async () => {
    const mutate = vi.fn();
    blockMock.mockReturnValue({ mutate, isPending: false });
    mockInquiryDetail();
    const user = userEvent.setup();
    render(<AdminInquiryDetailPage />);

    await user.click(screen.getByRole('button', { name: '신고한 팀 대신 차단' }));
    await user.click(within(screen.getByRole('group', { name: '차단 확인' })).getByRole('button', { name: '취소' }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '신고한 팀 대신 차단' })).toBeInTheDocument();
  });

  it('팀 정지도 확인 단계를 거쳐 suspended 상태로, 대상 팀 id 로 호출된다', async () => {
    const mutate = vi.fn();
    suspendMock.mockReturnValue({ mutate, isPending: false });
    mockInquiryDetail();
    const user = userEvent.setup();
    render(<AdminInquiryDetailPage />);

    await user.click(screen.getByRole('button', { name: '팀 정지' }));
    expect(mutate).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('group', { name: '정지 확인' })).getByRole('button', { name: '정지' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'team-9', status: 'suspended' }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('이미 정지된 팀은 정지 버튼 대신 안내를 보여준다', () => {
    mockInquiryDetail({
      reportedTeam: {
        teamId: 'team-9',
        name: '수상한FC',
        status: 'suspended',
        windowDays: 30,
        recentReportCount: 3,
        reasonBreakdown: { spam: 2, harassment: 1 },
      },
    });
    render(<AdminInquiryDetailPage />);

    expect(screen.queryByRole('button', { name: '팀 정지' })).not.toBeInTheDocument();
    expect(screen.getByText('이 팀은 정지된 상태예요.')).toBeInTheDocument();
    // 차단은 정지와 독립적인 조치라 계속 보인다.
    expect(screen.getByRole('button', { name: '신고한 팀 대신 차단' })).toBeInTheDocument();
  });

  it('대상 팀이 없으면 조치 버튼 대신 안내가 보인다', () => {
    mockInquiryDetail({ reportedTeam: null });
    render(<AdminInquiryDetailPage />);

    expect(screen.getByText('신고 대상 팀을 알 수 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '신고한 팀 대신 차단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '팀 정지' })).not.toBeInTheDocument();
  });

  it('신고 이외 분류 문의는 신고 대상 팀 섹션 자체가 보이지 않는다', () => {
    mockInquiryDetail({ category: 'account', reportedTeam: null, reportReason: null });
    render(<AdminInquiryDetailPage />);

    expect(screen.queryByRole('region', { name: '신고 대상 팀' })).not.toBeInTheDocument();
  });
});
