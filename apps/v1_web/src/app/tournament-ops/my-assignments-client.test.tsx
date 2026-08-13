import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyStaffAssignmentsClient } from './my-assignments-client';

/**
 * 스태프가 자기 운영 화면으로 들어가는 출발점(트랙 D). 역할별로 목적지가 갈린다:
 * 필드 담당자는 대회 셸을 건너뛰고 담당 경기 콘솔로 직행하고, 디렉터/서포트는 셸(운영 보드)로
 * 간다. 배정이 없으면 진입 링크 자체가 없어야 한다.
 */

// AppChrome 이 알림 벨을 렌더하며 react-query 를 쓴다 — 다른 화면 테스트와 같은 래퍼.
function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournament-ops',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mocks = vi.hoisted(() => ({ useV1MyStaffAssignments: vi.fn() }));

vi.mock('@/hooks/use-v1-my-staff-assignments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-my-staff-assignments')>();
  return { ...actual, useV1MyStaffAssignments: () => mocks.useV1MyStaffAssignments() };
});

const FIELD_OPERATOR = {
  assignmentId: 'a-1',
  tournamentId: 't-1',
  tournamentTitle: '가을 풋살 대회',
  tournamentStatus: 'in_progress',
  tournamentScheduledAt: null,
  role: 'FIELD_OPERATOR' as const,
  version: 0,
  expiresAt: null,
  fieldId: 'f-1',
  fieldName: 'A구장',
  fixtures: [
    {
      fixtureId: 'fx-1',
      round: 'GROUP',
      fixtureNumber: 3,
      legNumber: 1,
      scheduledAt: '2026-08-14T02:00:00.000Z',
      status: 'scheduled',
      fieldId: 'f-1',
      fieldName: 'A구장',
      homeTeamName: '무적FC',
      awayTeamName: '번개FC',
    },
  ],
  fixturesTruncated: false,
};

const DIRECTOR = {
  ...FIELD_OPERATOR,
  assignmentId: 'a-2',
  role: 'TOURNAMENT_DIRECTOR' as const,
  fieldId: null,
  fieldName: null,
  fixtures: [],
};

function resolved(items: unknown[]) {
  mocks.useV1MyStaffAssignments.mockReturnValue({
    isPending: false,
    isError: false,
    data: { items },
    refetch: vi.fn(),
  });
}

describe('MyStaffAssignmentsClient', () => {
  beforeEach(() => {
    mocks.useV1MyStaffAssignments.mockReset();
  });

  it('필드 담당자는 담당 경기 콘솔로 바로 가는 링크를 받는다', () => {
    resolved([FIELD_OPERATOR]);
    render(<MyStaffAssignmentsClient />);

    const link = screen.getByRole('link', { name: /무적FC vs 번개FC/ });
    expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/fixtures/fx-1/operate');
    // 필드 담당자에게 대회 셸(운영 보드) 링크는 주지 않는다 — 열면 403이다.
    expect(screen.queryByRole('link', { name: '운영 보드 열기' })).not.toBeInTheDocument();
  });

  it('디렉터는 종전대로 대회 운영 보드(셸)로 간다', () => {
    resolved([DIRECTOR]);
    render(<MyStaffAssignmentsClient />);

    expect(screen.getByRole('link', { name: '운영 보드 열기' })).toHaveAttribute(
      'href',
      '/tournament-ops/tournaments/t-1/operations',
    );
  });

  it('배정이 없으면 진입 링크 없이 빈 상태만 보여준다', () => {
    resolved([]);
    render(<MyStaffAssignmentsClient />);

    expect(screen.getByText('배정된 대회 운영이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /기록하기|운영 보드 열기/ })).not.toBeInTheDocument();
  });

  it('담당으로 지정된 경기가 아직 없으면 링크 대신 사유를 보여준다', () => {
    resolved([{ ...FIELD_OPERATOR, fixtures: [] }]);
    render(<MyStaffAssignmentsClient />);

    expect(screen.getByText(/담당으로 지정된 경기가 아직 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /기록하기/ })).not.toBeInTheDocument();
  });
});
