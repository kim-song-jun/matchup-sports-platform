import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyJoinApplicationsPageClient } from './my-api-clients';

const apiMocks = vi.hoisted(() => ({
  useV1MyJoinApplications: vi.fn(),
  useV1WithdrawMyJoinApplication: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

// 확인 모달은 항상 승인 — 이 테스트의 관심사는 취소 확정 이후의 pending 추적이다.
vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true), ConfirmModal: null }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/join-applications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function application(id: string, teamId: string, teamName: string) {
  return {
    applicationId: id,
    teamId,
    status: 'requested',
    message: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    reviewedAt: null,
    withdrawnAt: null,
    team: { teamId, name: teamName, sportId: 'sport-1', logoUrl: null, introductionPreview: null },
  };
}

describe('MyJoinApplicationsPageClient — 동시 취소 시 아이템별 pending 추적', () => {
  it('두 건을 연달아 취소해도 먼저 시작한 카드의 pending이 풀리지 않는다', async () => {
    apiMocks.useV1MyJoinApplications.mockReturnValue({
      data: {
        items: [
          application('app-a', 'team-a', '성수 러너스 FC'),
          application('app-b', 'team-b', '마포 농구 클럽'),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    // onSettled를 부르지 않아 두 요청 모두 "진행 중"인 상태를 만든다.
    const mutate = vi.fn();
    apiMocks.useV1WithdrawMyJoinApplication.mockReturnValue({ mutate, isPending: true });

    render(<MyJoinApplicationsPageClient />);

    const buttonA = screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' });
    await act(async () => {
      fireEvent.click(buttonA);
    });
    expect(screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' })).toBeDisabled();

    const buttonB = screen.getByRole('button', { name: '마포 농구 클럽 가입 신청 취소' });
    await act(async () => {
      fireEvent.click(buttonB);
    });

    // 단일 id 추적이면 B가 A의 pending을 덮어써 A가 다시 눌리게 된다(중복 withdraw 요청).
    expect(screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '마포 농구 클럽 가입 신청 취소' })).toBeDisabled();
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('취소가 끝난 건만 pending에서 빠지고 나머지는 유지된다', async () => {
    apiMocks.useV1MyJoinApplications.mockReturnValue({
      data: {
        items: [
          application('app-a', 'team-a', '성수 러너스 FC'),
          application('app-b', 'team-b', '마포 농구 클럽'),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    // A만 즉시 완료(onSettled 호출), B는 진행 중으로 남긴다.
    const mutate = vi.fn((variables, options) => {
      if (variables.applicationId === 'app-a') options?.onSettled?.();
    });
    apiMocks.useV1WithdrawMyJoinApplication.mockReturnValue({ mutate, isPending: false });

    render(<MyJoinApplicationsPageClient />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '마포 농구 클럽 가입 신청 취소' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' }));
    });

    expect(screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '마포 농구 클럽 가입 신청 취소' })).toBeDisabled();
  });
});
