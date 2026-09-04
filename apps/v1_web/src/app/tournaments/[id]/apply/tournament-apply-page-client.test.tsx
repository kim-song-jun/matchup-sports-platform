import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import { useShellOverrideForRoute } from '@/components/v1-ui/shell-override';
import type { V1MyTeam, V1TournamentDetail, V1TournamentRegistration } from '@/types/api';
import { TournamentApplyPageClient } from './tournament-apply-client';

const tournamentApplyApiMocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1Tournament: vi.fn(),
  useV1MyTeams: vi.fn(),
  useV1MyRegistrations: vi.fn(),
  useV1Registration: vi.fn(),
  useV1CreateRegistration: vi.fn(),
  useV1SubmitRegistration: vi.fn(),
  useV1CurrentTerms: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...tournamentApplyApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

// `?team=` 유무로 셸 backHref가 갈리는 테스트(아래 "셸 backHref override" describe)를 위해
// 가변 변수로 뺀다 — admin/content/page.test.tsx의 기존 관례와 동일 패턴.
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/apply',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => searchParams,
}));

// useShellOverride가 렌더 단계에서 모듈 스코프 store에 밀어넣은 값을 읽어 화면에 텍스트로
// 노출한다 — AppShellFrame을 전부 마운트하지 않고도(그건 app-shell-frame.test.tsx가 이미
// 검증) 실제 컴포넌트가 useShellOverride({ backHref })를 호출하는 값 자체를 검증한다.
function BackHrefProbe() {
  const { backHref } = useShellOverrideForRoute('/tournaments/tournament-1/apply');
  return <div data-testid="probe-backhref">{backHref ?? '(table-default)'}</div>;
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'open',
    format: 'knockout',
    kind: 'regular_tournament',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    leagueFixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTeam(overrides: Partial<V1MyTeam> = {}): V1MyTeam {
  return {
    teamId: 'team-1',
    membershipId: 'membership-1',
    name: '성수 풋살 크루',
    role: 'owner',
    status: 'active',
    logoUrl: null,
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-seoul', name: '서울', parentName: null },
    memberCount: 12,
    canManage: true,
    canCreateTeamMatch: true,
    detailRoute: '/teams/team-1',
    manageRoute: '/teams/team-1/members',
    ...overrides,
  };
}

function makeRegistration(overrides: Partial<V1TournamentRegistration> = {}): V1TournamentRegistration {
  return {
    id: 'registration-cancelled',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    teamName: '성수 풋살 크루',
    appliedByUserId: 'user-1',
    status: 'cancelled',
    depositorName: null,
    agreedRules: false,
    agreedPrivacy: false,
    agreedRefund: false,
    agreedMediaConsent: false,
    confirmedAt: null,
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    cancelRequestedAt: '2026-07-01T00:00:00.000Z',
    cancelReason: '입금 미확인 자동 취소',
    playerCount: 0,
    payment: null,
    paymentInstructions: null,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TournamentApplyPageClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    searchParams = new URLSearchParams();

    // 기본은 본인인증을 마친 신청자 — 신청 위저드의 정상 경로.
    tournamentApplyApiMocks.useV1AuthMe.mockReturnValue({
      data: { verification: { phoneVerified: true } },
    });
    tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament(),
      isLoading: false,
      isError: false,
      error: null,
    });
    tournamentApplyApiMocks.useV1MyTeams.mockReturnValue({
      data: { items: [makeTeam()] },
      isLoading: false,
    });
    tournamentApplyApiMocks.useV1MyRegistrations.mockReturnValue({ data: [], isLoading: false });
    tournamentApplyApiMocks.useV1Registration.mockReturnValue({ data: undefined });
    tournamentApplyApiMocks.useV1CurrentTerms.mockReturnValue({
      data: {
        context: 'tournament_application',
        ready: true,
        compliance: null,
        items: [
          { documentId: '11111111-1111-4111-8111-111111111111', code: 'tournament_rules', title: '대회 규정', subtitle: '참가 기준', content: '규정 본문', version: 'v1.1', requirement: 'required' },
          { documentId: '22222222-2222-4222-8222-222222222222', code: 'tournament_privacy', title: '개인정보 동의', subtitle: '개인정보 기준', content: '개인정보 본문', version: 'v1.1', requirement: 'required' },
          { documentId: '33333333-3333-4333-8333-333333333333', code: 'tournament_refund', title: '환불 정책', subtitle: '환불 기준', content: '환불 본문', version: 'v1.1', requirement: 'required' },
          { documentId: '44444444-4444-4444-8444-444444444444', code: 'tournament_media', title: '사진·영상 동의', subtitle: '선택 활용', content: '미디어 본문', version: 'v1.1', requirement: 'optional' },
        ],
      },
      isPending: false,
      isError: false,
    });
  });

  it('tracks tournament_apply_complete once the registration is submitted', async () => {
    // **유료 대회로 바꾼다.** 이 테스트는 입금자명·결제 수단 경로를 검증하는데, 기본 픽스처는
    // 참가비 0원이라 무료 대회에서는 그 UI 가 아예 없다(결함 #6 수정). 결제 경로를 보려면
    // 참가비가 있어야 한다.
    tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ entryFee: 20000 }),
      isLoading: false,
      isError: false,
      error: null,
    });
    const createRegistrationMutateAsync = vi.fn().mockResolvedValue({
      id: 'registration-1',
      status: 'draft',
    });
    const submitRegistrationMutateAsync = vi.fn().mockResolvedValue({
      id: 'registration-1',
      status: 'awaiting_payment',
      payment: null,
      paymentInstructions: {
        bankName: '국민은행',
        bankAccount: '123-456-789',
        bankHolder: '아이위',
      },
      depositorName: '성수 풋살 크루',
    });
    tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
      mutateAsync: createRegistrationMutateAsync,
      isPending: false,
    });
    tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
      mutateAsync: submitRegistrationMutateAsync,
      isPending: false,
    });

    render(<TournamentApplyPageClient tournamentId="tournament-1" />);

    const [nextButton] = await screen.findAllByRole('button', { name: /^다음 단계/ });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(createRegistrationMutateAsync).toHaveBeenCalledWith({ teamId: 'team-1' });
    });

    fireEvent.click(await screen.findByLabelText('전체 동의'));

    const depositorInput = screen.getByLabelText('입금자명 *');
    fireEvent.change(depositorInput, { target: { value: '성수 풋살 크루' } });

    const [submitButton] = screen.getAllByRole('button', { name: '신청 제출하기' });
    fireEvent.click(submitButton);
    fireEvent.click(await screen.findByRole('button', { name: '확인하고 신청하기' }));

    await waitFor(() => {
      expect(submitRegistrationMutateAsync).toHaveBeenCalled();
      expect(submitRegistrationMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          termsDocumentIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444',
          ],
        }),
      );
      expect(trackEvent).toHaveBeenCalledWith('tournament_apply_complete', { tournamentId: 'tournament-1' });
    });
  });

  it('참가비가 없는 대회는 단계 라벨에서도 결제를 예고하지 않는다', async () => {
    // #1017 이 입력은 다 걷어냈는데 **라벨만 결제를 전제**하고 있었다 — 2026-09-04 alpha 실측:
    // 본문이 "이 대회는 무료로 참가할 수 있어요" 인 화면의 진행 표시가 `동의 · 결제 수단` /
    // `다음: 결제 안내` 였다. 없을 결제를 예고하는 잘못된 안내다.
    render(<TournamentApplyPageClient tournamentId="tournament-1" />);
    expect(await screen.findByText('팀 선택')).toBeInTheDocument();
    expect(screen.getByText(/다음: 참가 동의/)).toBeInTheDocument();
    expect(screen.queryByText(/결제 수단/)).not.toBeInTheDocument();
    expect(screen.queryByText(/결제 안내/)).not.toBeInTheDocument();
  });

  it('유료 대회는 결제 라벨을 그대로 쓴다 — 무료 분기가 유료를 삼키면 안 된다', async () => {
    tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ entryFee: 20000 }),
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<TournamentApplyPageClient tournamentId="tournament-1" />);
    expect(await screen.findByText('팀 선택')).toBeInTheDocument();
    expect(screen.getByText(/다음: 동의 · 결제 수단/)).toBeInTheDocument();
  });

  it('참가비가 없는 대회는 신청 완료 화면에서 입금 안내를 그리지 않고 명단 등록으로 이끈다', async () => {
    // 이 픽스처의 entryFee 는 0 이다. 그런데 완료 화면이 "아래 계좌로 참가비를 입금해 주세요" 를
    // 무조건 그리고, 계좌 정보가 없으면 빨간 에러 "입금 계좌가 준비되지 않았어요" 까지 띄웠다
    // (2026-09-04 alpha 실측 — 무료 대회 신청자 전원이 봤다). step 1·2 는 이미 entryFee 를
    // 분기하는데 완료 화면만 빠져 있었다.
    const createRegistrationMutateAsync = vi.fn().mockResolvedValue({ id: 'registration-1', status: 'draft' });
    const submitRegistrationMutateAsync = vi.fn().mockResolvedValue({
      id: 'registration-1',
      status: 'awaiting_payment',
      payment: null,
      // 무료 대회라 서버가 계좌 정보를 주지 않는다 — 이게 정상이다.
      paymentInstructions: null,
      depositorName: '성수 풋살 크루',
    });
    tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
      mutateAsync: createRegistrationMutateAsync,
      isPending: false,
    });
    tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
      mutateAsync: submitRegistrationMutateAsync,
      isPending: false,
    });

    render(<TournamentApplyPageClient tournamentId="tournament-1" />);

    const [nextButton] = await screen.findAllByRole('button', { name: /^다음 단계/ });
    fireEvent.click(nextButton);
    await waitFor(() => expect(createRegistrationMutateAsync).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText('전체 동의'));
    // 무료 대회라 입금자명 입력 자체가 없다(결함 #6 수정) — 동의만 하면 제출할 수 있다.
    expect(screen.queryByLabelText('입금자명 *')).not.toBeInTheDocument();
    const [submitButton] = screen.getAllByRole('button', { name: '신청 제출하기' });
    fireEvent.click(submitButton);
    fireEvent.click(await screen.findByRole('button', { name: '확인하고 신청하기' }));

    // 완료 화면에 도달했는지 먼저 확인한다 — 이게 없으면 아래 부재 단언이 공허해진다.
    expect(await screen.findByText('신청했어요')).toBeInTheDocument();

    // 돈 이야기는 하나도 나오면 안 된다.
    expect(screen.queryByText('아래 계좌로 참가비를 입금해 주세요')).not.toBeInTheDocument();
    expect(screen.queryByText('입금 계좌가 준비되지 않았어요. 운영팀에 문의해 주세요.')).not.toBeInTheDocument();
    expect(screen.queryByText('입금 안내')).not.toBeInTheDocument();
    expect(
      screen.queryByText('입금이 확인되면 신청이 최종 확정돼요. 입금자명이 다르면 확인이 늦어질 수 있어요.'),
    ).not.toBeInTheDocument();

    // 대신 다음 할 일(명단 등록)로 이끈다 — 입금 섹션 안에 중첩돼 있어서 같이 사라지면 안 된다.
    expect(screen.getByRole('link', { name: '선수 명단 등록' })).toBeInTheDocument();
    expect(screen.getByText('선수 명단을 이어서 등록해요')).toBeInTheDocument();
    // 그 안내 문구에도 결제가 남으면 안 된다 — "입금 확인을 기다리는 동안" 은 없는 절차다.
    expect(screen.queryByText(/입금 확인을 기다리는 동안/)).not.toBeInTheDocument();
  });

  it('참가비가 없는 대회는 2단계에서 결제 수단·입금자명을 요구하지 않는다', async () => {
    // 이 픽스처의 entryFee 는 0 이다. 그런데 2단계가 "결제 수단(계좌이체)" 섹션과 **필수**
    // 입금자명을 그대로 요구했다 — 같은 화면에 "이 대회는 무료로 참가할 수 있어요." 안내를
    // 띄우면서 동시에 입금자명을 받아야 제출 버튼이 열렸다(2026-09-04 alpha 실측, 결함 #6).
    tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'registration-1', status: 'draft' }),
      isPending: false,
    });
    tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    render(<TournamentApplyPageClient tournamentId="tournament-1" />);

    const [nextButton] = await screen.findAllByRole('button', { name: /^다음 단계/ });
    fireEvent.click(nextButton);

    // 2단계에 도달했는지 먼저 확인한다 — 이게 없으면 아래 부재 단언이 공허해진다.
    expect(await screen.findByLabelText('전체 동의')).toBeInTheDocument();

    expect(screen.queryByText('결제 수단')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('입금자명 *')).not.toBeInTheDocument();
    // 무료라는 사실은 계속 알려 준다.
    expect(screen.getByText('이 대회는 무료로 참가할 수 있어요.')).toBeInTheDocument();
  });

  it('참가비가 없는 대회는 입금자명 없이도 제출할 수 있다', async () => {
    // 입금자명이 `canSubmit` 의 필수 조건이라 무료 대회에서도 버튼이 잠겨 있었다.
    tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'registration-1', status: 'draft' }),
      isPending: false,
    });
    tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    render(<TournamentApplyPageClient tournamentId="tournament-1" />);
    const [nextButton] = await screen.findAllByRole('button', { name: /^다음 단계/ });
    fireEvent.click(nextButton);
    fireEvent.click(await screen.findByLabelText('전체 동의'));

    const [submitButton] = screen.getAllByRole('button', { name: '신청 제출하기' });
    expect(submitButton).toBeEnabled();
  });

  describe('입금자명 입력', () => {
    it('입금자명을 비워두면 제출할 수 없고, 팀명이 자동으로 채워지지도 않는다', async () => {
      // **유료 대회로 바꾼다.** 이 테스트는 입금자명·결제 수단 경로를 검증하는데, 기본 픽스처는
      // 참가비 0원이라 무료 대회에서는 그 UI 가 아예 없다(결함 #6 수정). 결제 경로를 보려면
      // 참가비가 있어야 한다.
      tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
        data: makeTournament({ entryFee: 20000 }),
        isLoading: false,
        isError: false,
        error: null,
      });
      // 예전에는 선택한 팀명을 미리 채워서, 아무것도 입력하지 않아도 제출이 가능했다.
      // 실제 입금은 개인 이름으로 들어오므로 그 자동채움이 입금 확인 지연을 만들었다.
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue({ id: 'registration-1', status: 'draft' }),
        isPending: false,
      });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
      });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);
      fireEvent.click((await screen.findAllByRole('button', { name: /^다음 단계/ }))[0]);

      const depositorInput = await screen.findByLabelText('입금자명 *');
      expect(depositorInput).toHaveValue('');

      fireEvent.click(await screen.findByLabelText('전체 동의'));
      for (const button of screen.getAllByRole('button', { name: '신청 제출하기' })) {
        expect(button).toBeDisabled();
      }

      fireEvent.change(depositorInput, { target: { value: '김성준' } });
      expect(screen.getAllByRole('button', { name: '신청 제출하기' })[0]).toBeEnabled();
    });
  });

  describe('취소된 신청의 재신청', () => {
    it('취소된 신청이 있는 팀을 다시 골라도 새 신청을 생성한다 (취소된 registrationId를 이어받지 않음)', async () => {
      // **유료 대회로 바꾼다.** 이 테스트는 입금자명·결제 수단 경로를 검증하는데, 기본 픽스처는
      // 참가비 0원이라 무료 대회에서는 그 UI 가 아예 없다(결함 #6 수정). 결제 경로를 보려면
      // 참가비가 있어야 한다.
      tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
        data: makeTournament({ entryFee: 20000 }),
        isLoading: false,
        isError: false,
        error: null,
      });
      // 입금 미확인으로 자동 취소된 신청이 남아있는 상태 — 같은 팀으로 재신청이 가능해야 한다.
      tournamentApplyApiMocks.useV1MyRegistrations.mockReturnValue({
        data: [makeRegistration()],
        isLoading: false,
      });
      const createRegistrationMutateAsync = vi.fn().mockResolvedValue({
        id: 'registration-reactivated',
        status: 'draft',
      });
      const submitRegistrationMutateAsync = vi.fn().mockResolvedValue({
        id: 'registration-reactivated',
        status: 'awaiting_payment',
        payment: null,
        paymentInstructions: null,
      });
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
        mutateAsync: createRegistrationMutateAsync,
        isPending: false,
      });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
        mutateAsync: submitRegistrationMutateAsync,
        isPending: false,
      });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);

      // 사용자가 팀 카드를 직접 눌러 선택하는 경로 (자동 선택 경로와 별개)
      fireEvent.click((await screen.findAllByRole('radio'))[0]);
      const [nextButton] = await screen.findAllByRole('button', { name: /^다음 단계/ });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(createRegistrationMutateAsync).toHaveBeenCalledWith({ teamId: 'team-1' });
      });

      fireEvent.click(await screen.findByLabelText('전체 동의'));
      fireEvent.change(screen.getByLabelText('입금자명 *'), { target: { value: '성수 풋살 크루' } });
      fireEvent.click(screen.getAllByRole('button', { name: '신청 제출하기' })[0]);
      fireEvent.click(await screen.findByRole('button', { name: '확인하고 신청하기' }));

      // 취소된 신청 id로 submit하면 서버가 409(REGISTRATION_NOT_DRAFT)로 막는다.
      await waitFor(() => {
        expect(submitRegistrationMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ registrationIdOverride: 'registration-reactivated' }),
        );
      });
    });
  });

  describe('정원·마감으로 재신청이 불가능한 경우', () => {
    function arrangeCancelledReapply() {
      tournamentApplyApiMocks.useV1MyRegistrations.mockReturnValue({
        data: [makeRegistration()],
        isLoading: false,
      });
      const createRegistrationMutateAsync = vi.fn();
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
        mutateAsync: createRegistrationMutateAsync,
        isPending: false,
      });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
      });
      return createRegistrationMutateAsync;
    }

    it('입금대기 팀이 정원을 채운 대회에서는 이유를 알려주고 신청을 만들지 않는다', async () => {
      // 확정 5 + 입금대기 3 = 정원 8 → 목록엔 "5 / 8"로 보여도 서버는 409로 막는다.
      //
      // **유료로 둔다.** 기본 픽스처는 참가비 0원인데, 무료 대회에서 기다리는 것은 입금이
      // 아니라 운영자 확인이라 라벨이 "확인대기" 다. 이 테스트가 검증하려는 건 입금대기가
      // 정원을 쥐는 시나리오이므로 참가비를 준다 — 안 그러면 테스트 이름과 화면이 어긋난다.
      tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
        data: makeTournament({ teamCount: 8, confirmedCount: 5, pendingPaymentCount: 3, entryFee: 20000 }),
        isLoading: false,
        isError: false,
        error: null,
      });
      const createRegistrationMutateAsync = arrangeCancelledReapply();

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);

      expect(await screen.findByText(/입금대기 3팀이 자리를 잡고 있어요/)).toBeInTheDocument();

      fireEvent.click((await screen.findAllByRole('radio'))[0]);
      fireEvent.click((await screen.findAllByRole('button', { name: /^다음 단계/ }))[0]);

      // 약관 단계로 넘기지 않고, 서버를 헛되게 호출하지도 않는다.
      await waitFor(() => {
        expect(screen.getAllByText(/입금대기 3팀이 자리를 잡고 있어요/).length).toBeGreaterThan(0);
      });
      expect(createRegistrationMutateAsync).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('전체 동의')).not.toBeInTheDocument();
    });

    it('신청 마감 시각이 지난 대회에서도 같은 기준으로 막는다', async () => {
      tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
        data: makeTournament({ registrationDeadlineAt: '2020-01-01T00:00:00.000Z' }),
        isLoading: false,
        isError: false,
        error: null,
      });
      const createRegistrationMutateAsync = arrangeCancelledReapply();

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);

      expect(await screen.findByText('신청이 마감돼서 새로 신청할 수 없어요.')).toBeInTheDocument();
      fireEvent.click((await screen.findAllByRole('radio'))[0]);
      fireEvent.click((await screen.findAllByRole('button', { name: /^다음 단계/ }))[0]);
      await waitFor(() => {
        expect(createRegistrationMutateAsync).not.toHaveBeenCalled();
      });
    });

    it('정원에 여유가 있으면 그대로 재신청을 진행한다', async () => {
      tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
        data: makeTournament({ teamCount: 8, confirmedCount: 5, pendingPaymentCount: 0 }),
        isLoading: false,
        isError: false,
        error: null,
      });
      tournamentApplyApiMocks.useV1MyRegistrations.mockReturnValue({
        data: [makeRegistration()],
        isLoading: false,
      });
      const createRegistrationMutateAsync = vi
        .fn()
        .mockResolvedValue({ id: 'registration-reactivated', status: 'draft' });
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
        mutateAsync: createRegistrationMutateAsync,
        isPending: false,
      });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
      });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);

      fireEvent.click((await screen.findAllByRole('radio'))[0]);
      fireEvent.click((await screen.findAllByRole('button', { name: /^다음 단계/ }))[0]);

      await waitFor(() => {
        expect(createRegistrationMutateAsync).toHaveBeenCalledWith({ teamId: 'team-1' });
      });
    });
  });

  describe('휴대폰 본인인증 게이트', () => {
    it('미인증 사용자는 신청 위저드 대신 인증 유도 화면을 보고, 인증 후 이 화면으로 돌아온다', async () => {
      tournamentApplyApiMocks.useV1AuthMe.mockReturnValue({
        data: { verification: { phoneVerified: false } },
      });
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);

      const cta = await screen.findByRole('link', { name: '본인인증 하러 가기' });
      expect(cta).toHaveAttribute(
        'href',
        `/my/phone-verify?redirect=${encodeURIComponent('/tournaments/tournament-1/apply')}`,
      );
      // 위저드로 진입시키지 않는다 — 서버도 submit 에서 막으므로 화면만 열어두면 헛걸음이 된다.
      expect(screen.queryAllByRole('button', { name: /^다음 단계/ })).toHaveLength(0);
    });

    it('이미 인증한 사용자는 게이트 없이 신청 위저드로 들어간다', async () => {
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);

      expect(screen.queryByRole('link', { name: '본인인증 하러 가기' })).not.toBeInTheDocument();
      expect((await screen.findAllByRole('button', { name: /^다음 단계/ })).length).toBeGreaterThan(0);
    });
  });

  // route-chrome 테이블(fragments/tournaments-extra.ts)의 backHref는 이 라우트에서 항상
  // '/tournaments/tournament-1'(대회 상세) 고정값이다 — `?team=` 딥링크로 들어온 경우엔
  // 셸 topbar 뒤로가기가 '/tournaments/tournament-1/my'로 가야 한다(내 신청 페이지에서
  // 팀을 골라 들어온 흐름이므로). 이 분기가 깨지면(예: applyBackHref 계산이 원복되면)
  // 아래 두 단언 중 하나가 red가 된다.
  describe('셸 backHref override', () => {
    // Probe를 페이지와 형제로 한 트리에 같이 렌더하면 useSyncExternalStore가 "다른 컴포넌트
    // 렌더 중 setState" React 경고를 낸다(마운트 직후 자체 재확인이 트리거) — 실제 프로덕션
    // 배선(app-shell-frame.tsx)에서는 AppShellFrame이 항상 페이지의 조상이라 이 문제가 없다.
    // 테스트에서 같은 순서를 재현하는 대신, 페이지를 먼저 완전히 커밋시킨 뒤(store가 이미
    // 갱신된 상태) Probe를 별도 act로 마운트해 첫 렌더에서 바로 최신 값을 읽게 한다 — 경고도
    // 없고 검증 대상(override 값)도 동일하다.
    it('`?team=` 없이 진입하면 override를 밀어넣지 않아 테이블 기본값(대회 상세)이 유지된다', () => {
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);
      const probe = render(<BackHrefProbe />);

      expect(probe.getByTestId('probe-backhref')).toHaveTextContent('/tournaments/tournament-1');
    });

    it('`?team=X`로 진입하면 backHref override가 "내 신청" 페이지를 가리킨다', () => {
      searchParams = new URLSearchParams('team=team-1');
      tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

      render(<TournamentApplyPageClient tournamentId="tournament-1" />);
      const probe = render(<BackHrefProbe />);

      expect(probe.getByTestId('probe-backhref')).toHaveTextContent('/tournaments/tournament-1/my');
    });
  });
});
