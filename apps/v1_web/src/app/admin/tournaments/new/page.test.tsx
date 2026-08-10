import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminTournaments,
  useV1CreateTournament,
  useV1LineupSizeOptions,
  useV1MasterSports,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import AdminTournamentsNewPage from './page';
import {
  INITIAL_TOURNAMENT_CREATE_STATE,
  buildTournamentCreatePayload,
  tournamentCreateReducer,
  validateTournamentCreateStep,
} from './tournament-create-model';
import type { V1Tournament } from '@/types/api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/tournaments/new',
}));

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminTournaments: vi.fn(),
  useV1CreateTournament: vi.fn(),
  useV1LineupSizeOptions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1UploadImages: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1AdminTournamentsMock = vi.mocked(useV1AdminTournaments, { partial: true });
const useV1CreateTournamentMock = vi.mocked(useV1CreateTournament, { partial: true });
const useV1LineupSizeOptionsMock = vi.mocked(useV1LineupSizeOptions, { partial: true });
const useV1MasterSportsMock = vi.mocked(useV1MasterSports, { partial: true });
const useV1UploadImagesMock = vi.mocked(useV1UploadImages, { partial: true });
const createMutate = vi.fn();
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

function goToParticipationStep() {
  goToScheduleStep();
  fillScheduleStep();
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}

describe('AdminTournamentsNewPage four-step wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false });
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', name: '풋살', levels: [] }],
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
    useV1CreateTournamentMock.mockReturnValue({
      mutate: createMutate,
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
