import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminTournament,
  useV1AdminTournaments,
  useV1ChangeTournamentStatus,
  useV1CreateTournament,
  useV1LineupSizeOptions,
  useV1MasterSports,
  useV1UpdateTournament,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import AdminTournamentsNewPage from './page';
import {
  INITIAL_TOURNAMENT_CREATE_STATE,
  buildTournamentCreatePayload,
  hasPromoFactEdits,
  tournamentCreateReducer,
  validateTournamentCreateStep,
} from './tournament-create-model';
import type {
  TournamentCreateAction,
  TournamentCreateState,
} from './tournament-create-model';
import type { V1Tournament } from '@/types/api';

const routerPush = vi.fn();
const routerReplace = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/tournaments/new',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminTournament: vi.fn(),
  useV1AdminTournaments: vi.fn(),
  useV1ChangeTournamentStatus: vi.fn(),
  useV1CreateTournament: vi.fn(),
  useV1LineupSizeOptions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1UpdateTournament: vi.fn(),
  useV1UploadImages: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1AdminTournamentMock = vi.mocked(useV1AdminTournament, { partial: true });
const useV1AdminTournamentsMock = vi.mocked(useV1AdminTournaments, { partial: true });
const useV1ChangeTournamentStatusMock = vi.mocked(useV1ChangeTournamentStatus, { partial: true });
const useV1CreateTournamentMock = vi.mocked(useV1CreateTournament, { partial: true });
const useV1LineupSizeOptionsMock = vi.mocked(useV1LineupSizeOptions, { partial: true });
const useV1MasterSportsMock = vi.mocked(useV1MasterSports, { partial: true });
const useV1UpdateTournamentMock = vi.mocked(useV1UpdateTournament, { partial: true });
const useV1UploadImagesMock = vi.mocked(useV1UploadImages, { partial: true });
const createMutate = vi.fn();
const updateMutate = vi.fn();
const changeStatusMutate = vi.fn();
const uploadMutateAsync = vi.fn();

function previousTournament(): V1Tournament {
  return {
    id: 'previous-tournament',
    sportId: 'sport-futsal',
    title: '직전 대회',
    status: 'completed',
    format: 'group_knockout',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    scheduledAt: '2026-07-01T09:00:00.000Z',
    scheduledEndAt: null,
    venue: '서울 풋살장',
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    competitionConfigVersionId: null,
    lineupMaxPlayers: null,
    lineupMinPlayers: null,
    lineupSizeOptions: [],
    substitutionMode: null,
    maxSubstitutions: null,
    substitutionModeOptions: [],
    genderCategory: 'mixed',
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    minMatchesPerTeam: null,
    entryFee: 50000,
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
    bankName: '국민은행',
    bankAccount: '123-456',
    bankHolder: '티밋',
    rulesText: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    registrationCount: 8,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function renderPage() {
  return render(
    <Providers>
      <AdminTournamentsNewPage />
    </Providers>,
  );
}

function fillBasicStep() {
  fireEvent.change(screen.getByLabelText(/종목/), { target: { value: 'sport-futsal' } });
  fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '2026 서울 풋살 오픈' } });
}

function goToScheduleStep() {
  fillBasicStep();
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}

function fillScheduleStep() {
  fireEvent.change(screen.getByLabelText(/대회 시작/), {
    target: { value: '2026-08-15T09:00' },
  });
}

function goToPresentationStep() {
  goToParticipationStep();
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}

