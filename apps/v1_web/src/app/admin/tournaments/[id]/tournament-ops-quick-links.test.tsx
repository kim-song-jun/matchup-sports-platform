import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { useV1TournamentStaffAssignments } from '@/hooks/use-v1-api';
import { TournamentOpsQuickLinks } from './tournament-ops-quick-links';

vi.mock('@/hooks/use-v1-api', () => ({ useV1TournamentStaffAssignments: vi.fn() }));

function apiError(reason?: string) {
  return new V1ApiError({
    status: 'error', statusCode: 403, code: 'STAFF_SCOPE_DENIED', message: 'denied',
    details: reason ? { reason } : undefined, timestamp: '2026-08-07T00:00:00.000Z',
  });
}

function serverErrorApiError() {
  return new V1ApiError({
    status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: 'unavailable',
    details: undefined, timestamp: '2026-08-07T00:00:00.000Z',
  });
}

describe('TournamentOpsQuickLinks (T6-5, D-16)', () => {
  it('접근 가능하면 from=admin이 붙은 활성 링크 2개를 렌더한다', () => {
    vi.mocked(useV1TournamentStaffAssignments).mockReturnValue({ isPending: false, isError: false, data: { items: [] } } as never);
    render(<TournamentOpsQuickLinks tournamentId="t-1" />);
    expect(screen.getByRole('link', { name: '스태프 배정 콘솔' })).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/staff?from=admin');
    expect(screen.getByRole('link', { name: '운영 보드' })).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/operations?from=admin');
  });

  it('403이면 숨기지 않고 비활성 버튼 + 사유 문구를 보여준다', () => {
    vi.mocked(useV1TournamentStaffAssignments).mockReturnValue({ isPending: false, isError: true, error: apiError('ASSIGNMENT_REQUIRED') } as never);
    render(<TournamentOpsQuickLinks tournamentId="t-1" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getAllByText('스태프 배정이 필요해요.').length).toBe(2);
  });

  it('scope-not-yet-supported 사유는 다른 문구로 보여준다', () => {
    vi.mocked(useV1TournamentStaffAssignments).mockReturnValue({ isPending: false, isError: true, error: apiError('FIXTURE_SCOPE_REQUIRED') } as never);
    render(<TournamentOpsQuickLinks tournamentId="t-1" />);
    expect(screen.getAllByText('담당 범위 밖의 화면이에요.').length).toBe(2);
  });

  it('조회 중에는 활성 링크로 먼저 보여주지 않는다(레이스 클릭 방지)', () => {
    vi.mocked(useV1TournamentStaffAssignments).mockReturnValue({ isPending: true, isError: false } as never);
    render(<TournamentOpsQuickLinks tournamentId="t-1" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByText('확인 중…').length).toBe(2);
  });

  it('5xx/네트워크 오류는 권한 문구 대신 재시도 유도 문구를 보여준다', () => {
    vi.mocked(useV1TournamentStaffAssignments).mockReturnValue({ isPending: false, isError: true, error: serverErrorApiError() } as never);
    render(<TournamentOpsQuickLinks tournamentId="t-1" />);
    expect(screen.queryByText('스태프 배정이 필요해요.')).not.toBeInTheDocument();
    expect(screen.getAllByText('일시적인 오류예요. 다시 시도해 주세요.').length).toBe(2);
  });

  it('V1ApiError가 아닌 일반 에러(네트워크 단절 등)도 재시도 유도 문구를 보여준다', () => {
    vi.mocked(useV1TournamentStaffAssignments).mockReturnValue({ isPending: false, isError: true, error: new Error('network down') } as never);
    render(<TournamentOpsQuickLinks tournamentId="t-1" />);
    expect(screen.queryByText('스태프 배정이 필요해요.')).not.toBeInTheDocument();
    expect(screen.getAllByText('일시적인 오류예요. 다시 시도해 주세요.').length).toBe(2);
  });
});
