import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchApplicationsPageClient } from './client';
const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), query: vi.fn(), applications: vi.fn(), changeParticipant: vi.fn(), completeMatch: vi.fn() }));
const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Match: mocks.query,
  useV1MatchApplicationEligibility: () => ({ data: { requiresApproval: true } }),
  useV1MatchApplicationsInfinite: mocks.applications,
  useV1ApproveMatchApplication: () => ({ isPending: false }),
  useV1RejectMatchApplication: () => ({ isPending: false }),
  useV1ChangeMatchParticipant: () => ({ isPending: false, mutate: mocks.changeParticipant }),
  useV1CompleteMatch: () => ({ isPending: false, mutate: mocks.completeMatch }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.applications.mockReturnValue({ data: { pages: [{ items: [] }] } });
});
describe('개인 매치 신청 관리', () => {
  // 상세가 받은 출처까지 담아 넘긴 from 을 데스크톱 뒤로가기도 따라야 상세 → 뒤로가 처음 출처로 이어진다.
  it('데스크톱 뒤로가기가 상세가 넘긴 출처를 따른다', () => {
    navigation.search = `from=${encodeURIComponent('/matches/m1?from=%2Fmy%2Fmatches%2Fcreated')}`;
    mocks.query.mockReturnValue({ data: { title: '매치', viewer: { state: 'host' } } });
    render(<MatchApplicationsPageClient matchId="m1" />);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/matches/m1?from=%2Fmy%2Fmatches%2Fcreated');
    navigation.search = '';
  });

  it('출처가 없으면 매치 상세로 돌아간다', () => {
    mocks.query.mockReturnValue({ data: { title: '매치', viewer: { state: 'host' } } });
    render(<MatchApplicationsPageClient matchId="m1" />);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/matches/m1');
  });

  function confirmedApplication(overrides = {}) {
    mocks.query.mockReturnValue({ data: { title: '매치', viewer: { state: 'host' } } });
    mocks.applications.mockReturnValue({ data: { pages: [{ items: [{
      applicationId: 'a1', participantId: 'p1', displayName: '참가자', status: 'approved',
      participantStatus: 'active', mannerScore: null, reviewCount: 0,
      canCancelApproval: true, canMarkCancelled: false, ...overrides,
    }] }] } });
    render(<MatchApplicationsPageClient matchId="m1" />);
    fireEvent.click(screen.getByRole('button', { name: '확정 명단' }));
  }

  it('승인 취소는 사유와 확인을 거쳐 실제 참가자 ID로 요청한다', async () => {
    confirmedApplication();
    fireEvent.click(screen.getByRole('button', { name: '참가자 참가자 관리' }));
    expect(screen.getByRole('button', { name: '승인 취소' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('처리 사유 (필수)'), { target: { value: '  참가자 요청  ' } });
    fireEvent.click(screen.getByRole('button', { name: '승인 취소' }));
    expect(mocks.changeParticipant).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '승인 취소' }));
    await waitFor(() => expect(mocks.changeParticipant).toHaveBeenCalledWith(
      { participantId: 'p1', action: 'cancel-approval', reason: '참가자 요청' }, expect.any(Object),
    ));
  });

  it('시작 후 불참 처리를 취소하면 요청을 보내지 않는다', async () => {
    confirmedApplication({ canCancelApproval: false, canMarkCancelled: true });
    fireEvent.click(screen.getByRole('button', { name: '참가자 참가자 관리' }));
    expect(screen.queryByRole('button', { name: '승인 취소' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('처리 사유 (필수)'), { target: { value: '현장 불참' } });
    fireEvent.click(screen.getByRole('button', { name: '불참 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.changeParticipant).not.toHaveBeenCalled();
  });

  it('처리 실패를 노출하고 입력 사유를 보존한다', async () => {
    mocks.changeParticipant.mockImplementation((_body, options) => options.onError(new Error('매치가 이미 완료됐어요')));
    confirmedApplication({ canCancelApproval: false, canMarkCancelled: true });
    fireEvent.click(screen.getByRole('button', { name: '참가자 참가자 관리' }));
    fireEvent.change(screen.getByLabelText('처리 사유 (필수)'), { target: { value: '현장 불참' } });
    fireEvent.click(screen.getByRole('button', { name: '불참 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '불참 처리' }));
    await waitFor(() => expect(screen.getByText('매치가 이미 완료됐어요')).toBeInTheDocument());
    expect(screen.getByLabelText('처리 사유 (필수)')).toHaveValue('현장 불참');
  });

  it.each([['no_show', '불참'], ['removed', '승인 취소'], ['completed', '참여 완료']])('처리 이력 %s와 비활성 관리를 표시한다', (participantStatus, label) => {
    confirmedApplication({ participantStatus, canCancelApproval: false, canMarkCancelled: false });
    expect(screen.getByLabelText(`상태: ${label}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '참가자 참가자 관리' })).not.toBeInTheDocument();
  });
  it('placeholder로 호스트 권한을 판정하거나 상세로 돌려보내지 않는다', () => {
    mocks.query.mockReturnValue({ data: { matchId: 'm1', title: '매치' }, isPlaceholderData: true });
    const { rerender } = render(<MatchApplicationsPageClient matchId="m1" />);
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.query.mockReturnValue({ data: { matchId: 'm1', title: '매치', viewer: { state: 'host' } }, isPlaceholderData: false });
    rerender(<MatchApplicationsPageClient matchId="m1" />);
    expect(screen.getByRole('button', { name: '확정 명단' })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('확정 명단과 전체 이력은 각각 실제 API 필터를 바꾼다', () => {
    mocks.query.mockReturnValue({ data: { title: '매치', viewer: { state: 'host' } } });
    render(<MatchApplicationsPageClient matchId="m1" />);
    fireEvent.click(screen.getByRole('button', { name: '확정 명단' }));
    expect(mocks.applications).toHaveBeenLastCalledWith('m1', { status: 'approved', limit: 50 }, { enabled: true });
    fireEvent.click(screen.getByRole('button', { name: '전체 이력' }));
    expect(mocks.applications).toHaveBeenLastCalledWith('m1', { limit: 50 }, { enabled: true });
  });
});
