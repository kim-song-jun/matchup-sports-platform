import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { TeamContactNewPageClient } from './team-contact-new-client';

const {
  routerPush,
  createContactMutate,
  useV1TeamDetailMock,
  useV1MyTeamsMock,
  useV1CreateTeamContactMock,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  createContactMutate: vi.fn(),
  useV1TeamDetailMock: vi.fn(),
  useV1MyTeamsMock: vi.fn(),
  useV1CreateTeamContactMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-target/contact/new',
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1TeamDetail: useV1TeamDetailMock,
  useV1MyTeams: useV1MyTeamsMock,
  useV1CreateTeamContact: useV1CreateTeamContactMock,
}));

function setOperatorTeams(teams: Array<{ teamId: string; name: string; role: string }>) {
  useV1MyTeamsMock.mockReturnValue({ data: teams, isSuccess: true });
}

// AppChrome이 내부적으로 알림 뱃지용 실제 훅(useV1NotificationUnreadSummary)을 호출하므로
// QueryClientProvider가 필요하다(teams-client.test.tsx의 render 헬퍼와 동일 패턴).
function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TeamContactNewPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamDetailMock.mockReturnValue({ data: { name: '상대팀' } });
    useV1CreateTeamContactMock.mockReturnValue({ mutate: createContactMutate, isPending: false });
    setOperatorTeams([{ teamId: 'team-mine', name: '우리 팀', role: 'owner' }]);
  });

  it('메시지가 비어 있으면 보내기 버튼이 disabled', () => {
    render(<TeamContactNewPageClient teamId="team-target" />);

    expect(screen.getByRole('button', { name: '컨택 보내기' })).toBeDisabled();
  });

  it('메시지를 입력하면 enabled 이고 남은 글자 수가 보인다', () => {
    render(<TeamContactNewPageClient teamId="team-target" />);

    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: 'hi' } });

    expect(screen.getByRole('button', { name: '컨택 보내기' })).not.toBeDisabled();
    expect(screen.getByText('2 / 500자')).toBeInTheDocument();
  });

  it('운영 권한 팀이 1개면 발신 팀 선택 UI 가 없다', () => {
    render(<TeamContactNewPageClient teamId="team-target" />);

    expect(screen.queryByLabelText('보내는 팀')).not.toBeInTheDocument();
  });

  it('운영 권한 팀이 2개 이상이면 발신 팀 선택 UI 가 보인다', () => {
    setOperatorTeams([
      { teamId: 'team-a', name: 'A팀', role: 'owner' },
      { teamId: 'team-b', name: 'B팀', role: 'manager' },
    ]);

    render(<TeamContactNewPageClient teamId="team-target" />);

    expect(screen.getByLabelText('보내는 팀')).toBeInTheDocument();
  });

  it('보내기에 성공하면 응답의 route(새 채팅방)로 이동한다', () => {
    createContactMutate.mockImplementation((_vars, opts) => {
      opts.onSuccess({ id: 'contact-1', chatRoomId: 'room-1', route: '/chat/room-1' });
    });

    render(<TeamContactNewPageClient teamId="team-target" />);
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: '컨택 보내기' }));

    expect(routerPush).toHaveBeenCalledWith('/chat/room-1');
  });

  it('TEAM_CONTACT_ALREADY_ACTIVE 에러면 기존 컨택 채팅방으로 가는 링크가 보인다', () => {
    createContactMutate.mockImplementation((_vars, opts) => {
      opts.onError(
        new V1ApiError({
          status: 'error',
          statusCode: 409,
          code: 'TEAM_CONTACT_ALREADY_ACTIVE',
          message: '이미 진행 중인 컨택이 있어요.',
          details: { existingContactId: 'contact-123', existingChatRoomId: 'room-123' },
          timestamp: new Date().toISOString(),
        }),
      );
    });

    render(<TeamContactNewPageClient teamId="team-target" />);
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: '컨택 보내기' }));

    const link = screen.getByRole('link', { name: '진행 중인 컨택 보기' });
    expect(link).toHaveAttribute('href', '/chat/room-123');
  });

  it('TEAM_CONTACT_DAILY_LIMIT_EXCEEDED 등 다른 에러면 링크가 없다', () => {
    createContactMutate.mockImplementation((_vars, opts) => {
      opts.onError(
        new V1ApiError({
          status: 'error',
          statusCode: 429,
          code: 'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED',
          message: '오늘 컨택을 모두 사용했어요.',
          timestamp: new Date().toISOString(),
        }),
      );
    });

    render(<TeamContactNewPageClient teamId="team-target" />);
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: '컨택 보내기' }));

    expect(screen.getByText('오늘 보낼 수 있는 컨택을 모두 사용했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '진행 중인 컨택 보기' })).not.toBeInTheDocument();
  });
});
