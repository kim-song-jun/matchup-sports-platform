import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyInvitationsPageClient } from './my-api-clients';

const apiMocks = vi.hoisted(() => ({
  useV1ReceivedInvitations: vi.fn(),
  useV1AcceptTeamInvitation: vi.fn(),
  useV1DeclineTeamInvitation: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true), ConfirmModal: null }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/invitations',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function invitation(id: string, teamId: string, teamName: string) {
  return {
    invitationId: id,
    teamId,
    status: 'pending',
    message: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    team: { teamId, name: teamName, sportId: 'sport-1', logoUrl: null, introductionPreview: null },
    invitedBy: { userId: 'user-1', displayName: '김도윤', profileImageUrl: null },
  };
}

describe('MyInvitationsPageClient — 동시 처리 시 아이템별 pending 추적', () => {
  it('두 초대를 연달아 거절해도 먼저 시작한 카드의 pending이 풀리지 않는다', async () => {
    apiMocks.useV1ReceivedInvitations.mockReturnValue({
      data: {
        items: [
          invitation('inv-a', 'team-a', '성수 러너스 FC'),
          invitation('inv-b', 'team-b', '마포 농구 클럽'),
        ],
      },
      isError: false,
      refetch: vi.fn(),
    });
    apiMocks.useV1AcceptTeamInvitation.mockReturnValue({ mutate: vi.fn() });
    // onSettled를 부르지 않아 두 요청 모두 "진행 중"인 상태를 만든다.
    const decline = vi.fn();
    apiMocks.useV1DeclineTeamInvitation.mockReturnValue({ mutate: decline });

    render(<MyInvitationsPageClient />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '성수 러너스 FC 초대 거절' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '마포 농구 클럽 초대 거절' }));
    });

    // 단일 id 추적이면 B가 A의 pending을 덮어써 A가 다시 눌리게 된다(중복 거절 요청).
    expect(screen.getByRole('button', { name: '성수 러너스 FC 초대 수락' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '마포 농구 클럽 초대 수락' })).toBeDisabled();
    expect(decline).toHaveBeenCalledTimes(2);
  });

  it('처리가 끝난 초대만 pending에서 빠진다', async () => {
    apiMocks.useV1ReceivedInvitations.mockReturnValue({
      data: {
        items: [
          invitation('inv-a', 'team-a', '성수 러너스 FC'),
          invitation('inv-b', 'team-b', '마포 농구 클럽'),
        ],
      },
      isError: false,
      refetch: vi.fn(),
    });
    apiMocks.useV1AcceptTeamInvitation.mockReturnValue({ mutate: vi.fn() });
    // A만 즉시 완료, B는 진행 중으로 남긴다.
    const decline = vi.fn((variables, options) => {
      if (variables.invitationId === 'inv-a') options?.onSettled?.();
    });
    apiMocks.useV1DeclineTeamInvitation.mockReturnValue({ mutate: decline });

    render(<MyInvitationsPageClient />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '마포 농구 클럽 초대 거절' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '성수 러너스 FC 초대 거절' }));
    });

    expect(screen.getByRole('button', { name: '성수 러너스 FC 초대 수락' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '마포 농구 클럽 초대 수락' })).toBeDisabled();
  });
});
