import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchApplicationsPageClient } from './client';
const mocks = vi.hoisted(() => ({ replace: vi.fn(), query: vi.fn(), applications: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Match: mocks.query,
  useV1MatchApplicationEligibility: () => ({ data: { requiresApproval: true } }),
  useV1MatchApplicationsInfinite: mocks.applications,
  useV1ApproveMatchApplication: () => ({ isPending: false }),
  useV1RejectMatchApplication: () => ({ isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.applications.mockReturnValue({ data: { pages: [{ items: [] }] } });
});
describe('개인 매치 신청 관리', () => {
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
