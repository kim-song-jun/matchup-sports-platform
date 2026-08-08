import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { TournamentOpsGate } from './_gate';

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1Tournament: vi.fn(),
  useV1TournamentStaffAssignments: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
  useV1Tournament: (...args: unknown[]) => mocks.useV1Tournament(...args),
  useV1TournamentStaffAssignments: (...args: unknown[]) => mocks.useV1TournamentStaffAssignments(...args),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.useSearchParams(),
}));

// 셸 자체의 반응형/드로어 로직은 이 게이트 테스트의 관심사가 아니다 — 게이트가 도출한
// role/origin/children을 정확히 전달하는지만 확인할 수 있게 얇게 대체한다.
vi.mock('@/components/tournament-ops/tournament-ops-shell', () => ({
  TournamentOpsShell: ({ children, role, origin }: { children: React.ReactNode; role: string; origin: string }) => (
    <div data-testid="shell" data-role={role} data-origin={origin}>
      {children}
    </div>
  ),
}));

const AUTH_ME = { user: { id: 'user-me' } } as const;

function apiError(statusCode: number, code: string, reason?: string) {
  return new V1ApiError({
    status: 'error',
    statusCode,
    code,
    message: 'denied',
    details: reason ? { reason } : undefined,
    timestamp: '2026-08-03T00:00:00.000Z',
  });
}

describe('TournamentOpsGate', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReset();
    mocks.useV1Tournament.mockReset();
    mocks.useV1TournamentStaffAssignments.mockReset();
    mocks.useSearchParams.mockReset();
    mocks.useV1AuthMe.mockReturnValue({ isPending: false, isError: false, data: AUTH_ME, refetch: vi.fn() });
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 풋살 대회' } });
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('shows a loading screen while auth/staff queries are pending', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({ isPending: true });
    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드</div>
      </TournamentOpsGate>,
    );
    expect(screen.queryByText('보드')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('derives TOURNAMENT_DIRECTOR from my own active assignment row and renders the shell', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        items: [
          { userId: 'user-me', role: 'TOURNAMENT_DIRECTOR', revokedAt: null, expiresAt: null },
          { userId: 'someone-else', role: 'SUPPORT_READONLY', revokedAt: null, expiresAt: null },
        ],
      },
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드 콘텐츠</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByTestId('shell')).toHaveAttribute('data-role', 'TOURNAMENT_DIRECTOR');
    expect(screen.getByText('보드 콘텐츠')).toBeInTheDocument();
  });

  it('derives PLATFORM_OPS when the staff list succeeds but no assignment row matches me (admin bypass path)', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { items: [{ userId: 'someone-else', role: 'TOURNAMENT_DIRECTOR', revokedAt: null, expiresAt: null }] },
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드 콘텐츠</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByTestId('shell')).toHaveAttribute('data-role', 'PLATFORM_OPS');
  });

  it('treats a revoked assignment row as inactive and falls back to PLATFORM_OPS derivation rather than crashing', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        items: [
          {
            userId: 'user-me',
            role: 'FIELD_OPERATOR',
            revokedAt: '2026-08-01T00:00:00.000Z',
            expiresAt: null,
          },
        ],
      },
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드 콘텐츠</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByTestId('shell')).toHaveAttribute('data-role', 'PLATFORM_OPS');
  });

  it('shows an access-denied screen (not a crash) when the caller is not staff for this tournament', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: apiError(403, 'STAFF_SCOPE_DENIED', 'ASSIGNMENT_REQUIRED'),
      refetch: vi.fn(),
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드 콘텐츠</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByText('대회 운영자 권한이 필요해요')).toBeInTheDocument();
    expect(screen.queryByText('보드 콘텐츠')).not.toBeInTheDocument();
  });

  it('shows a softer "not yet supported" message for a field-scoped operator hitting a tournament-wide route', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: apiError(403, 'STAFF_SCOPE_DENIED', 'FIXTURE_SCOPE_REQUIRED'),
      refetch: vi.fn(),
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드 콘텐츠</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByText('아직 지원하지 않는 화면이에요')).toBeInTheDocument();
  });

  it('shows a retryable transient-error screen (not access-denied) for a 5xx failure', () => {
    const refetch = vi.fn();
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: apiError(503, 'SERVICE_UNAVAILABLE'),
      refetch,
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>보드 콘텐츠</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByText('잠시 문제가 생겼어요')).toBeInTheDocument();
    expect(screen.queryByText('대회 운영자 권한이 필요해요')).not.toBeInTheDocument();
  });
});

describe('TournamentOpsGate 진입 출처 (T6-2)', () => {
  beforeEach(() => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { items: [{ userId: 'user-me', role: 'PLATFORM_OPS', revokedAt: null, expiresAt: null }] },
    });
    window.sessionStorage.clear();
  });

  it('?from=admin이면 origin="admin"으로 셸에 전달하고 sessionStorage에 기록한다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('from=admin'));
    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>x</div>
      </TournamentOpsGate>,
    );
    expect(screen.getByTestId('shell')).toHaveAttribute('data-origin', 'admin');
    expect(window.sessionStorage.getItem('teameet.v1.tournamentOpsOrigin.t-1')).toBe('admin');
  });

  it('쿼리 없이 다시 렌더돼도(nav 안에서 딴 화면으로 이동) sessionStorage 기록으로 origin이 유지된다', () => {
    window.sessionStorage.setItem('teameet.v1.tournamentOpsOrigin.t-1', 'admin');
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>x</div>
      </TournamentOpsGate>,
    );
    expect(screen.getByTestId('shell')).toHaveAttribute('data-origin', 'admin');
  });

  it('한 번도 admin에서 온 적 없으면 origin="home"이다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>x</div>
      </TournamentOpsGate>,
    );
    expect(screen.getByTestId('shell')).toHaveAttribute('data-origin', 'home');
  });
});
