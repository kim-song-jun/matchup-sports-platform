import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  useV1CreateInquiryMock,
  useV1CreateTeamContactBlockMock,
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
  useV1CreateInquiryMock: vi.fn(),
  useV1CreateTeamContactBlockMock: vi.fn(),
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
  useV1CreateInquiry: useV1CreateInquiryMock,
  useV1CreateTeamContactBlock: useV1CreateTeamContactBlockMock,
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
    useV1CreateInquiryMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useV1CreateTeamContactBlockMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
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

  // 차단을 *거는* 진입점은 여기 하나뿐이다(해제는 팀 설정 화면). 이 UI 가 사라지면 백엔드·훅·
  // 통합테스트가 전부 온전해도 사용자는 앱에서 차단을 걸 방법이 없어진다 — 최종 리뷰에서
  // 실제로 그 상태였던 것을 잡았다.
  // 컨택 만료 창은 7일이다. 시간 단위만 쓰면 "167시간 58분 후 만료돼요" 처럼 사람이 못 읽는
  // 숫자가 나온다 — alpha 시각 검증에서 실제로 그렇게 보였다.
  describe('만료 남은 시간 표기', () => {
    function renderWithExpiry(msFromNow: number) {
      setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
      useV1TeamContactMock.mockReturnValue({
        data: makeContact({ expiresAt: new Date(Date.now() + msFromNow).toISOString() }),
        isError: false,
      });
      return render(<MyTeamContactDetailClient contactId="contact-1" />);
    }

    it('하루 이상 남으면 일 단위로 접는다', () => {
      // 6일 23시간 58분 — 예전 구현이 "167시간 58분 후" 로 쏟아내던 값이다.
      // 경계에 딱 맞추면 실행 중 흐른 ms 때문에 내림이 한 단위 떨어져 flaky 해진다 — 30초 여유.
      renderWithExpiry(167 * 3_600_000 + 58 * 60_000 + 30_000);

      expect(screen.getByText('6일 23시간 후 만료돼요')).toBeInTheDocument();
    });

    it('일 단위가 딱 떨어지면 시간을 붙이지 않는다', () => {
      renderWithExpiry(2 * 24 * 3_600_000 + 30_000);

      expect(screen.getByText('2일 후 만료돼요')).toBeInTheDocument();
    });

    it('하루 미만이면 시간·분으로 보여준다', () => {
      renderWithExpiry(3 * 3_600_000 + 25 * 60_000 + 30_000);

      expect(screen.getByText('3시간 25분 후 만료돼요')).toBeInTheDocument();
    });

    it('이미 지났으면 곧 만료된다고 알린다', () => {
      renderWithExpiry(-1000);

      expect(screen.getByText('곧 만료돼요')).toBeInTheDocument();
    });
  });

  describe('차단하기', () => {
    function renderInbound() {
      setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
      useV1TeamContactMock.mockReturnValue({ data: makeContact(), isError: false });
      return render(<MyTeamContactDetailClient contactId="contact-1" />);
    }

    it('차단하기를 누르면 확인 단계가 뜬다', async () => {
      const user = userEvent.setup();
      renderInbound();

      await user.click(screen.getByRole('button', { name: '차단하기' }));

      expect(screen.getByRole('group', { name: '팀 차단 확인' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    });

    it('확인하면 상대 팀 id 로 mutation 이 호출된다', async () => {
      const mutate = vi.fn();
      useV1CreateTeamContactBlockMock.mockReturnValue({ mutate, isPending: false });
      const user = userEvent.setup();
      renderInbound();

      await user.click(screen.getByRole('button', { name: '차단하기' }));
      const confirm = screen.getByRole('group', { name: '팀 차단 확인' });
      await user.click(within(confirm).getByRole('button', { name: '차단하기' }));

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate).toHaveBeenCalledWith(
        { blockedTeamId: OTHER_TEAM_ID },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('한 번 누른 것만으로는 차단되지 않는다', async () => {
      const mutate = vi.fn();
      useV1CreateTeamContactBlockMock.mockReturnValue({ mutate, isPending: false });
      const user = userEvent.setup();
      renderInbound();

      await user.click(screen.getByRole('button', { name: '차단하기' }));

      expect(mutate).not.toHaveBeenCalled();
    });

    it('양쪽 팀을 모두 운영하면 차단 버튼이 보이지 않는다', () => {
      setMyTeams([
        { teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' },
        { teamId: OTHER_TEAM_ID, name: '상대팀', role: 'owner' },
      ]);
      useV1TeamContactMock.mockReturnValue({ data: makeContact(), isError: false });
      render(<MyTeamContactDetailClient contactId="contact-1" />);

      expect(screen.queryByRole('button', { name: '차단하기' })).not.toBeInTheDocument();
    });
  });

  describe('신고하기', () => {
    // 만료된 컨택으로 렌더한다 — 신고 버튼은 컨택 상태와 무관하게 항상 노출돼야 한다
    // (거절·만료 이후에 신고할 이유가 생기는 경우가 오히려 많다).
    function renderExpiredContact() {
      setMyTeams([{ teamId: MY_TEAM_ID, name: '우리 팀', role: 'owner' }]);
      useV1TeamContactMock.mockReturnValue({ data: makeContact({ status: 'expired' }), isError: false });
      return render(<MyTeamContactDetailClient contactId="contact-1" />);
    }

    it('신고 버튼이 보이고 누르면 사유 선택이 뜬다', async () => {
      const user = userEvent.setup();
      renderExpiredContact();

      await user.click(screen.getByRole('button', { name: '신고하기' }));

      expect(screen.getByRole('dialog', { name: '컨택 신고하기' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '스팸·광고' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '괴롭힘·욕설' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '사칭·허위 팀' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '부적절한 내용' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '기타' })).toBeInTheDocument();
    });

    it('사유를 고르고 보내면 mutation 이 reportReason 을 포함해 호출된다', async () => {
      const user = userEvent.setup();
      const mutate = vi.fn();
      useV1CreateInquiryMock.mockReturnValue({ mutate, isPending: false });
      renderExpiredContact();

      await user.click(screen.getByRole('button', { name: '신고하기' }));
      await user.click(screen.getByRole('radio', { name: '부적절한 내용' }));
      await user.click(screen.getByRole('button', { name: '신고 접수' }));

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'report',
          relatedType: 'team_contact',
          relatedId: 'contact-1',
          reportReason: 'inappropriate',
        }),
        expect.anything(),
      );
    });

    // 포커스 트랩은 activeElement 가 다이얼로그의 첫/마지막 요소일 때만 개입한다. 열릴 때
    // 포커스를 안으로 옮기지 않으면 포커스가 배경에 남아 트랩이 한 번도 발동하지 않고,
    // aria-modal="true" 가 실제로는 배경을 격리하지 못한다.
    it('열리면 포커스가 다이얼로그 안으로 들어온다', async () => {
      const user = userEvent.setup();
      renderExpiredContact();

      await user.click(screen.getByRole('button', { name: '신고하기' }));
      const dialog = screen.getByRole('dialog', { name: '컨택 신고하기' });

      await waitFor(() => {
        expect(dialog.contains(document.activeElement)).toBe(true);
      });
    });

    it('사유를 안 고르면 보내기가 비활성이다', async () => {
      const user = userEvent.setup();
      renderExpiredContact();

      await user.click(screen.getByRole('button', { name: '신고하기' }));

      expect(screen.getByRole('button', { name: '신고 접수' })).toBeDisabled();
    });
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
