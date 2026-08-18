import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TEAM_LOGO_PRESETS } from '@/lib/team-logo-presets';
import { TeamMembersPageClient } from './teams-client';
import { TeamDetailPageView, TeamFormPageView, TeamListPageView, TeamMembersPageView } from './teams-page';
import { getTeamDetailViewModel, getTeamListViewModel, getTeamMembersViewModel } from './teams.view-model';
import type { TeamDetailViewModel, TeamFormViewModel, TeamListViewModel, TeamMembersViewModel } from './teams.types';

const teamApiMocks = vi.hoisted(() => ({
  useV1TeamDetail: vi.fn(),
  useV1TeamMembers: vi.fn(),
  useV1TeamJoinApplications: vi.fn(),
  useV1ChangeTeamMembershipRole: vi.fn(),
  useV1RemoveTeamMembership: vi.fn(),
  useV1ApproveTeamJoinApplication: vi.fn(),
  useV1RejectTeamJoinApplication: vi.fn(),
  useV1SendTeamInvitation: vi.fn(),
  useV1CancelTeamInvitation: vi.fn(),
  useV1TeamInvitations: vi.fn(),
  useV1LeaveTeam: vi.fn(),
  // 기본 반환값이 없으면 이 훅을 신경 쓰지 않는 기존 테스트들이 전부 undefined.data 로 깨진다.
  // 반환 타입을 명시하지 않으면 `{ data: undefined }` 로 좁혀져 mockReturnValue 가 막힌다.
  useV1ReceivedReviewSummary: vi.fn((): { data: unknown } => ({ data: undefined })),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...teamApiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/edit',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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

function mockOwnerMembersPage(activeOwnerCount: number) {
  const leaveMutate = vi.fn();
  teamApiMocks.useV1TeamDetail.mockReturnValue({
    data: {
      name: '성수 풋살 크루',
      canViewMembers: true,
      viewer: { role: 'owner', membershipId: 'membership-owner' },
    },
    isError: false,
  });
  teamApiMocks.useV1TeamMembers.mockReturnValue({
    data: {
      items: [
        {
          membershipId: 'membership-owner',
          userId: 'user-owner',
          displayName: '김도윤',
          realName: null,
          phone: null,
          birthDate: null,
          profileImageUrl: null,
          role: 'owner',
          status: 'active',
          joinedAt: '2026-01-01T00:00:00.000Z',
          canChangeRole: false,
          canRemove: false,
        },
      ],
      summary: { ownerCount: activeOwnerCount, managerCount: 0, memberCount: activeOwnerCount },
      viewerRole: 'owner',
      pageInfo: { nextCursor: null, hasNext: false },
    },
    isError: false,
  });
  teamApiMocks.useV1TeamJoinApplications.mockReturnValue({ data: { items: [] } });
  teamApiMocks.useV1TeamInvitations.mockReturnValue({ data: { items: [] }, isLoading: false });
  teamApiMocks.useV1ChangeTeamMembershipRole.mockReturnValue({ isPending: false, mutate: vi.fn() });
  teamApiMocks.useV1RemoveTeamMembership.mockReturnValue({ isPending: false, mutate: vi.fn() });
  teamApiMocks.useV1ApproveTeamJoinApplication.mockReturnValue({ isPending: false, mutate: vi.fn() });
  teamApiMocks.useV1RejectTeamJoinApplication.mockReturnValue({ isPending: false, mutate: vi.fn() });
  teamApiMocks.useV1SendTeamInvitation.mockReturnValue({ isPending: false, mutate: vi.fn() });
  teamApiMocks.useV1CancelTeamInvitation.mockReturnValue({ isPending: false, mutate: vi.fn() });
  teamApiMocks.useV1LeaveTeam.mockReturnValue({ isPending: false, mutate: leaveMutate });
  return leaveMutate;
}

describe('TeamListPageView', () => {
  it('does not render sample team cards while the live team list is loading', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      listLoading: true,
      teams: [],
      summary: {
        ...base.summary,
        total: 0,
        recruiting: 0,
        nearby: undefined,
      },
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByLabelText('팀 목록 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.queryByText(/내 주변\s+\d+/)).not.toBeInTheDocument();
  });

  it('renders team list cards from the explicit team fields without stale recruiting copy', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      summary: {
        ...base.summary,
        total: 1,
        recruiting: 1,
        nearby: undefined,
      },
      teams: [
        {
          id: 'team-live-1',
          name: '라이브 팀',
          logo: '라',
          sport: '풋살',
          sports: ['풋살'],
          region: '서울 성동구',
          members: 7,
          capacity: 0,
          status: 'open',
          statusLabel: '가입 신청 가능',
          tags: ['레벨 미설정'],
          genderRule: '성별 무관',
          ownerName: '김도윤',
          managerName: '박서준',
          intro: '짧은 소개',
          next: '수 · 주 1회 · 자유 참여/정기 모임 · ㅇㅇ',
        },
      ],
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByText('라이브 팀')).toBeInTheDocument();
    expect(screen.getByText('가입 신청 가능')).toBeInTheDocument();
    expect(screen.getByText('레벨 미설정')).toBeInTheDocument();
    expect(screen.getByText('짧은 소개')).toBeInTheDocument();
    expect(screen.getByText('팀장 김도윤 · 감독 박서준')).toBeInTheDocument();
    expect(screen.queryByText('가입 신청은 운영진 승인 후 확정돼요.')).not.toBeInTheDocument();
    expect(screen.getByText('수 · 주 1회 · 자유 참여/정기 모임 · ㅇㅇ')).toBeInTheDocument();
    expect(screen.queryByText('자세히 보기 ›')).not.toBeInTheDocument();
    expect(screen.queryByText('팀 보기 ›')).not.toBeInTheDocument();
    expect(screen.queryByText('알림받기')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 21:00 정기전')).not.toBeInTheDocument();
  });

  it('shows only the owner line and no manager text when the team has no manager', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      summary: {
        ...base.summary,
        total: 1,
        recruiting: 1,
        nearby: undefined,
      },
      teams: [
        {
          id: 'team-live-2',
          name: '마포 농구 클럽',
          logo: '마',
          sport: '농구',
          sports: ['농구'],
          region: '서울 마포구',
          members: 5,
          capacity: 10,
          status: 'open',
          statusLabel: '가입 신청 가능',
          tags: ['레벨 미설정'],
          genderRule: '성별 무관',
          ownerName: '이하나',
          managerName: null,
          intro: '',
          next: '',
        },
      ],
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByText('팀장 이하나')).toBeInTheDocument();
    expect(screen.queryByText(/감독/)).not.toBeInTheDocument();
  });
});

