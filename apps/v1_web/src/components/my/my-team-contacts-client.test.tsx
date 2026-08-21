import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyTeamContactDetailClient, MyTeamContactsListClient } from './my-team-contacts-client';
import type { V1TeamContact, V1TeamContactStatus } from '@/hooks/use-v1-api';

const {
  routerPush,
  useV1TeamContactMock,
  useV1TeamContactsMock,
  useV1MyTeamsMock,
  useV1TeamMock,
  useV1AcceptTeamContactMock,
  useV1DeclineTeamContactMock,
  useV1WithdrawTeamContactMock,
  useV1ResolveChatRoomMock,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  useV1TeamContactMock: vi.fn(),
  useV1TeamContactsMock: vi.fn(),
  useV1MyTeamsMock: vi.fn(),
  useV1TeamMock: vi.fn(),
  useV1AcceptTeamContactMock: vi.fn(),
  useV1DeclineTeamContactMock: vi.fn(),
  useV1WithdrawTeamContactMock: vi.fn(),
  useV1ResolveChatRoomMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/team-contacts',
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1TeamContact: useV1TeamContactMock,
  useV1TeamContacts: useV1TeamContactsMock,
  useV1MyTeams: useV1MyTeamsMock,
  useV1Team: useV1TeamMock,
  useV1AcceptTeamContact: useV1AcceptTeamContactMock,
  useV1DeclineTeamContact: useV1DeclineTeamContactMock,
  useV1WithdrawTeamContact: useV1WithdrawTeamContactMock,
  useV1ResolveChatRoom: useV1ResolveChatRoomMock,
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const MY_TEAM_ID = 'team-mine';
const OTHER_TEAM_ID = 'team-other';

function makeContact(overrides: Partial<V1TeamContact> = {}): V1TeamContact {
  return {
    id: 'contact-1',
    fromTeamId: OTHER_TEAM_ID,
    toTeamId: MY_TEAM_ID,
    message: '친선 경기 하실래요?',
    status: 'requested',
    declineReason: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function setMyTeams(teams: Array<{ teamId: string; name: string; role: string }>) {
  useV1MyTeamsMock.mockReturnValue({ data: teams, isSuccess: true });
}

describe('MyTeamContactDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMock.mockReturnValue({ data: { name: '상대팀' } });
    useV1AcceptTeamContactMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useV1DeclineTeamContactMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useV1WithdrawTeamContactMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useV1ResolveChatRoomMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('받은 requested 컨택에는 수락·거절 버튼이 보인다', () => {
    setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
    useV1TeamContactMock.mockReturnValue({ data: makeContact({ status: 'requested' }), isError: false });

    render(<MyTeamContactDetailClient contactId="contact-1" />);

    expect(screen.getByRole('button', { name: '수락' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '거절' })).toBeInTheDocument();
  });

  it('보낸 requested 컨택에는 철회만 있고 수락·거절은 없다', () => {
    // 내 팀이 fromTeamId(보낸 쪽) — toTeamId는 상대 팀
    setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
    useV1TeamContactMock.mockReturnValue({
      data: makeContact({ status: 'requested', fromTeamId: MY_TEAM_ID, toTeamId: OTHER_TEAM_ID }),
      isError: false,
    });

    render(<MyTeamContactDetailClient contactId="contact-1" />);

    expect(screen.getByRole('button', { name: '컨택 철회' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
  });

  it('accepted 상태에는 대화 열기 버튼이 보인다', () => {
    setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
    useV1TeamContactMock.mockReturnValue({ data: makeContact({ status: 'accepted' }), isError: false });

    render(<MyTeamContactDetailClient contactId="contact-1" />);

    expect(screen.getByRole('button', { name: '대화 열기' })).toBeInTheDocument();
  });

  it.each<V1TeamContactStatus>(['expired', 'declined', 'withdrawn'])(
    '%s 상태에는 액션 버튼이 없다',
    (status) => {
      // 수락 측(toTeamId=내 팀) 권한이 있어도 종결 상태면 액션이 하나도 안 보여야 한다.
      setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
      useV1TeamContactMock.mockReturnValue({ data: makeContact({ status }), isError: false });

      render(<MyTeamContactDetailClient contactId="contact-1" />);

      expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '컨택 철회' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '대화 열기' })).not.toBeInTheDocument();
    },
  );

  it.each<[V1TeamContactStatus, string]>([
    ['requested', '대기 중'],
    ['accepted', '수락됨'],
    ['declined', '거절됨'],
    ['withdrawn', '철회함'],
    ['expired', '만료됨'],
  ])('상태 %s 는 색이 아니라 텍스트 "%s" 로도 표시된다', (status, label) => {
    setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
    useV1TeamContactMock.mockReturnValue({ data: makeContact({ status }), isError: false });

    render(<MyTeamContactDetailClient contactId="contact-1" />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('MyTeamContactsListClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMock.mockReturnValue({ data: { name: '상대팀' } });
  });

  it('받은 컨택이 없으면 빈 상태 안내를 보여준다', () => {
    setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
    useV1TeamContactsMock.mockReturnValue({
      data: { items: [], pageInfo: { nextCursor: null, hasNext: false } },
      isError: false,
    });

    render(<MyTeamContactsListClient />);

    expect(screen.getByText('아직 받은 컨택이 없어요')).toBeInTheDocument();
  });

  // 로딩 분기가 없으면 data 가 undefined 인 동안 items 가 [] 라서
  // "아직 받은 컨택이 없어요" 가 먼저 떴다가 목록으로 바뀐다(진입·탭전환마다 깜빡임).
  it('목록을 불러오는 동안에는 빈 상태 대신 로딩 안내를 보여준다', () => {
    setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
    useV1TeamContactsMock.mockReturnValue({ data: undefined, isError: false, isLoading: true });

    render(<MyTeamContactsListClient />);

    expect(screen.getByText('컨택 목록을 불러오는 중이에요.')).toBeInTheDocument();
    expect(screen.queryByText('아직 받은 컨택이 없어요')).not.toBeInTheDocument();
  });

  it('운영 권한 팀이 2개 이상이면 팀 선택 UI 가 보인다', () => {
    setMyTeams([
      { teamId: 'team-a', name: 'A팀', role: 'owner' },
      { teamId: 'team-b', name: 'B팀', role: 'manager' },
    ]);
    useV1TeamContactsMock.mockReturnValue({ data: undefined, isError: false });

    render(<MyTeamContactsListClient />);

    expect(screen.getByLabelText('팀 선택')).toBeInTheDocument();
  });
});
