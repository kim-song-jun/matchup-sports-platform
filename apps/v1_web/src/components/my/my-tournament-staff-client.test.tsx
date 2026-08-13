import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyTournamentStaffPageClient } from './my-tournament-staff-client';

const apiMocks = vi.hoisted(() => ({
  useV1MyTournamentStaffAssignments: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/tournament-staff',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('MyTournamentStaffPageClient', () => {
  it('배정이 없으면 빈 상태를 보여준다', () => {
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
    });

    render(<MyTournamentStaffPageClient />);

    expect(screen.getByText('담당 중인 대회가 없어요')).toBeInTheDocument();
  });

  it('조회 실패 시 에러+재시도 UI를 보여준다', () => {
    const refetch = vi.fn();
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<MyTournamentStaffPageClient />);

    expect(screen.getByText('담당 대회 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  function mockGroup(assignments: unknown[]) {
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: {
        items: [
          {
            tournamentId: 't-1',
            tournamentTitle: '성수 5인제 컵',
            tournamentStatus: 'in_progress',
            assignments,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
  }

  it('대회별로 묶인 배정을 역할·필드와 함께 보여준다', () => {
    mockGroup([
      { id: 'a-1', role: 'FIELD_OPERATOR', fieldId: 'f-1', fieldName: 'A구장', fixtureIds: [], version: 0, expiresAt: null },
      { id: 'a-2', role: 'FIELD_OPERATOR', fieldId: 'f-2', fieldName: 'B구장', fixtureIds: [], version: 0, expiresAt: null },
    ]);

    render(<MyTournamentStaffPageClient />);

    expect(screen.getByText('성수 5인제 컵')).toBeInTheDocument();
    expect(screen.getByText('필드 담당자 · A구장 / 필드 담당자 · B구장')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
  });

  /**
   * 이 describe 가 고정하는 계약이 예전에는 정반대였다 — 필드 담당자 카드도 운영 보드
   * (`/operations`)로 링크한다고 못박혀 있었고, 그게 alpha 에서 403 막다른 길을 만들었다.
   * 서버 가드는 `/operations` 라우트에서 스코프 있는 배정을 예외 없이 거부하므로, 이 링크가
   * 역할에 따라 갈리는 것이 정상이다.
   */
  describe('진입 목적지는 역할에 따라 갈린다', () => {
    const hrefOf = () => screen.getByText('성수 5인제 컵').closest('a');

    it('필드 담당자만 있으면 담당 경기 목록으로 보낸다 (운영 보드는 403이다)', () => {
      mockGroup([
        { id: 'a-1', role: 'FIELD_OPERATOR', fieldId: 'f-1', fieldName: 'A구장', fixtureIds: [], version: 0, expiresAt: null },
      ]);

      render(<MyTournamentStaffPageClient />);

      expect(hrefOf()).toHaveAttribute('href', '/my/tournament-staff/t-1');
    });

    it('대회 디렉터는 운영 보드로 보낸다', () => {
      mockGroup([
        { id: 'a-1', role: 'TOURNAMENT_DIRECTOR', fieldId: null, fieldName: null, fixtureIds: [], version: 0, expiresAt: null },
      ]);

      render(<MyTournamentStaffPageClient />);

      expect(hrefOf()).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/operations');
    });

    it('셸 역할이 하나라도 있으면 운영 보드로 보낸다', () => {
      mockGroup([
        { id: 'a-1', role: 'FIELD_OPERATOR', fieldId: 'f-1', fieldName: 'A구장', fixtureIds: [], version: 0, expiresAt: null },
        { id: 'a-2', role: 'SUPPORT_READONLY', fieldId: null, fieldName: null, fixtureIds: [], version: 0, expiresAt: null },
      ]);

      render(<MyTournamentStaffPageClient />);

      expect(hrefOf()).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/operations');
    });
  });
});
