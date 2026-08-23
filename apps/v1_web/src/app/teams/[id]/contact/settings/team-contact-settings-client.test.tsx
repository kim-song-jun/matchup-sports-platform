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

    // 네이티브 <input type="radio"> 라 checked 로 단언한다(aria-checked 는 흉내낸 경우에만 필요).
    expect(screen.getByRole('radio', { name: /모집 중일 때만/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /항상 받기/ })).not.toBeChecked();
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

  // 403 을 빈 목록으로 위장하면 운영진이 아닌 사람이 "차단한 팀이 없어요" 를 보고 권한 문제를
  // 데이터 없음으로 오해한다. 실제 차단이 있는데도 없는 줄 알게 되는 게 더 나쁘다.
  it('권한 오류를 빈 상태로 위장하지 않는다', () => {
    useV1TeamContactBlocksMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'PERMISSION_DENIED' },
      refetch: vi.fn(),
    });

    render(<TeamContactSettingsPageClient teamId="team-1" />);

    expect(screen.getByText('차단 목록을 볼 권한이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('차단한 팀이 없어요')).not.toBeInTheDocument();
  });

  it('권한 외 오류는 다시 시도를 제안한다', () => {
    const refetch = vi.fn();
    useV1TeamContactBlocksMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'INTERNAL_ERROR' },
      refetch,
    });

    render(<TeamContactSettingsPageClient teamId="team-1" />);

    expect(screen.getByText('차단 목록을 불러오지 못했어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
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