describe('TeamDetailPageView', () => {
  it('preserves line breaks in the team introduction', () => {
    const introduction = '첫 번째 소개\n두 번째 소개';
    const model: TeamDetailViewModel = {
      team: {
        id: 'team-live-1',
        name: '라이브 팀',
        logo: '라',
        logoUrl: null,
        coverImageUrl: null,
        sport: '풋살',
        sports: ['풋살'],
        region: '서울 성동구',
        members: 7,
        capacity: 12,
        status: 'open',
        statusLabel: '가입 신청 가능',
        tags: [],
        genderRule: '성별 무관',
        intro: introduction,
        next: '',
        description: introduction,
        activity: '',
        condition: '',
        schedule: '',
        city: '서울',
        county: '성동구',
        level: '초보-중수',
        membersList: [],
        memberAccess: {
          canView: false,
          enabled: false,
          message: '멤버 목록 비공개',
          moreCount: 0,
        },
      },
      mode: 'default',
    };

    render(<TeamDetailPageView model={model} />);

    const introNodes = screen.getAllByText((_, node) => node?.textContent === introduction);
    expect(introNodes).toHaveLength(2);
    introNodes.forEach((node) => {
      expect(node).toHaveStyle({ whiteSpace: 'pre-line' });
    });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: '라이브 팀' })).toBeInTheDocument();
  });

  it('releases the hero action busy lock after a synchronous throw so the CTA stays usable', async () => {
    const onCta = vi.fn(() => {
      throw new Error('sync failure');
    });
    const model: TeamDetailViewModel = {
      team: {
        id: 'team-live-1',
        name: '라이브 팀',
        logo: '라',
        logoUrl: null,
        coverImageUrl: null,
        sport: '풋살',
        sports: ['풋살'],
        region: '서울 성동구',
        members: 7,
        capacity: 12,
        status: 'open',
        statusLabel: '가입 신청 가능',
        tags: [],
        genderRule: '성별 무관',
        intro: '',
        next: '',
        description: '',
        activity: '',
        condition: '',
        schedule: '',
        city: '서울',
        county: '성동구',
        level: '초보-중수',
        membersList: [],
        memberAccess: {
          canView: false,
          enabled: false,
          message: '멤버 목록 비공개',
          moreCount: 0,
        },
      },
      mode: 'default',
      onCta,
    };

    render(<TeamDetailPageView model={model} />);

    const [ctaButton] = screen.getAllByRole('button', { name: '가입 신청' });

    // Promise.resolve(action())은 action()을 동기 평가하므로 sync throw가 .catch/.finally를
    // 건너뛰고 heroActionBusyRef를 영구 잠금 상태로 남긴다 — 이 테스트는 그 회귀를 잡는다.
    fireEvent.click(ctaButton);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(ctaButton);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onCta).toHaveBeenCalledTimes(2);
  });

  it('승인 대기 상태에서는 무엇을 기다리는지 알려주는 안내가 화면에 남는다', () => {
    const model: TeamDetailViewModel = {
      ...getTeamDetailViewModel('pending'),
      ctaLabel: '신청 취소',
      joinRequest: { requestedAtLabel: '2026. 07. 20. 신청' },
    };

    render(<TeamDetailPageView model={model} />);

    // 토스트는 사라지지만 이 안내는 남아야 한다 — 모바일/데스크톱 레이아웃 양쪽에 렌더된다.
    expect(screen.getAllByText('승인 대기 중').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('관리자가 가입 신청을 확인하고 있어요. 승인되면 알림으로 알려드릴게요.').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('2026. 07. 20. 신청').length).toBeGreaterThan(0);
  });

  it('가입 신청 가능 상태에서는 승인 대기 안내를 띄우지 않는다', () => {
    render(<TeamDetailPageView model={getTeamDetailViewModel('default')} />);

    expect(screen.queryByText('승인 대기 중')).not.toBeInTheDocument();
  });

  it('팀 전적 링크가 데스크톱 전용이 아니라 모바일 레이아웃에도 렌더된다', () => {
    const model = getTeamDetailViewModel('default');
    render(<TeamDetailPageView model={model} />);

    // 데스크톱(tm-show-desktop)·모바일(tm-hide-desktop) 레이아웃이 jsdom에는
    // 둘 다 DOM에 존재한다(CSS display:none은 렌더 여부와 무관) — 모바일 레이아웃에도
    // 링크가 없으면 이 테스트가 실패해 회귀를 잡는다.
    const links = screen.getAllByRole('link', { name: /^팀 전적/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', `/teams/${model.team.id}/records`);
    });
  });
});