function fakeDraftTournament(overrides: Partial<V1Tournament> = {}): V1Tournament {
  return {
    ...previousTournament(),
    id: 'draft-1',
    status: 'draft',
    title: '2026 서울 풋살 오픈',
    sportId: 'sport-futsal',
    scheduledAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function goToParticipationStep() {
  goToScheduleStep();
  fillScheduleStep();
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}

describe('AdminTournamentsNewPage four-step wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsValue = new URLSearchParams();
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false });
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }],
      isPending: false,
    });
    useV1AdminTournamentsMock.mockReturnValue({
      data: {
        items: [previousTournament()],
        pageInfo: { nextCursor: null, hasNext: false },
        summary: { total: 1, byStatus: {} },
      },
      isPending: false,
    });
    useV1AdminTournamentMock.mockReturnValue({ data: undefined, isPending: false });
    useV1CreateTournamentMock.mockReturnValue({
      mutate: createMutate,
      isPending: false,
    });
    useV1UpdateTournamentMock.mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    });
    useV1ChangeTournamentStatusMock.mockReturnValue({
      mutate: changeStatusMutate,
      isPending: false,
    });
    useV1LineupSizeOptionsMock.mockReturnValue({
      data: {
        sportId: 'sport-futsal',
        supported: true,
        options: [5, 6],
        defaultMaxPlayers: 6,
        substitutionModes: ['limited', 'rolling'],
        defaultSubstitutionMode: 'rolling',
        defaultMaxSubstitutions: null,
      },
      isPending: false,
    });
    uploadMutateAsync.mockResolvedValue({ urls: ['/uploads/cover-test.webp'] });
    useV1UploadImagesMock.mockReturnValue({
      mutateAsync: uploadMutateAsync,
      isPending: false,
    });
  });

  it('T1 keeps basic fields after moving forward and back', () => {
    renderPage();
    goToScheduleStep();

    fireEvent.click(screen.getByRole('button', { name: /이전/ }));

    expect(screen.getByLabelText(/종목/)).toHaveValue('sport-futsal');
    expect(screen.getByLabelText(/대회명/)).toHaveValue('2026 서울 풋살 오픈');
    expect(screen.getByLabelText('혼성')).toBeChecked();
  });

  // "출전 인원"(라인업 상한) 선택지 — 서버가 종목의 canonical 포메이션에서 파생해
  // 내려주는 값이라 프론트는 후보를 하드코딩하지 않는다. 아래 세 케이스는 각각 다른
  // 실패 모드를 잡는다: 정상 렌더/자동 기본값, 미지원 종목, 그리고 조회 실패.
  it('출전 인원: 서버가 준 후보를 칩으로 렌더하고 canonical 기본값을 자동 선택한다', async () => {
    renderPage();
    goToParticipationStep();

    const group = await screen.findByRole('group', { name: '출전 인원 선택' });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['5명', '6명']);
    // defaultMaxPlayers=6 이 자동 선택돼야 한다(관리자가 아무것도 안 골라도 pin 가능).
    expect(within(group).getByRole('button', { name: '6명' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '5명' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('출전 인원: 카탈로그가 없는 종목이면 선택지를 지어내지 않고 안내만 보여준다', () => {
    useV1LineupSizeOptionsMock.mockReturnValue({
      data: {
        sportId: 'sport-futsal',
        supported: false,
        options: [],
        defaultMaxPlayers: null,
        substitutionModes: [],
        defaultSubstitutionMode: null,
        defaultMaxSubstitutions: null,
      },
      isPending: false,
    });
    renderPage();
    goToParticipationStep();

    expect(screen.queryByRole('group', { name: '출전 인원 선택' })).toBeNull();
    expect(screen.getByText(/이 종목은 아직 출전 인원을 선택할 수 없어요/)).toBeInTheDocument();
  });

  // Copilot 리뷰(2라운드, suppressed) 지적: 조회가 "실패"했을 때도 data 가 undefined 라
  // `!data?.supported` 한 줄로 묶으면 미지원 종목과 똑같은 문구가 떠서 진짜 오류가 숨는다.
  // 이 테스트가 깨지면 그 잘못된 안내가 되돌아온 것이다.
  it('출전 인원: 선택지 조회가 실패하면 "미지원 종목"이 아니라 오류 안내를 보여준다', () => {
    useV1LineupSizeOptionsMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });
    renderPage();
    goToParticipationStep();

    // 출전 인원 카드와 교체 방식 카드 둘 다 같은 조회 실패를 각자 안내한다(문구 두 개).
    expect(screen.getAllByText(/불러오지 못했어요/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/이 종목은 아직 출전 인원을 선택할 수 없어요/)).toBeNull();
    expect(screen.queryByRole('group', { name: '출전 인원 선택' })).toBeNull();
  });

  it('T2 proposes D-3 registration and D-7 roster deadlines without overwriting manual edits', () => {
    renderPage();
    goToScheduleStep();

    const start = screen.getByLabelText(/대회 시작/);
    fireEvent.change(start, { target: { value: '2026-08-15T09:00' } });

    expect(screen.getByLabelText(/신청 마감/)).toHaveValue('2026-08-12T23:59');
    expect(screen.getByLabelText(/명단 제출 마감/)).toHaveValue('2026-08-08T23:59');

    fireEvent.change(screen.getByLabelText(/신청 마감/), {
      target: { value: '2026-08-10T20:00' },
    });
    fireEvent.change(start, { target: { value: '2026-08-22T09:00' } });

    expect(screen.getByLabelText(/신청 마감/)).toHaveValue('2026-08-10T20:00');
    expect(screen.getByLabelText(/명단 제출 마감/)).toHaveValue('2026-08-15T23:59');
  });

  it('T3 preserves mixed gender quota values across step navigation', () => {
    renderPage();
    goToParticipationStep();

    fireEvent.change(screen.getByLabelText('남성 최소'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('여성 최소'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /이전/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    expect(screen.getByLabelText('남성 최소')).toHaveValue(3);
    expect(screen.getByLabelText('여성 최소')).toHaveValue(2);
  });

  it('T4 copies only the previous tournament bank fields', () => {
    renderPage();
    goToParticipationStep();

    fireEvent.click(screen.getByRole('button', { name: /직전 대회 불러오기/ }));

    expect(screen.getByLabelText('은행명')).toHaveValue('국민은행');
    expect(screen.getByLabelText('계좌번호')).toHaveValue('123-456');
    expect(screen.getByLabelText('예금주')).toHaveValue('티밋');
  });

  it('T5 keeps uploaded cover and prize rows in the parent reducer state', async () => {
    const afterCover = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, {
      type: 'set-field',
      field: 'coverImageUrl',
      value: '/uploads/cover-test.webp',
    });
    const afterPrize = tournamentCreateReducer(afterCover, {
      type: 'set-prize-rows',
      rows: [{ id: 'winner', label: '1위', value: '600000' }],
    });
    const afterNavigation = tournamentCreateReducer(
      tournamentCreateReducer(afterPrize, { type: 'set-step', step: 3 }),
      { type: 'set-step', step: 1 },
    );

    expect(afterNavigation.coverImageUrl).toBe('/uploads/cover-test.webp');
    expect(afterNavigation.prizeRows).toEqual([
      { id: 'winner', label: '1위', value: '600000' },
    ]);
  });

  it('patches only the uploaded promo image without restoring stale text', () => {
    const edited = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, {
      type: 'set-promo',
      slot: 'promoHome',
      value: {
        ...INITIAL_TOURNAMENT_CREATE_STATE.promoHome,
        title: '업로드 중 수정한 제목',
        subtitle: '업로드 중 수정한 설명',
      },
    });

    const afterUpload = tournamentCreateReducer(edited, {
      type: 'patch-promo',
      slot: 'promoHome',
      patch: { imageUrl: '/uploads/promo.webp' },
    });

    expect(afterUpload.promoHome).toMatchObject({
      title: '업로드 중 수정한 제목',
      subtitle: '업로드 중 수정한 설명',
      imageUrl: '/uploads/promo.webp',
    });
  });

  it('T6 serializes wizard values, gender quota, cover, prize and promo into the create payload', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      sportId: 'sport-futsal',
      title: '2026 서울 풋살 오픈',
      scheduledAt: '2026-08-15T09:00',
      registrationDeadlineAt: '2026-08-12T23:59',
      rosterDeadlineAt: '2026-08-08T23:59',
      genderMinMale: '3',
      genderMinFemale: '2',
      coverImageUrl: '/uploads/cover-test.webp',
      prizePool: '600000',
      prizeRows: [{ id: 'winner', label: '1위', value: '600000' }],
      promoHome: {
        ...INITIAL_TOURNAMENT_CREATE_STATE.promoHome,
        enabled: true,
        title: '이번 주 추천 대회',
      },
    };

    const payload = buildTournamentCreatePayload(state);

    expect(payload).toMatchObject({
      sportId: 'sport-futsal',
      genderCategory: 'mixed',
      genderMinMale: 3,
      genderMinFemale: 2,
      coverImageUrl: '/uploads/cover-test.webp',
      prizePool: 600000,
      prizeBreakdown: '1위 600,000원',
      promoHomeEnabled: true,
      promoHomeTitle: '이번 주 추천 대회',
    });
  });

  it('T6b serializes "제한" substitution mode with its count, but omits the count entirely for "무제한"', () => {
    const limited = buildTournamentCreatePayload({
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      sportId: 'sport-football',
      title: 'x',
      substitutionMode: 'limited',
      maxSubstitutions: '5',
    });
    expect(limited.substitutionMode).toBe('limited');
    expect(limited.maxSubstitutions).toBe(5);

    // "무제한"을 고르면 남아 있는 maxSubstitutions 입력값(예: 종목 전환 전 입력)이 있어도
    // payload에 실리면 안 된다 — 서버가 rolling+개수 조합을 400으로 거절한다.
    const rolling = buildTournamentCreatePayload({
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      sportId: 'sport-futsal',
      title: 'x',
      substitutionMode: 'rolling',
      maxSubstitutions: '5',
    });
    expect(rolling.substitutionMode).toBe('rolling');
    expect(rolling.maxSubstitutions).toBeUndefined();
  });

  it('T6c omits minMatchesPerTeam from the payload when left blank', () => {
    const payload = buildTournamentCreatePayload({
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      sportId: 'sport-futsal',
      title: 'x',
      format: 'league',
      minMatchesPerTeam: '',
    });
    expect(payload.minMatchesPerTeam).toBeUndefined();
    // undefined 값은 JSON.stringify에서 키 자체가 사라진다 — 실제로 서버에 전송되지
    // 않는다는 것을 axios가 쓰는 것과 같은 직렬화 경로로 증명한다(0/빈 문자열이 실려
    // @IsInt @Min(1)에 422로 거절되는 걸 막는 게 이 필드의 핵심 계약이다).
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('minMatchesPerTeam');
  });

  it('T6d serializes minMatchesPerTeam as a number when set', () => {
    const payload = buildTournamentCreatePayload({
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      sportId: 'sport-futsal',
      title: 'x',
      format: 'league',
      minMatchesPerTeam: '6',
    });
    expect(payload.minMatchesPerTeam).toBe(6);
  });

  it('T6e hydrates minMatchesPerTeam from a draft tournament in edit mode', () => {
    const draft = fakeDraftTournament({ format: 'league', minMatchesPerTeam: 8 });
    const hydrated = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, {
      type: 'hydrate-from-draft',
      tournament: draft,
    });
    expect(hydrated.minMatchesPerTeam).toBe('8');

    const withoutValue = fakeDraftTournament({ format: 'league', minMatchesPerTeam: null });
    const hydratedEmpty = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, {
      type: 'hydrate-from-draft',
      tournament: withoutValue,
    });
    expect(hydratedEmpty.minMatchesPerTeam).toBe('');
  });

  it('blocks moving forward and shows the current step validation error', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    await waitFor(() => {
      expect(screen.getByText('종목을 선택해 주세요.')).toBeInTheDocument();
      expect(screen.getByText('대회명을 입력해 주세요.')).toBeInTheDocument();
    });
    expect(screen.getByText('기본 정보', { selector: 'h2' })).toBeInTheDocument();
  });

  it('rejects a mixed gender maximum above the roster capacity', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      maxPlayers: '10',
      genderMaxFemale: '11',
    };

    expect(validateTournamentCreateStep(state, 2)).toMatchObject({
      genderQuota: '성별 최대 인원은 대회 최대 선수 수를 넘을 수 없어요.',
    });
  });

  it('rejects negative and fractional mixed gender quotas before submit', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      genderMinMale: '-1',
      genderMaxFemale: '2.5',
    };

    expect(validateTournamentCreateStep(state, 2)).toMatchObject({
      genderMinMale: '남성 최소 인원은 0~50명 사이의 정수여야 해요.',
      genderMaxFemale: '여성 최대 인원은 0~50명 사이의 정수여야 해요.',
    });
  });

  it('requires complete payment instructions for a paid tournament', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      entryFee: '50000',
    };

    expect(validateTournamentCreateStep(state, 2)).toMatchObject({
      bankName: '유료 대회는 은행명이 필요해요.',
      bankAccount: '유료 대회는 계좌번호가 필요해요.',
      bankHolder: '유료 대회는 예금주가 필요해요.',
    });
  });

  it('rejects promo priorities outside the API integer range', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      promoHome: { ...INITIAL_TOURNAMENT_CREATE_STATE.promoHome, priority: '-1' },
      promoList: { ...INITIAL_TOURNAMENT_CREATE_STATE.promoList, priority: '2.5' },
    };

    expect(validateTournamentCreateStep(state, 3)).toMatchObject({
      promoHomePriority: '홈 홍보 우선순위는 0~9999 사이의 정수여야 해요.',
      promoListPriority: '목록 홍보 우선순위는 0~9999 사이의 정수여야 해요.',
    });
  });
});

