import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamContactSettingsPageClient } from './team-contact-settings-client';

const {
  useV1TeamDetailMock,
  useV1TeamContactBlocksMock,
  useV1UpdateContactPolicyMock,
  useV1RemoveTeamContactBlockMock,
  updatePolicyMutate,
  removeBlockMutate,
} = vi.hoisted(() => ({
  useV1TeamDetailMock: vi.fn(),
  useV1TeamContactBlocksMock: vi.fn(),
  useV1UpdateContactPolicyMock: vi.fn(),
  useV1RemoveTeamContactBlockMock: vi.fn(),
  updatePolicyMutate: vi.fn(),
  removeBlockMutate: vi.fn(),
}));

// AppChrome이 내부적으로 usePathname/useRouter(뒤로가기)와 알림 뱃지 훅을 호출하므로
// team-contact-new-client.test.tsx와 동일하게 next/navigation을 목하고 QueryClientProvider로 감싼다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/contact/settings',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1TeamDetail: useV1TeamDetailMock,
  useV1TeamContactBlocks: useV1TeamContactBlocksMock,
  useV1UpdateContactPolicy: useV1UpdateContactPolicyMock,
  useV1RemoveTeamContactBlock: useV1RemoveTeamContactBlockMock,
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TeamContactSettingsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamDetailMock.mockReturnValue({ data: { name: '우리 팀', contactPolicy: 'open' }, isLoading: false });
    useV1TeamContactBlocksMock.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    useV1UpdateContactPolicyMock.mockReturnValue({ mutate: updatePolicyMutate, isPending: false });
    useV1RemoveTeamContactBlockMock.mockReturnValue({ mutate: removeBlockMutate, isPending: false });
  });

  it('현재 정책이 선택된 상태로 렌더된다', () => {
    useV1TeamDetailMock.mockReturnValue({ data: { name: '우리 팀', contactPolicy: 'recruiting_only' }, isLoading: false });

    render(<TeamContactSettingsPageClient teamId="team-1" />);

    const selected = screen.getByRole('radio', { name: /모집 중일 때만/ });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    const notSelected = screen.getByRole('radio', { name: /항상 받기/ });
    expect(notSelected).toHaveAttribute('aria-checked', 'false');
  });

  it('다른 정책을 고르면 mutation 이 그 값으로 호출된다', () => {
    useV1TeamDetailMock.mockReturnValue({ data: { name: '우리 팀', contactPolicy: 'open' }, isLoading: false });

    render(<TeamContactSettingsPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('radio', { name: /받지 않기/ }));

    expect(updatePolicyMutate).toHaveBeenCalledTimes(1);
    expect(updatePolicyMutate).toHaveBeenCalledWith(
      { contactPolicy: 'closed' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('차단 목록이 비었을 때 빈 상태가 보인다', () => {
    useV1TeamContactBlocksMock.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });

    render(<TeamContactSettingsPageClient teamId="team-1" />);

    expect(screen.getByText('차단한 팀이 없어요')).toBeInTheDocument();
  });

  it('해제 버튼이 blockedTeamId 로 mutation 을 부른다', () => {
    useV1TeamContactBlocksMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'block-1',
            teamId: 'team-1',
            blockedTeamId: 'team-blocked-1',
            createdByUserId: 'user-1',
            reason: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            blockedTeam: { id: 'team-blocked-1', name: '상대팀' },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<TeamContactSettingsPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: '차단 해제' }));

    expect(removeBlockMutate).toHaveBeenCalledTimes(1);
    expect(removeBlockMutate).toHaveBeenCalledWith('team-blocked-1', expect.objectContaining({ onError: expect.any(Function) }));
  });
});
