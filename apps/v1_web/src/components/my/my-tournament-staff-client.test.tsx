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

  it('대회별로 묶인 배정을 역할·필드와 함께 보여주고 운영 화면으로 링크한다', () => {
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: {
        items: [
          {
            tournamentId: 't-1',
            tournamentTitle: '성수 5인제 컵',
            tournamentStatus: 'in_progress',
            assignments: [
              { id: 'a-1', role: 'FIELD_OPERATOR', fieldId: 'f-1', fieldName: 'A구장', version: 0, expiresAt: null },
              { id: 'a-2', role: 'FIELD_OPERATOR', fieldId: 'f-2', fieldName: 'B구장', version: 0, expiresAt: null },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<MyTournamentStaffPageClient />);

    expect(screen.getByText('성수 5인제 컵')).toBeInTheDocument();
    expect(screen.getByText('필드 담당자 · A구장 / 필드 담당자 · B구장')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    const link = screen.getByText('성수 5인제 컵').closest('a');
    expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/operations');
  });
});