describe('TeamMembersPageView — 보낸 초대 목록', () => {
  function baseModel(overrides: Partial<NonNullable<TeamMembersViewModel['invitations']>>): TeamMembersViewModel {
    const fallback = getTeamMembersViewModel();
    return {
      ...fallback,
      activeTab: 'invitations',
      invitations: {
        form: {
          email: '',
          message: '',
          onEmailChange: vi.fn(),
          onMessageChange: vi.fn(),
          onSubmit: vi.fn(),
          submitting: false,
          error: null,
          successMessage: null,
        },
        items: [],
        listLoading: false,
        listError: false,
        onRetry: vi.fn(),
        ...overrides,
      },
    };
  }

  it('조회 실패 시 빈 목록 대신 에러+재시도 UI를 보여준다', () => {
    const onRetry = vi.fn();
    const model = baseModel({ listError: true, onRetry });

    render(<TeamMembersPageView model={model} />);

    expect(screen.getByText('초대 목록을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.queryByText('보낸 초대가 없어요')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('다시 시도'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('"초대 중" 상태 텍스트에 띄어쓰기가 있고, 취소 처리 중인 아이템만 비활성화된다', () => {
    const onCancelA = vi.fn();
    const onCancelB = vi.fn();
    const model = baseModel({
      items: [
        { invitationId: 'inv-a', displayName: '김도윤', createdAt: '2026-07-01T00:00:00Z', message: null, cancelPending: true, onCancel: onCancelA },
        { invitationId: 'inv-b', displayName: '박서준', createdAt: '2026-07-01T00:00:00Z', message: null, cancelPending: false, onCancel: onCancelB },
      ],
    });

    render(<TeamMembersPageView model={model} />);

    expect(screen.getAllByText('초대 중').length).toBeGreaterThan(0);
    expect(screen.queryByText('초대중')).not.toBeInTheDocument();

    expect(screen.getByText('취소 중…')).toBeInTheDocument();
    const pendingCancelButton = screen.getByRole('button', { name: '김도윤님 초대 취소' });
    expect(pendingCancelButton).toBeDisabled();
    const activeCancelButton = screen.getByRole('button', { name: '박서준님 초대 취소' });
    expect(activeCancelButton).not.toBeDisabled();

    fireEvent.click(activeCancelButton);
    expect(onCancelB).toHaveBeenCalledTimes(1);
    expect(onCancelA).not.toHaveBeenCalled();
  });
});

describe('TeamFormPageView', () => {
  it('renders and updates the team join policy control', () => {
    const onJoinPolicyChange = vi.fn();
    const onFieldChange = vi.fn();
    const model: TeamFormViewModel = {
      mode: 'edit',
      team: {
        name: '성수 풋살 크루',
        logoUrl: null,
        coverImageUrl: null,
        sport: '풋살',
        region: '서울 성동구',
        description: '주 1회 경기하는 팀입니다.',
        sports: ['풋살'],
        city: '서울',
        county: '성동구',
        level: '입문-중수',
        genderRule: '성별 무관',
        activityDays: [],
        activityFrequency: '',
        activityTimeSlots: [],
        activityTypes: [],
        activityMemo: '',
        capacity: 12,
      },
      form: {
        sportId: 'sport-1',
        regionId: 'region-1',
        regions: [{ id: 'region-1', name: '서울 성동구' }],
        sports: [{ id: 'sport-1', name: '풋살' }],
        joinPolicy: 'approval_required',
        membersVisibilityEnabled: true,
        onFieldChange,
        onSportChange: vi.fn(),
        onRegionChange: vi.fn(),
        onJoinPolicyChange,
        onMembersVisibilityChange: vi.fn(),
        onSubmit: vi.fn(),
      },
    };

    render(<TeamFormPageView model={model} />);

    expect(screen.getByText('가입 신청 상태')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가입 신청 가능' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '가입 닫힘' }));

    expect(onJoinPolicyChange).toHaveBeenCalledWith('closed');
    expect(screen.getAllByRole('button', { name: /기본 팀 로고 \d+/ })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: '기본 팀 로고 4' }));
    expect(onFieldChange).toHaveBeenCalledWith('logoUrl', TEAM_LOGO_PRESETS[3]);
  });
});

describe('TeamMembersPageView — 팀 나가기 (self-leave)', () => {
  it('본인 행에만 "팀 나가기" 버튼이 보이고 클릭 시 onSelect가 호출된다', () => {
    const onSelect = vi.fn();
    const base = getTeamMembersViewModel();
    const model: TeamMembersViewModel = {
      ...base,
      members: [
        { name: '김도윤', role: '팀장', meta: 'FW · 가입 2024.03', locked: true, actions: [] },
        {
          name: '이하나',
          role: '멤버',
          meta: 'MF · 최근 4경기',
          actions: [],
          selfLeave: { disabled: false, pending: false, onSelect },
        },
      ],
    };

    render(<TeamMembersPageView model={model} />);

    const leaveButtons = screen.getAllByRole('button', { name: '팀 나가기' });
    // 본인(이하나) 행에만 1개만 렌더된다 — 김도윤 행에는 selfLeave가 없으므로 버튼 없음
    expect(leaveButtons).toHaveLength(1);

    fireEvent.click(leaveButtons[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('단독 owner는 active owner 요약에 따라 "팀 나가기"가 비활성화된다', () => {
    mockOwnerMembersPage(1);

    render(<TeamMembersPageClient teamId="team-1" />);

    const button = screen.getByRole('button', { name: /팀 나가기/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', '마지막 소유자는 소유권을 먼저 이전해주세요');
  });

  it('다른 active owner가 있는 공동 owner는 확인 후 "팀 나가기"를 실행할 수 있다', async () => {
    const leaveMutate = mockOwnerMembersPage(2);

    render(<TeamMembersPageClient teamId="team-1" />);

    const button = screen.getByRole('button', { name: '팀 나가기' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: '팀 나가기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '나가기' }));

    await waitFor(() => expect(leaveMutate).toHaveBeenCalledWith(
      { reason: 'left_from_v1_web_member_page' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    ));
  });

  it('두 초대를 연달아 취소해도 먼저 시작한 카드의 pending이 풀리지 않는다', async () => {
    mockOwnerMembersPage(2);
    teamApiMocks.useV1TeamInvitations.mockReturnValue({
      data: {
        items: [
          { invitationId: 'inv-a', invitedUser: { userId: 'u-a', displayName: '김도윤', profileImageUrl: null }, status: 'pending', message: null, createdAt: '2026-07-01T00:00:00Z' },
          { invitationId: 'inv-b', invitedUser: { userId: 'u-b', displayName: '박서준', profileImageUrl: null }, status: 'pending', message: null, createdAt: '2026-07-01T00:00:00Z' },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    // onSettled를 부르지 않아 두 취소 요청 모두 "진행 중"인 상태를 만든다.
    const cancelMutate = vi.fn();
    teamApiMocks.useV1CancelTeamInvitation.mockReturnValue({ isPending: true, mutate: cancelMutate });

    render(<TeamMembersPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^초대 \d+$/ }));

    for (const name of ['김도윤', '박서준']) {
      fireEvent.click(screen.getByRole('button', { name: `${name}님 초대 취소` }));
      const dialog = await screen.findByRole('dialog', { name: '초대 취소' });
      // 확인 버튼('초대 취소')과 닫기 버튼('취소')이 서로 다른 문구여야 이 셀렉터가 성립한다.
      fireEvent.click(within(dialog).getByRole('button', { name: '초대 취소' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '초대 취소' })).not.toBeInTheDocument());
    }

    // 단일 id 추적이면 뒤엣것이 앞엣것의 pending을 덮어써 A가 다시 눌리게 된다(중복 취소 요청).
    await waitFor(() => expect(cancelMutate).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '김도윤님 초대 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '박서준님 초대 취소' })).toBeDisabled();
  });
});

/**
 * 오너 지적(2026-08-18) — 팀 상세 모바일에서 "팀 전적" 링크가 위 매치 섹션과 **간격 0px**
 * 로 맞붙어 그 섹션의 일부처럼 보였고, 팀에서 리뷰를 볼 길이 아예 없었다. 두 링크를
 * "팀 기록" 섹션으로 묶어 세운다.
 *
 * 받은 후기 링크는 **내 팀에서만** 보여야 한다 — 이 요약 API 는 "로그인 사용자가 받은 팀
 * 후기"라, 남의 팀 상세에 두면 그 팀 것이 아니라 내 후기를 그 팀 평가인 양 보여주게 된다.
 */
describe('TeamDetailPageView — 팀 기록 섹션', () => {
  function modelWithMode(mode: TeamDetailViewModel['mode']): TeamDetailViewModel {
    return { ...getTeamDetailViewModel('default'), mode };
  }

  it('내 팀이면 전적과 받은 후기 링크를 함께 보여주고, 요약을 배지로 적는다', () => {
    teamApiMocks.useV1ReceivedReviewSummary.mockReturnValue({
      data: {
        bySport: [
          { sportId: 's1', sportCode: 'futsal', ratingAvg: 5, ratingCount: 3, tagRates: [] },
          { sportId: 's2', sportCode: 'soccer', ratingAvg: 4, ratingCount: 1, tagRates: [] },
        ],
        availableMonths: [],
      },
    });

    render(<TeamDetailPageView model={modelWithMode('mine')} />);

    // 이 화면은 모바일·데스크톱 레이아웃을 **둘 다 마운트**하고 CSS 로 하나만 보여준다 —
    // 두 벌이 같은 링크를 갖는 게 정상이고, 한쪽에만 있으면 그게 회귀다.
    expect(screen.getAllByRole('link', { name: /팀 전적/ })).toHaveLength(2);
    const reviewLinks = screen.getAllByRole('link', { name: /받은 후기/ });
    expect(reviewLinks).toHaveLength(2);
    const reviewLink = reviewLinks[0];
    expect(reviewLink).toHaveAttribute('href', '/my/reviews?tab=received');
    // 개수로 가중 평균: (5×3 + 4×1) / 4 = 4.75 → 4.8, 총 4개
    expect(reviewLink).toHaveTextContent('4.8');
    expect(reviewLink).toHaveTextContent('4개');
  });

  it('남의 팀에는 받은 후기 링크를 두지 않는다 (내 후기를 그 팀 평가로 보이게 하면 안 된다)', () => {
    teamApiMocks.useV1ReceivedReviewSummary.mockReturnValue({ data: undefined });

    render(<TeamDetailPageView model={modelWithMode('default')} />);

    expect(screen.getAllByRole('link', { name: /팀 전적/ })).toHaveLength(2);
    expect(screen.queryAllByRole('link', { name: /받은 후기/ })).toHaveLength(0);
  });

  it('받은 후기가 아직 없으면 배지 없이 안내만 보여준다', () => {
    teamApiMocks.useV1ReceivedReviewSummary.mockReturnValue({ data: { bySport: [], availableMonths: [] } });

    render(<TeamDetailPageView model={modelWithMode('mine')} />);

    expect(screen.getAllByRole('link', { name: /받은 후기/ })[0]).toHaveTextContent('아직 받은 후기가 없어요');
  });
});
