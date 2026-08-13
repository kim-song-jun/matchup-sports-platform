import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { TournamentOpsGate } from './_gate';

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1Tournament: vi.fn(),
  useV1TournamentStaffAssignments: vi.fn(),
  useV1MyStaffAssignments: vi.fn(),
  useSearchParams: vi.fn(),
  usePathname: vi.fn(),
}));

// 내 배정 조회(useV1MyTournamentStaffAssignments)만 대체한다. 판정 헬퍼(coversFixture)는
// 실제 구현을 그대로 쓴다 — "이 경기를 담당하는가" 판정 자체가 이 게이트 테스트의 검증 대상이다.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
  useV1Tournament: (...args: unknown[]) => mocks.useV1Tournament(...args),
  useV1TournamentStaffAssignments: (...args: unknown[]) => mocks.useV1TournamentStaffAssignments(...args),
  useV1MyTournamentStaffAssignments: (...args: unknown[]) => mocks.useV1MyStaffAssignments(...args),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.useSearchParams(),
  usePathname: () => mocks.usePathname(),
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
    mocks.useV1MyStaffAssignments.mockReset();
    mocks.useSearchParams.mockReset();
    mocks.usePathname.mockReset();
    mocks.useV1AuthMe.mockReturnValue({ isPending: false, isError: false, data: AUTH_ME, refetch: vi.fn() });
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 풋살 대회' } });
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    mocks.usePathname.mockReturnValue('/tournament-ops/tournaments/t-1/operations');
    mocks.useV1MyStaffAssignments.mockReturnValue({ isPending: false, isError: false, data: { items: [] } });
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

  it('대회 전역 화면에 온 필드 담당자에게는 담당 범위 밖임을 알리고 내 대회 운영으로 보낸다', () => {
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

    expect(screen.getByText('담당 범위 밖의 화면이에요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '내 대회 운영으로 가기' })).toHaveAttribute('href', '/tournament-ops');
    expect(screen.queryByText('보드 콘텐츠')).not.toBeInTheDocument();
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

/**
 * 필드 담당자 딥링크 (트랙 D) — 양방향으로 확인한다: 담당인 사람은 열리고, 담당이 아닌
 * 사람/역할/대회는 막힌다. 권한 게이트라 한쪽만 검증하면 과다 노출로 이어진다.
 */
describe('TournamentOpsGate 필드 담당자 딥링크', () => {
  const CONSOLE_PATH = '/tournament-ops/tournaments/t-1/fixtures/fx-1/operate';

  function scopeDeniedShell() {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: apiError(403, 'STAFF_SCOPE_DENIED', 'FIXTURE_SCOPE_REQUIRED'),
      refetch: vi.fn(),
    });
  }

  function myAssignments(items: unknown[]) {
    mocks.useV1MyStaffAssignments.mockReturnValue({ isPending: false, isError: false, data: { items } });
  }

  /**
   * `GET /me/tournament-staff` 응답의 items[] 한 칸 — 대회 단위로 묶인 그룹이다.
   * `fixtureIds` 가 비고 `fieldId` 만 있으면 필드 단위 배정이라 화면이 담당 여부를 판정할 수
   * 없고, 그때는 막지 않고 서버 판정에 맡긴다(coversFixture 참조).
   */
  const fieldOperatorAssignment = (overrides: Record<string, unknown> = {}) => {
    const { tournamentId = 't-1', fixtureIds = ['fx-1'], fieldId = null, ...rest } = overrides;
    return {
      tournamentId,
      tournamentTitle: '가을 풋살 대회',
      tournamentStatus: 'in_progress',
      assignments: [
        {
          id: 'a-1',
          role: 'FIELD_OPERATOR',
          fieldId,
          fieldName: null,
          version: 1,
          expiresAt: null,
          fixtureIds,
          ...rest,
        },
      ],
    };
  };

  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ isPending: false, isError: false, data: AUTH_ME, refetch: vi.fn() });
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 풋살 대회' } });
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    mocks.usePathname.mockReturnValue(CONSOLE_PATH);
  });

  it('담당 경기라면 셸 없이 경기 콘솔을 연다', () => {
    scopeDeniedShell();
    myAssignments([fieldOperatorAssignment()]);

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByText('경기 콘솔')).toBeInTheDocument();
    // 대회 전역 내비(셸)는 이 역할에게 열리지 않는다 — 누르면 403 나는 링크를 만들지 않는다.
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '내 대회 운영으로 돌아가기' })).toHaveAttribute('href', '/tournament-ops');
  });

  it('배정에 없는 경기는 딥링크로도 열리지 않는다', () => {
    scopeDeniedShell();
    myAssignments([fieldOperatorAssignment({ fixtureIds: ['fx-other'] })]);

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.queryByText('경기 콘솔')).not.toBeInTheDocument();
    expect(screen.getByText('담당 범위 밖의 화면이에요')).toBeInTheDocument();
  });

  it('다른 대회의 같은 경기 id를 담당해도 이 대회 콘솔은 열리지 않는다', () => {
    scopeDeniedShell();
    myAssignments([fieldOperatorAssignment({ tournamentId: 't-2' })]);

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.queryByText('경기 콘솔')).not.toBeInTheDocument();
    expect(screen.getByText('담당 범위 밖의 화면이에요')).toBeInTheDocument();
  });

  it('배정이 아예 없으면(스태프가 아닌 사용자) 딥링크가 열리지 않는다', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: apiError(403, 'STAFF_SCOPE_DENIED', 'ASSIGNMENT_REQUIRED'),
      refetch: vi.fn(),
    });
    myAssignments([]);

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.queryByText('경기 콘솔')).not.toBeInTheDocument();
    expect(screen.getByText('대회 운영자 권한이 필요해요')).toBeInTheDocument();
  });

  it('내 배정 조회가 끝나기 전에는 콘솔도 거부 화면도 보여주지 않는다', () => {
    scopeDeniedShell();
    mocks.useV1MyStaffAssignments.mockReturnValue({ isPending: true });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.queryByText('경기 콘솔')).not.toBeInTheDocument();
    expect(screen.queryByText('담당 범위 밖의 화면이에요')).not.toBeInTheDocument();
  });

  it('내 배정 조회가 실패하면(5xx) 권한 안내가 아니라 재시도 화면을 보여준다', () => {
    scopeDeniedShell();
    mocks.useV1MyStaffAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: apiError(503, 'SERVICE_UNAVAILABLE'),
      refetch: vi.fn(),
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByText('잠시 문제가 생겼어요')).toBeInTheDocument();
    expect(screen.queryByText('경기 콘솔')).not.toBeInTheDocument();
    expect(screen.queryByText('담당 범위 밖의 화면이에요')).not.toBeInTheDocument();
  });

  it('셸 진입이 가능한 역할(디렉터)은 종전대로 셸 안에서 콘솔을 연다 — 진입 판정을 바꾸지 않았다', () => {
    mocks.useV1TournamentStaffAssignments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { items: [{ userId: 'user-me', role: 'TOURNAMENT_DIRECTOR', revokedAt: null, expiresAt: null }] },
    });

    render(
      <TournamentOpsGate tournamentId="t-1">
        <div>경기 콘솔</div>
      </TournamentOpsGate>,
    );

    expect(screen.getByTestId('shell')).toHaveAttribute('data-role', 'TOURNAMENT_DIRECTOR');
    expect(screen.getByText('경기 콘솔')).toBeInTheDocument();
    // 셸로 들어가는 정상 경로에서는 내 배정 조회 자체가 비활성이다(추가 요청 없음).
    expect(mocks.useV1MyStaffAssignments).toHaveBeenCalledWith({ enabled: false });
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