describe('AdminTournamentsNewPage — 4단계(공개 확인)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsValue = new URLSearchParams();
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false });
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }],
      isPending: false,
    });
    useV1AdminTournamentsMock.mockReturnValue({
      data: {
        items: [previousTournament()],
        pageInfo: { nextCursor: null, hasNext: false },
        summary: { total: 1, byStatus: {} },
      },
      isPending: false,
    });
    useV1AdminTournamentMock.mockReturnValue({ data: undefined, isPending: false });
    useV1CreateTournamentMock.mockReturnValue({ mutate: createMutate, isPending: false });
    useV1UpdateTournamentMock.mockReturnValue({ mutate: updateMutate, isPending: false });
    useV1ChangeTournamentStatusMock.mockReturnValue({ mutate: changeStatusMutate, isPending: false });
    useV1LineupSizeOptionsMock.mockReturnValue({
      data: {
        sportId: 'sport-futsal',
        supported: true,
        options: [5, 6],
        defaultMaxPlayers: 6,
        substitutionModes: ['limited', 'rolling'],
        defaultSubstitutionMode: 'rolling',
        defaultMaxSubstitutions: null,
      },
      isPending: false,
    });
    uploadMutateAsync.mockResolvedValue({ urls: ['/uploads/cover-test.webp'] });
    useV1UploadImagesMock.mockReturnValue({ mutateAsync: uploadMutateAsync, isPending: false });
  });

  it('상금·홍보 단계에서 CTA는 "다음"이 아니라 실제로 일어날 일(대회 만들기)을 말한다', () => {
    renderPage();
    goToPresentationStep();

    expect(screen.getByRole('button', { name: '대회 만들기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
  });

  it('상금·홍보 단계에서 대회를 만들면 관리 화면으로 튕기지 않고 확인 단계(5/5)로 진행한다', () => {
    createMutate.mockImplementation(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament()),
    );
    renderPage();
    goToPresentationStep();

    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    // 관리 화면(/admin/tournaments/:id)으로 즉시 이동하지 않는다 — 위저드 안에 남는다.
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByText('STEP 5 / 5')).toBeInTheDocument();
    expect(screen.getByText('참가자에게 이렇게 보여요')).toBeInTheDocument();
    // 확인 단계는 실제 목록 카드 컴포넌트를 그대로 재사용한다 — 새로 그린 목업이 아니다.
    expect(screen.getByText('2026 서울 풋살 오픈')).toBeInTheDocument();
    // 새로고침해도 같은 초안을 이어가도록 draftId를 URL에 남긴다.
    expect(routerReplace).toHaveBeenCalledWith('/admin/tournaments/new?draftId=draft-1');
  });

  it('확인 단계에서 이전으로 돌아가 다시 저장해도 새로 만들지 않고 수정만 한다 — 중복 생성 방지', () => {
    const draft = fakeDraftTournament();
    createMutate.mockImplementation(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) => opts.onSuccess(draft),
    );
    updateMutate.mockImplementation(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) => opts.onSuccess(draft),
    );
    renderPage();
    goToPresentationStep();
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
    expect(createMutate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /이전/ }));
    expect(screen.getByText('STEP 4 / 5')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: '저장하고 계속하기' });
    fireEvent.click(saveButton);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    // 몇 번을 오가도 POST(생성)는 최초 1번뿐이어야 한다.
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it('확인 단계의 "접수 시작하기"는 확인 모달을 거쳐야만 실제로 상태를 바꾼다', async () => {
    createMutate.mockImplementation(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament()),
    );
    renderPage();
    goToPresentationStep();
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    fireEvent.click(screen.getByRole('button', { name: '접수 시작하기' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/되돌릴 수 없어요/)).toBeInTheDocument();
    // 모달만 뜨고 아직 실제 전환은 일어나지 않는다.
    expect(changeStatusMutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '접수 시작하기' }));

    await waitFor(() => expect(changeStatusMutate).toHaveBeenCalledTimes(1));
    expect(changeStatusMutate).toHaveBeenCalledWith({ status: 'open' }, expect.anything());
  });

  it('확인 단계의 "취소"를 누르면 모달만 닫히고 상태는 바뀌지 않는다', async () => {
    createMutate.mockImplementation(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament()),
    );
    renderPage();
    goToPresentationStep();
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
    fireEvent.click(screen.getByRole('button', { name: '접수 시작하기' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(changeStatusMutate).not.toHaveBeenCalled();
  });

  it('"나중에 하기"는 상태를 바꾸지 않고 관리 화면으로만 이동한다', () => {
    createMutate.mockImplementation(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament()),
    );
    renderPage();
    goToPresentationStep();
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    fireEvent.click(screen.getByRole('button', { name: '나중에 하기' }));

    expect(changeStatusMutate).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith('/admin/tournaments/draft-1');
  });

  it('공개 확인 스텝 버튼은 초안이 생기기 전에는 잠겨 있고 접근 가능한 이름을 갖는다', () => {
    renderPage();

    const confirmStepButton = screen.getByRole('button', { name: /5단계 공개 확인/ });
    expect(confirmStepButton).toBeDisabled();
  });

  it('대회 형식 라디오의 접근성 이름은 enum 원시값이 아니라 한국어 라벨이다', () => {
    renderPage();

    expect(screen.getByRole('radio', { name: '조별리그 + 토너먼트' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'group_knockout' })).not.toBeInTheDocument();
  });

  it('새로고침 후 draftId만 남아 있어도 새로 만들지 않고 확인 단계를 그대로 이어서 보여준다', () => {
    searchParamsValue = new URLSearchParams('draftId=draft-1');
    useV1AdminTournamentMock.mockReturnValue({ data: fakeDraftTournament(), isPending: false });

    renderPage();

    expect(screen.getByText('STEP 5 / 5')).toBeInTheDocument();
    expect(screen.getByText('2026 서울 풋살 오픈')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('이미 접수가 시작된 대회로 ?draftId가 남아 있으면 위저드 대신 관리 화면으로 보낸다', () => {
    searchParamsValue = new URLSearchParams('draftId=draft-1');
    useV1AdminTournamentMock.mockReturnValue({
      data: fakeDraftTournament({ status: 'open' }),
      isPending: false,
    });

    renderPage();

    expect(routerReplace).toHaveBeenCalledWith('/admin/tournaments/draft-1');
  });
  describe('홍보 카드 사실 문구 자동 채움', () => {
    /** 날짜·팀 수·장소·총 상금을 넣은 상태 — 홍보 문구의 출처가 되는 앞 단계 값이다. */
    function stateWithTournamentInfo() {
      return [
        { type: 'set-scheduled-at', value: '2026-08-29T09:00' },
        { type: 'set-field', field: 'scheduledEndAt', value: '2026-08-29T18:00' },
        { type: 'set-field', field: 'teamCount', value: '16' },
        { type: 'set-field', field: 'venue', value: '서울월드컵보조경기장' },
        { type: 'set-field', field: 'prizePool', value: '3000000' },
      ].reduce<TournamentCreateState>(
        (state, action) => tournamentCreateReducer(state, action as TournamentCreateAction),
        INITIAL_TOURNAMENT_CREATE_STATE,
      );
    }

    it('앞 단계 대회 정보를 넣으면 두 홍보 카드의 날짜·장소·상금 문구가 채워진다', () => {
      const state = stateWithTournamentInfo();

      for (const promo of [state.promoHome, state.promoList]) {
        expect(promo).toMatchObject({
          dateText: '8월 29일 (토)',
          locationText: '서울월드컵보조경기장',
          prizeText: '총 상금 3,000,000원',
        });
      }
    });

    it('강조 문구는 팀 수로 자동 채우지 않는다 — 운영에서 상태 문구로 쓰는 자리다', () => {
      const state = stateWithTournamentInfo();

      expect(state.promoHome.teamsText).toBe('');
      expect(state.promoList.teamsText).toBe('');
    });

    it('관리자가 고친 문구는 앞 단계 값을 다시 바꿔도 그대로 둔다', () => {
      const edited = tournamentCreateReducer(stateWithTournamentInfo(), {
        type: 'set-promo',
        slot: 'promoHome',
        value: { ...stateWithTournamentInfo().promoHome, locationText: '수원 실내구장 A코트' },
      });

      const relocated = tournamentCreateReducer(edited, {
        type: 'set-field',
        field: 'venue',
        value: '수원종합운동장',
      });

      expect(relocated.promoHome.locationText).toBe('수원 실내구장 A코트');
      // 손대지 않은 목록 카드는 새 값을 그대로 따라간다.
      expect(relocated.promoList.locationText).toBe('수원종합운동장');
    });

    it('관리자가 빈 칸으로 지운 문구는 다시 채우지 않는다', () => {
      const cleared = tournamentCreateReducer(stateWithTournamentInfo(), {
        type: 'set-promo',
        slot: 'promoList',
        value: { ...stateWithTournamentInfo().promoList, prizeText: '' },
      });

      const repriced = tournamentCreateReducer(cleared, {
        type: 'set-field',
        field: 'prizePool',
        value: '5000000',
      });

      expect(repriced.promoList.prizeText).toBe('');
      expect(repriced.promoHome.prizeText).toBe('총 상금 5,000,000원');
    });

    it('되돌릴 파생값이 없는 칸도 다시 채우기로 비워진다 — 버튼이 무반응처럼 보이던 결함', () => {
      // 장소·상금을 앞 단계에서 입력하지 않아 파생값이 빈 칸인 상태에서, 관리자가 문구만
      // 직접 써 넣었다. 이때 "다시 채우기"가 그 칸을 건너뛰면 버튼이 아무 일도 안 한 것처럼
      // 보인다(alpha 재현 확인).
      const dated = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, {
        type: 'set-scheduled-at',
        value: '2026-08-29T09:00',
      });
      const typed = tournamentCreateReducer(dated, {
        type: 'set-promo',
        slot: 'promoHome',
        value: { ...dated.promoHome, locationText: '직접 쓴 장소', prizeText: '직접 쓴 상금' },
      });

      expect(hasPromoFactEdits(typed, 'promoHome')).toBe(true);

      const reset = tournamentCreateReducer(typed, {
        type: 'reset-promo-facts',
        slot: 'promoHome',
      });

      expect(reset.promoHome.locationText).toBe('');
      expect(reset.promoHome.prizeText).toBe('');
      // 파생값이 있는 날짜는 그대로 유지된다.
      expect(reset.promoHome.dateText).toBe('8월 29일 (토)');
      // 되돌린 뒤에는 되돌릴 것이 없다 — 버튼이 비활성으로 바뀐다.
      expect(hasPromoFactEdits(reset, 'promoHome')).toBe(false);
    });

    it('직접 고친 문구가 없으면 되돌릴 것도 없다고 알린다', () => {
      const state = stateWithTournamentInfo();

      expect(hasPromoFactEdits(state, 'promoHome')).toBe(false);
      expect(hasPromoFactEdits(state, 'promoList')).toBe(false);
    });

    it('초안 저장 후 새로고침해도 자동으로 채워졌던 문구는 계속 대회 정보를 따라간다', () => {
      // 서버에는 자동 파생 문구도 그대로 저장된다 — 저장돼 있다는 이유만으로 dirty로 굳으면
      // 새로고침 뒤 일정·장소를 고쳐도 홍보 문구가 옛 값에 멈춘다.
      const hydrated = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, {
        type: 'hydrate-from-draft',
        tournament: fakeDraftTournament({
          venue: '서울월드컵보조경기장',
          // 관리자가 손대지 않아 파생값 그대로 저장된 문구
          promoHomeLocationText: '서울월드컵보조경기장',
          // 관리자가 직접 고쳐 저장한 문구
          promoHomePrizeText: '🎁 특별 상품 증정',
        }),
      });

      const relocated = tournamentCreateReducer(hydrated, {
        type: 'set-field',
        field: 'venue',
        value: '수원종합운동장',
      });

      expect(relocated.promoHome.locationText).toBe('수원종합운동장');
      expect(relocated.promoHome.prizeText).toBe('🎁 특별 상품 증정');
    });

    it('"대회 정보로 다시 채우기"는 해당 카드만 현재 대회 정보로 되돌린다', () => {
      const edited = tournamentCreateReducer(stateWithTournamentInfo(), {
        type: 'set-promo',
        slot: 'promoHome',
        value: {
          ...stateWithTournamentInfo().promoHome,
          dateText: '이번 주말 단 하루',
          locationText: '',
        },
      });
      const editedList = tournamentCreateReducer(edited, {
        type: 'set-promo',
        slot: 'promoList',
        value: { ...edited.promoList, locationText: '목록 전용 장소' },
      });

      const reset = tournamentCreateReducer(editedList, {
        type: 'reset-promo-facts',
        slot: 'promoHome',
      });

      expect(reset.promoHome).toMatchObject({
        dateText: '8월 29일 (토)',
        locationText: '서울월드컵보조경기장',
      });
      expect(reset.promoList.locationText).toBe('목록 전용 장소');
    });
  });
});
