import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { savePeriodsMutate } = vi.hoisted(() => ({ savePeriodsMutate: vi.fn() }));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => ({ data: undefined }),
  useSaveTournamentPeriodSettings: () => ({ mutate: savePeriodsMutate, isPending: false }),
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

// jsdom 은 scrollIntoView 를 구현하지 않는다 — 불가피한 브라우저 API 스텁. 파일 전체에 두고 복구한다.
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

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
  // **시계를 고정한다.** 이 스위트의 픽스처는 `2026-08-15` 같은 고정 날짜로 대회 시작을 넣고,
  // 자동 제안된 신청 마감(D-3)의 **정확한 값**을 단언한다. 그 날짜들이 과거가 되는 순간
  // "마감은 지금 이후" 규칙에 걸려 step 1 을 못 넘고, 뒤 단계 요소를 못 찾아 12건이 한꺼번에
  // 깨진다(2026-09-04 실측). 이건 새 규칙이 만든 문제라기보다 **시간이 흐르면 어차피 깨질
  // 픽스처**였다 — 시계를 픽스처보다 앞선 시점에 고정해 단언을 그대로 살리고 결정적으로 만든다.
  // `shouldAdvanceTime` 이 있어야 testing-library 의 `findBy*`/`waitFor` 가 멈추지 않는다.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
        defaultPeriods: [
          { label: '전반', durationMinutes: 20 },
          { label: '후반', durationMinutes: 20 },
        ],
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

  it('경기 시간: 종목 기본 전·후반이 채워지고, 단판으로 바꿔 고치면 대회를 만든 직후 피리어드 설정으로 저장한다', () => {
    createMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament({ updatedAt: '2026-08-01T00:00:00.000Z' })),
    );
    renderPage();
    goToParticipationStep();

    expect(screen.getByLabelText('전반 시간(분)')).toHaveValue(20);
    expect(screen.getByLabelText('후반 시간(분)')).toHaveValue(20);
    expect(screen.getByText('한 경기 총 40분')).toBeInTheDocument();

    // 전·후반 없는 단판 — 합계를 지켜 40분 한 판이 되고, 그 길이를 고칠 수 있다.
    fireEvent.click(within(screen.getByRole('group', { name: '경기 방식 선택' })).getByRole('button', { name: '단판' }));
    expect(screen.queryByLabelText('전반 시간(분)')).toBeNull();
    expect(screen.getByLabelText('단판 시간(분)')).toHaveValue(40);
    fireEvent.change(screen.getByLabelText('단판 시간(분)'), { target: { value: '30' } });
    expect(screen.getByText('한 경기 총 30분')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(savePeriodsMutate).toHaveBeenCalledWith(
      { tournamentId: 'draft-1', expectedVersion: '2026-08-01T00:00:00.000Z', periods: [{ durationMinutes: 30 }] },
      expect.any(Object),
    );
  });

  it('경기 시간: 기본값 그대로 만들면 피리어드 설정을 따로 저장하지 않는다', () => {
    createMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) => opts.onSuccess(fakeDraftTournament()),
    );
    renderPage();
    goToPresentationStep();
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(savePeriodsMutate).not.toHaveBeenCalled();
  });

  it('경기 시간: 피리어드 저장이 끝나기 전에는 공개 확인과 접수 시작을 열지 않는다', () => {
    createMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) => opts.onSuccess(fakeDraftTournament()),
    );
    renderPage();
    goToParticipationStep();
    fireEvent.change(screen.getByLabelText('전반 시간(분)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    expect(savePeriodsMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '접수 시작하기' })).toBeNull();
    expect(screen.getByRole('button', { name: /공개 확인/ })).toBeDisabled();
    expect(routerReplace).toHaveBeenCalledWith('/admin/tournaments/new?draftId=draft-1');
  });

  it('경기 시간: 저장 실패 후 입력과 초안을 유지하고 재시도하면 중복 생성 없이 최신 버전으로 계속한다', () => {
    const createdVersion = '2026-08-01T00:00:00.000Z';
    const updatedVersion = '2026-08-01T00:01:00.000Z';
    const periodsVersion = '2026-08-01T00:02:00.000Z';
    createMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament({ updatedAt: createdVersion })),
    );
    savePeriodsMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onError: (error: Error) => void }) => opts.onError(new Error('경기 시간 저장 실패')),
    );
    renderPage();
    goToParticipationStep();
    fireEvent.change(screen.getByLabelText('전반 시간(분)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

    expect(screen.getByText('경기 시간 저장 실패')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '접수 시작하기' })).toBeNull();
    expect(screen.getByRole('button', { name: /공개 확인/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /이전/ }));
    expect(screen.getByLabelText('전반 시간(분)')).toHaveValue(15);
    expect(screen.getByLabelText('후반 시간(분)')).toHaveValue(20);
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    updateMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onSuccess: (t: V1Tournament) => void }) =>
        opts.onSuccess(fakeDraftTournament({ updatedAt: updatedVersion })),
    );
    savePeriodsMutate.mockImplementationOnce(
      (_payload: unknown, opts: { onSuccess: (result: { expectedVersion: string }) => void }) =>
        opts.onSuccess({ expectedVersion: periodsVersion }),
    );
    fireEvent.click(screen.getByRole('button', { name: '저장하고 계속하기' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: createdVersion }), expect.any(Object));
    expect(savePeriodsMutate).toHaveBeenLastCalledWith(
      { tournamentId: 'draft-1', expectedVersion: updatedVersion, periods: [{ durationMinutes: 15 }, { durationMinutes: 20 }] },
      expect.any(Object),
    );
    expect(screen.getByRole('button', { name: '접수 시작하기' })).toBeEnabled();
    expect(changeStatusMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /이전/ }));
    fireEvent.click(screen.getByRole('button', { name: '저장하고 계속하기' }));
    expect(updateMutate).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: periodsVersion }), expect.any(Object));
    expect(savePeriodsMutate).toHaveBeenCalledTimes(2);
  });

  it('경기 시간: 1~240분 정수가 아니면 다음 단계로 못 넘어간다', () => {
    renderPage();
    goToParticipationStep();

    fireEvent.change(screen.getByLabelText('후반 시간(분)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    expect(screen.getByText(/경기 시간은 피리어드마다 1~240분/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '대회 만들기' })).toBeNull();
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

  it('T2 proposes a D-3 registration deadline without overwriting manual edits, and leaves the roster deadline empty', () => {
    renderPage();
    goToScheduleStep();

    const start = screen.getByLabelText(/대회 시작/);
    fireEvent.change(start, { target: { value: '2026-08-15T09:00' } });

    expect(screen.getByLabelText(/신청 마감/)).toHaveValue('2026-08-12T23:59');
    expect(screen.getByLabelText(/명단 제출 마감/)).toHaveValue('');
    expect(screen.getByLabelText(/명단 제출 마감/)).not.toBeRequired();

    fireEvent.change(screen.getByLabelText(/신청 마감/), {
      target: { value: '2026-08-10T20:00' },
    });
    fireEvent.change(start, { target: { value: '2026-08-22T09:00' } });

    expect(screen.getByLabelText(/신청 마감/)).toHaveValue('2026-08-10T20:00');
    expect(screen.getByLabelText(/명단 제출 마감/)).toHaveValue('');
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

  describe('상금 행 모바일 전체 폭 — 실제 생성 caller (#1439)', () => {
    it('실제 공유 편집기에 mobile 전체 span과 sm 3열을 연결하고 이름→내용→삭제 Tab 순서를 유지한다', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderPage();
      goToPresentationStep();

      // jsdom은 Tailwind breakpoint의 실제 pixel 배치를 계산하지 않는다.
      // 실제 caller가 렌더한 class/DOM 연결과 Tab만 검증하며 3폭 after는 alpha에서 확인한다.
      for (const index of [1, 2, 3]) {
        const name = screen.getByRole('combobox', { name: `상금 항목 ${index} 이름` });
        const value = screen.getByRole('textbox', { name: `상금 항목 ${index} 내용` });
        const remove = screen.getByRole('button', { name: `상금 항목 ${index} 삭제` });
        const row = name.parentElement;
        expect(row).toHaveClass(
          'grid-cols-[minmax(0,1fr)_44px]',
          'sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px]',
        );
        expect(value).toHaveClass(
          'col-span-2', 'col-start-1', 'row-start-2',
          'sm:col-span-1', 'sm:col-start-2', 'sm:row-start-1',
          'h-[44px]', 'w-full',
        );
        expect(remove).toHaveClass('col-start-2', 'row-start-1', 'sm:col-start-3', 'h-[44px]', 'w-[44px]');
        expect(Array.from(row!.querySelectorAll('input, button'))).toEqual([name, value, remove]);
      }

      screen.getByRole('combobox', { name: '상금 항목 1 이름' }).focus();
      await user.tab();
      expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: '상금 항목 1 삭제' })).toHaveFocus();
      expect(createMutate).not.toHaveBeenCalled();
      expect(updateMutate).not.toHaveBeenCalled();
    });

    it('연속 입력과 이전·다음 왕복 뒤 현금·물품 미리보기와 실제 submit 직렬화를 보존한다', () => {
      // API 응답 callback은 합성 fixture다. 아래는 실제 wizard/editor state와 outgoing
      // payload 계약을 검증하며 서버 저장·새로고침 roundtrip을 증명하지 않는다.
      createMutate.mockImplementationOnce(
        (_payload: unknown, opts: { onSuccess: (value: V1Tournament) => void }) =>
          opts.onSuccess(fakeDraftTournament()),
      );
      renderPage();
      goToPresentationStep();
      fireEvent.click(screen.getByRole('button', { name: '상금 항목 3 삭제' }));
      fireEvent.change(screen.getByRole('textbox', { name: '총상금' }), { target: { value: '600000' } });
      fireEvent.change(screen.getByRole('combobox', { name: '상금 항목 1 이름' }), { target: { value: '우승' } });
      const cash = screen.getByRole('textbox', { name: '상금 항목 1 내용' });
      cash.focus();
      for (const value of ['6', '600', '600000']) {
        fireEvent.change(cash, { target: { value } });
        expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toBe(cash);
        expect(cash).toHaveValue(value);
        expect(cash).toHaveFocus();
      }
      fireEvent.change(screen.getByRole('combobox', { name: '상금 항목 2 이름' }), { target: { value: '상품' } });
      fireEvent.change(screen.getByRole('textbox', { name: '상금 항목 2 내용' }), {
        target: { value: '우승 트로피·상품권' },
      });
      fireEvent.change(screen.getByLabelText('상품 및 상금 요약'), { target: { value: '현금과 물품 시상' } });

      fireEvent.click(screen.getByRole('button', { name: /이전/ }));
      expect(screen.queryByRole('textbox', { name: '상금 항목 1 내용' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getByRole('textbox', { name: '총상금' })).toHaveValue('600,000');
      expect(screen.getByRole('combobox', { name: '상금 항목 1 이름' })).toHaveValue('우승');
      expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toHaveValue('600000');
      expect(screen.getByRole('combobox', { name: '상금 항목 2 이름' })).toHaveValue('상품');
      expect(screen.getByRole('textbox', { name: '상금 항목 2 내용' })).toHaveValue('우승 트로피·상품권');
      expect(screen.queryByRole('combobox', { name: '상금 항목 3 이름' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('상품 및 상금 요약')).toHaveValue('현금과 물품 시상');
      expect(screen.getByText('600,000원')).toBeInTheDocument();
      expect(screen.getByText('우승 트로피·상품권')).toBeInTheDocument();
      expect(screen.getByText('배분 합계 600,000원')).toBeInTheDocument();
      expect(createMutate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

      expect(createMutate).toHaveBeenCalledTimes(1);
      expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({
        prizePool: 600000,
        prizeSummary: '현금과 물품 시상',
        prizeBreakdown: '우승 600,000원 / 상품 우승 트로피·상품권',
      }), expect.anything());
      expect(updateMutate).not.toHaveBeenCalled();
      expect(screen.getByText('STEP 5 / 5')).toBeInTheDocument();
      expect(routerReplace).toHaveBeenCalledWith('/admin/tournaments/new?draftId=draft-1');
    });
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

  it('rejects promo priorities outside the API integer range on enabled cards', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      promoHome: { ...INITIAL_TOURNAMENT_CREATE_STATE.promoHome, enabled: true, priority: '-1' },
      promoList: { ...INITIAL_TOURNAMENT_CREATE_STATE.promoList, enabled: true, priority: '2.5' },
    };

    expect(validateTournamentCreateStep(state, 3)).toMatchObject({
      promoHomePriority: '홈 홍보 우선순위는 0~9999 사이의 정수여야 해요.',
      promoListPriority: '목록 홍보 우선순위는 0~9999 사이의 정수여야 해요.',
    });
  });

  it('꺼진 홍보 카드의 잘못된 우선순위도 서버 DTO 처럼 막고 값은 바꾸지 않는다', () => {
    const state = {
      ...INITIAL_TOURNAMENT_CREATE_STATE,
      promoHome: { ...INITIAL_TOURNAMENT_CREATE_STATE.promoHome, enabled: false, priority: '-1' },
    };

    expect(validateTournamentCreateStep(state, 3)).toMatchObject({
      promoHomePriority: '홈 홍보 우선순위는 0~9999 사이의 정수여야 해요.',
    });
  });
});

describe('AdminTournamentsNewPage — 4단계(공개 확인)', () => {
  // **시계를 고정한다.** 이 스위트의 픽스처는 `2026-08-15` 같은 고정 날짜로 대회 시작을 넣고,
  // 자동 제안된 신청 마감(D-3)의 **정확한 값**을 단언한다. 그 날짜들이 과거가 되는 순간
  // "마감은 지금 이후" 규칙에 걸려 step 1 을 못 넘고, 뒤 단계 요소를 못 찾아 12건이 한꺼번에
  // 깨진다(2026-09-04 실측). 이건 새 규칙이 만든 문제라기보다 **시간이 흐르면 어차피 깨질
  // 픽스처**였다 — 시계를 픽스처보다 앞선 시점에 고정해 단언을 그대로 살리고 결정적으로 만든다.
  // `shouldAdvanceTime` 이 있어야 testing-library 의 `findBy*`/`waitFor` 가 멈추지 않는다.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
        defaultPeriods: [
          { label: '전반', durationMinutes: 20 },
          { label: '후반', durationMinutes: 20 },
        ],
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

  describe('홍보 카드 켠 것만 펼치기 (#1439)', () => {
    it('꺼진 홍보 카드는 입력 없이 한 줄 요약과 꺼진 스위치만 보인다', () => {
      renderPage();
      goToPresentationStep();

      expect(screen.queryByLabelText('카드 제목')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('노출 우선순위')).not.toBeInTheDocument();
      for (const name of ['홈 오늘의 추천 노출', '대회 목록 상단 노출']) {
        expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
      }
    });

    it('스위치로 켜면 입력이 펼쳐지고 포커스가 스위치에 남으며, 껐다 켜도 값이 남고 payload 는 그대로 간다', () => {
      renderPage();
      goToPresentationStep();

      fireEvent.click(screen.getByRole('switch', { name: '홈 오늘의 추천 노출' }));
      const on = screen.getByRole('switch', { name: '홈 오늘의 추천 노출' });
      expect(on).toHaveAttribute('aria-checked', 'true');
      expect(on.querySelector('.tm-toggle')).toHaveClass('tm-toggle-on');
      on.focus();
      fireEvent.change(screen.getByLabelText('카드 제목'), { target: { value: '이번 주 추천' } });
      fireEvent.click(on);

      const off = screen.getByRole('switch', { name: '홈 오늘의 추천 노출' });
      expect(off).toHaveAttribute('aria-checked', 'false');
      expect(off).toHaveFocus();
      expect(screen.queryByLabelText('카드 제목')).not.toBeInTheDocument();
      expect(screen.getByText('꺼짐 · 입력한 항목 1개 보관 중')).toBeInTheDocument();
      // 노브 위치는 저장소 공용 스위치(.tm-toggle)가 정한다 — 손으로 만든 트랙을 쓰면 노브가 트랙을 벗어난다.
      expect(off.querySelector('.tm-toggle')).not.toHaveClass('tm-toggle-on');

      fireEvent.click(off);
      expect(screen.getByLabelText('카드 제목')).toHaveValue('이번 주 추천');
      fireEvent.click(screen.getByRole('switch', { name: '홈 오늘의 추천 노출' }));
      fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
      expect(createMutate.mock.calls[0][0]).toMatchObject({
        promoHomeEnabled: false,
        promoHomeTitle: '이번 주 추천',
        promoListEnabled: false,
      });
    });

    it('꺼진 카드에 잘못된 우선순위가 있으면 제출이 막히고 그 카드가 펼쳐져 입력에 포커스한다', () => {
      renderPage();
      goToPresentationStep();

      fireEvent.click(screen.getByRole('switch', { name: '대회 목록 상단 노출' }));
      fireEvent.change(screen.getByLabelText('노출 우선순위'), { target: { value: '-3' } });
      fireEvent.click(screen.getByRole('switch', { name: '대회 목록 상단 노출' }));
      expect(screen.queryByLabelText('노출 우선순위')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '대회 만들기' }));

      expect(createMutate).not.toHaveBeenCalled();
      const input = screen.getByLabelText('노출 우선순위');
      expect(input).toHaveValue(-3);
      expect(input).toHaveFocus();
      // 오류로 펼쳐졌어도 스위치는 실제 상태(꺼짐)를 말한다.
      expect(screen.getByRole('switch', { name: '대회 목록 상단 노출' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });
  });

  describe('같은 단계 키보드 focus의 footer 가림 회복 (#1439 후속)', () => {
    const restores: (() => void)[] = [];
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    let container: HTMLDivElement;

    function patch(target: object, key: string, value: unknown) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      Object.defineProperty(target, key, { configurable: true, writable: true, value });
      restores.push(() => descriptor ? Object.defineProperty(target, key, descriptor) : Reflect.deleteProperty(target, key));
    }

    function flushFocusFrames() {
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(0);
      });
    }

    async function layout(options: {
      internal?: boolean; width?: number; height?: number; footerTop?: number;
      fieldTop?: number; visualHeight?: number;
    } = {}) {
      const width = options.width ?? 402;
      const height = options.height ?? 606;
      const footerTop = options.footerTop ?? 536.8;
      const initialScroll = 947.2;
      container = document.createElement('div');
      const header = document.createElement('header');
      header.style.position = 'sticky';
      const main = document.createElement('main');
      container.append(header, main);
      container.style.overflowY = options.internal ? 'auto' : 'visible';
      document.body.appendChild(container);
      const scroller = options.internal ? container : document.documentElement;
      patch(document, 'scrollingElement', document.documentElement);
      patch(window, 'innerWidth', width);
      patch(window, 'innerHeight', height);
      patch(window, 'visualViewport', options.visualHeight ? {
        offsetTop: 0, height: options.visualHeight, width, scale: 1,
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
      } : undefined);
      patch(scroller, 'clientHeight', height);
      patch(scroller, 'scrollHeight', height + 2000);
      patch(scroller, 'scrollTop', 0);
      const scrollTo = vi.fn(({ top }: ScrollToOptions) => { scroller.scrollTop = top ?? 0; });
      patch(scroller, 'scrollTo', scrollTo);
      const view = render(<Providers><AdminTournamentsNewPage /></Providers>, { container: main });
      goToPresentationStep();
      await act(async () => {});
      const field = screen.getByRole('textbox', { name: '상금 항목 3 내용' });
      const footer = main.querySelector<HTMLElement>('form > .fixed')!;
      footer.style.position = 'fixed';
      scroller.scrollTop = initialScroll;
      scrollTo.mockClear();
      const origins = new Map<Element | string, number>([[field, initialScroll + (options.fieldTop ?? 539.2625)]]);
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this === footer) return new DOMRect(0, footerTop, width, height - footerTop);
        if (this === container) return new DOMRect(0, 0, width, height);
        if (this === header) return new DOMRect(0, 0, width, width < 1024 ? 52 : 0);
        if (this.matches('input, select, textarea, button, h2')) {
          return new DOMRect(16, (origins.get(this) ?? origins.get(this.id) ?? initialScroll + 200) - scroller.scrollTop, 300, 44);
        }
        return new DOMRect();
      });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
      // Parent alpha rects define the failure boundary. Other rects/scroll/RAF are browser
      // API fixtures: this renders the real wizard/editor but does not resolve CSS or IME.
      return { view, scroller, scrollTo, field, footer, initialScroll, origins };
    }

    beforeEach(() => {
      frames.clear();
      nextFrame = 0;
    });
    afterEach(() => {
      frames.clear();
      vi.restoreAllMocks();
      while (restores.length) restores.pop()?.();
      container?.remove();
    });

    async function tabToThirdValue() {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      screen.getByRole('combobox', { name: '상금 항목 1 이름' }).focus();
      flushFocusFrames();
      for (let index = 0; index < 7; index += 1) {
        await user.tab();
        flushFocusFrames();
      }
      return user;
    }

    it.each([false, true])('모바일 Tab7: 실제 3번 내용을 footer 위로 보인다 (internal=%s)', async (internal) => {
      const { scroller, field, footer, initialScroll } = await layout({ internal });
      await tabToThirdValue();
      expect(field).toHaveFocus();
      expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top - 4 + 0.001);
      expect(scroller.scrollTop).toBeCloseTo(initialScroll + 50.4625);
      for (const value of ['트', '트로피']) {
        fireEvent.change(field, { target: { value } });
        expect(screen.getByRole('textbox', { name: '상금 항목 3 내용' })).toBe(field);
        expect(field).toHaveValue(value);
        expect(field).toHaveFocus();
      }
      expect(createMutate).not.toHaveBeenCalled();
      expect(updateMutate).not.toHaveBeenCalled();
      expect(uploadMutateAsync).not.toHaveBeenCalled();
      expect(changeStatusMutate).not.toHaveBeenCalled();
    });

    it.each([
      { width: 788, height: 505, footerTop: 436, fieldTop: 334.17 },
      { width: 1182, height: 757, footerTop: 688, fieldTop: 460.5 },
    ])('이미 보이는 $width 폭 Tab7은 스크롤하지 않는다', async (spec) => {
      const { field, scroller, scrollTo, initialScroll } = await layout(spec);
      await tabToThirdValue();
      expect(field).toHaveFocus();
      expect(scroller.scrollTop).toBe(initialScroll);
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('Shift+Tab 뒤 다시 같은 내용에 들어와도 가림만 회복한다', async () => {
      const { field, footer, scroller, initialScroll } = await layout();
      const user = await tabToThirdValue();
      await user.tab();
      flushFocusFrames();
      expect(screen.getByRole('button', { name: '상금 항목 3 삭제' })).toHaveFocus();
      scroller.scrollTop = initialScroll;
      await user.tab({ shift: true });
      flushFocusFrames();
      expect(field).toHaveFocus();
      expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top - 4 + 0.001);
    });

    it('빠른 연속 focus는 이전 예약을 취소하고 현재 내용만 회복한다', async () => {
      const { field, scroller, initialScroll, origins, scrollTo } = await layout();
      const current = screen.getByRole('textbox', { name: '상금 항목 2 내용' });
      origins.set(current, initialScroll + 550);
      field.focus();
      current.focus();
      flushFocusFrames();
      expect(current).toHaveFocus();
      expect(current.getBoundingClientRect().bottom).toBeLessThanOrEqual(532.801);
      expect(scroller.scrollTop).toBeCloseTo(initialScroll + 61.2);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('footer focus는 본문 reveal 대상이 아니며 이전 입력 예약도 이동시키지 않는다', async () => {
      const { field, scroller, initialScroll, scrollTo } = await layout();
      field.focus();
      const action = screen.getByRole('button', { name: '대회 만들기' });
      action.focus();
      flushFocusFrames();
      expect(action).toHaveFocus();
      expect(scroller.scrollTop).toBe(initialScroll);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(createMutate).not.toHaveBeenCalled();
    });

    it('줄어든 visual viewport도 현재 control만 보정한다', async () => {
      const { field, scroller, initialScroll } = await layout({ visualHeight: 320 });
      field.focus();
      flushFocusFrames();
      expect(field).toHaveFocus();
      expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(316);
      expect(scroller.scrollTop).toBeCloseTo(initialScroll + 267.2625);
    });

    it('단계 이동으로 사라진 입력의 예약은 새 제목 focus를 덮지 않는다', async () => {
      const { field, scrollTo, scroller } = await layout();
      field.focus();
      fireEvent.click(screen.getByRole('button', { name: /이전/ }));
      const heading = screen.getByRole('heading', { level: 2, name: /참가 조건/ });
      expect(heading).toHaveFocus();
      const stageScroll = scroller.scrollTop;
      scrollTo.mockClear();
      flushFocusFrames();
      expect(heading).toHaveFocus();
      expect(scroller.scrollTop).toBe(stageScroll);
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('첫 오류 control의 기존 smooth center 이동에 RAF 보정을 덧붙이지 않는다', async () => {
      const { origins, scroller, scrollTo } = await layout();
      fireEvent.click(screen.getByRole('button', { name: /이전/ }));
      fireEvent.click(screen.getByRole('button', { name: /이전/ }));
      fireEvent.change(screen.getByLabelText(/대회 시작/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /이전/ }));
      vi.mocked(Element.prototype.scrollIntoView).mockClear();
      origins.set('scheduled-at', scroller.scrollTop + 600);
      scrollTo.mockClear();
      fireEvent.click(screen.getByRole('button', { name: /4단계 상금/ }));
      expect(screen.getByLabelText(/대회 시작/)).toHaveFocus();
      expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
      flushFocusFrames();
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('unmount는 남은 focus 예약을 회수한다', async () => {
      const { field, view, scrollTo } = await layout();
      field.focus();
      const scheduledIds = [...frames.keys()];
      view.unmount();
      expect(vi.mocked(window.cancelAnimationFrame).mock.calls.some(([id]) => scheduledIds.includes(id))).toBe(true);
      flushFocusFrames();
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  describe('단계 전환 시 스크롤·포커스 (#1437)', () => {
    // 모바일 셸처럼 문서가 아니라 안쪽 컨테이너가 스크롤러다(.tm-scroll-area).
    const scrollTo = vi.fn();
    let scroller: HTMLDivElement;

    function renderInScroller(container: HTMLElement = scroller) {
      return render(
        <Providers>
          <AdminTournamentsNewPage />
        </Providers>,
        { container },
      );
    }

    beforeEach(() => {
      scrollTo.mockClear();
      scroller = document.createElement('div');
      scroller.style.overflowY = 'auto';
      scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
      document.body.appendChild(scroller);
    });
    afterEach(() => {
      scroller.remove();
    });

    it('다음 단계로 넘어가면 스크롤을 맨 위로 올리고 새 단계 제목에 포커스를 둔다', () => {
      renderInScroller();
      goToScheduleStep();

      const heading = screen.getByRole('heading', { level: 2, name: /일정/ });
      expect(heading).toHaveFocus();
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    });

    it('이전 단계로 돌아가도 새 단계 제목에 포커스를 둔다', () => {
      renderInScroller();
      goToScheduleStep();
      fireEvent.click(screen.getByRole('button', { name: /이전/ }));

      expect(screen.getByRole('heading', { level: 2, name: /기본 정보/ })).toHaveFocus();
    });

    it('검증에 실패하면 단계는 그대로 두고 첫 오류 필드로 포커스한다', () => {
      renderInScroller();
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getByLabelText(/종목/)).toHaveFocus();
      expect(scrollTo).not.toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    });

    it('혼성 정원 그룹 오류는 그 그룹의 첫 입력(남성 최소)에 포커스한다', () => {
      renderInScroller();
      goToParticipationStep();
      fireEvent.change(screen.getByLabelText(/최대 선수 수/), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText('남성 최소'), { target: { value: '8' } });
      fireEvent.change(screen.getByLabelText('여성 최소'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getByText('성별 최소 인원 합이 최대 선수 수를 넘을 수 없어요.')).toBeInTheDocument();
      expect(screen.getByLabelText('남성 최소')).toHaveFocus();
    });

    const LIMIT_REQUIRED = '교체 횟수를 제한하려면 허용 횟수를 입력해 주세요.';

    it('교체 "제한"에 횟수를 비우면 오류는 입력칸 아래 한 번만 나오고 그 입력에 포커스한다', () => {
      renderInScroller();
      goToParticipationStep();
      fireEvent.click(screen.getByRole('button', { name: '제한' }));
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getAllByText(LIMIT_REQUIRED)).toHaveLength(1);
      expect(screen.getByLabelText(/허용 교체 횟수/)).toHaveFocus();
    });

    it('교체 선택지를 못 불러온 상태에서 "제한"+빈 횟수면 바깥 항목이 오류를 한 번 보여준다', () => {
      const view = renderInScroller();
      goToParticipationStep();
      fireEvent.click(screen.getByRole('button', { name: '제한' }));
      useV1LineupSizeOptionsMock.mockReturnValue({ data: undefined, isPending: false, isError: true });
      view.rerender(
        <Providers>
          <AdminTournamentsNewPage />
        </Providers>,
      );
      expect(screen.queryByLabelText(/허용 교체 횟수/)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getAllByText(LIMIT_REQUIRED)).toHaveLength(1);
    });

    it('일정 단계에서 날짜를 비우고 넘기면 화면 순서상 첫 오류인 대회 시작 입력에 포커스한다', () => {
      renderInScroller();
      goToScheduleStep();
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getByText('대회 시작 일시를 선택해 주세요.')).toBeInTheDocument();
      expect(screen.getByLabelText(/대회 시작/)).toHaveFocus();
    });

    it('종목만 채우고 넘기면 두 번째 오류 필드(대회명)로 포커스한다', () => {
      renderInScroller();
      fireEvent.change(screen.getByLabelText(/종목/), { target: { value: 'sport-futsal' } });
      fireEvent.click(screen.getByRole('button', { name: /다음/ }));

      expect(screen.getByLabelText(/대회명/)).toHaveFocus();
    });

    describe('작은 viewport의 단계 시작 가림 — 실제 page/geometry 경계', () => {
      const viewports = [
        { name: '모바일', width: 403, height: 606, headingTop: 431.375, controlTop: 556.175, footerTop: 538 },
        { name: '태블릿', width: 788, height: 505, headingTop: 448, controlTop: 572.667, footerTop: 437 },
        { name: '데스크톱', width: 1182, height: 758, headingTop: 384, controlTop: 509, footerTop: 690 },
      ];
      const restores: (() => void)[] = [];
      function patch(target: object, key: string, value: unknown) {
        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        Object.defineProperty(target, key, { configurable: true, writable: true, value });
        restores.push(() => descriptor ? Object.defineProperty(target, key, descriptor) : Reflect.deleteProperty(target, key));
      }
      afterEach(() => {
        vi.restoreAllMocks();
        while (restores.length) restores.pop()?.();
      });

      function layout(spec = viewports[0], options: { document?: boolean; clipTop?: number; maxScroll?: number; visual?: { offsetTop: number; height: number }; reduced?: boolean; distinctControls?: boolean } = {}) {
        const clipTop = options.clipTop ?? 0;
        const headerHeight = spec.width < 1024 ? 52 : 0;
        const header = document.createElement('header');
        header.style.position = 'sticky';
        const main = document.createElement('main');
        scroller.append(header, main);
        const target = options.document ? document.documentElement : scroller;
        scroller.style.overflowY = options.document ? 'visible' : 'auto';
        if (options.document) patch(document, 'scrollingElement', target);
        patch(target, 'clientHeight', spec.height - clipTop);
        patch(target, 'scrollHeight', spec.height - clipTop + (options.maxScroll ?? 2000));
        patch(target, 'scrollTop', 0);
        patch(target, 'scrollTo', scrollTo);
        scrollTo.mockImplementation(({ top }: ScrollToOptions) => { target.scrollTop = top ?? 0; });
        patch(window, 'innerHeight', spec.height);
        patch(window, 'visualViewport', options.visual ? {
          ...options.visual, offsetLeft: 0, width: spec.width, scale: 1, pageTop: options.visual.offsetTop, pageLeft: 0,
          addEventListener: vi.fn(), removeEventListener: vi.fn(),
        } : undefined);
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
          matches: Boolean(options.reduced && query.includes('prefers-reduced-motion')),
          media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
          addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => true,
        }));
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
          if (this === header) return new DOMRect(0, clipTop, spec.width, headerHeight);
          if (this === scroller) return new DOMRect(0, clipTop, spec.width, spec.height - clipTop);
          if (this.matches('form > .fixed')) return new DOMRect(0, spec.footerTop, spec.width, spec.height - spec.footerTop);
          if (this.tagName === 'H2') return new DOMRect(0, spec.headingTop + clipTop - target.scrollTop, spec.width, 28);
          if (this.matches('input, select, textarea, button')) {
            const controlTop = options.distinctControls && this.id !== 'team-count' ? spec.footerTop + 100 : spec.controlTop;
            return new DOMRect(0, controlTop + clipTop - target.scrollTop, 200, 44);
          }
          return new DOMRect();
        });
        // 제목/입력 좌표는 공개 원본과 같은 경계, footer는 합성 fixture다. 실제 CSS 검증이 아니다.
        renderInScroller(main);
        return { target, headerHeight };
      }

      it.each(viewports)('$name: 다음 단계의 제목과 첫 입력이 header/footer 안에 보이고 생성하지 않는다', (spec) => {
        const { target, headerHeight } = layout(spec);
        goToScheduleStep();
        fillScheduleStep();
        target.scrollTop = 900;
        scrollTo.mockClear();
        fireEvent.click(screen.getByRole('button', { name: /다음/ }));
        const heading = screen.getByRole('heading', { level: 2, name: /참가 조건/ });
        const control = screen.getByLabelText(/참가 팀 수/);
        expect(heading).toHaveFocus();
        expect(heading.getBoundingClientRect().top).toBeGreaterThanOrEqual(headerHeight + 8);
        expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(spec.footerTop - 8);
        expect(target.scrollTop).toBe(spec.width < 1024 ? spec.headingTop - headerHeight - 8 : 0);
        expect(createMutate).not.toHaveBeenCalled();
        expect(updateMutate).not.toHaveBeenCalled();
        expect(uploadMutateAsync).not.toHaveBeenCalled();
        expect(changeStatusMutate).not.toHaveBeenCalled();
      });

      it('모바일 문서 scroller도 scroll0의 가림을 보정한다', () => {
        const { target } = layout(viewports[0], { document: true });
        goToParticipationStep();
        expect(target.scrollTop).toBe(371.375);
        expect(screen.getByRole('heading', { level: 2, name: /참가 조건/ })).toHaveFocus();
      });

      it('데스크톱에서 뒤쪽 입력이 가려져도 이미 보이는 실제 첫 입력의 위치를 유지한다', () => {
        const spec = viewports[2];
        const { target } = layout(spec, { distinctControls: true });
        goToParticipationStep();
        expect(screen.getByRole('heading', { level: 2, name: /참가 조건/ })).toHaveFocus();
        expect(screen.getByLabelText(/참가 팀 수/).getBoundingClientRect().bottom).toBeLessThan(spec.footerTop);
        expect(screen.getByLabelText(/최대 선수 수/).getBoundingClientRect().top).toBeGreaterThan(spec.footerTop);
        expect(target.scrollTop).toBe(0);
      });

      it('내부 scroller가 viewport 아래에서 시작해도 header 뒤로 제목을 숨기지 않는다', () => {
        const { target } = layout(viewports[0], { clipTop: 100 });
        goToParticipationStep();
        expect(target.scrollTop).toBe(371.375);
        expect(screen.getByRole('heading', { level: 2, name: /참가 조건/ }).getBoundingClientRect().top).toBe(160);
      });

      it('visual viewport가 줄어도 제목만 focus하고 가능한 첫 입력을 함께 보인다', () => {
        layout(viewports[0], { visual: { offsetTop: 20, height: 280 } });
        goToParticipationStep();
        expect(screen.getByRole('heading', { level: 2, name: /참가 조건/ })).toHaveFocus();
        expect(screen.getByLabelText(/참가 팀 수/).getBoundingClientRect().bottom).toBeLessThanOrEqual(292);
      });

      it('제목과 첫 입력을 함께 담지 못할 만큼 짧으면 제목을 우선한다', () => {
        layout(viewports[0], { visual: { offsetTop: 20, height: 140 } });
        goToParticipationStep();
        const heading = screen.getByRole('heading', { level: 2, name: /참가 조건/ });
        expect(heading).toHaveFocus();
        expect(heading.getBoundingClientRect().top).toBe(60);
        expect(heading.getBoundingClientRect().bottom).toBeLessThanOrEqual(152);
      });

      it('스크롤 가능한 범위를 넘는 위치를 요청하지 않는다', () => {
        const { target } = layout(viewports[0], { maxScroll: 100 });
        goToParticipationStep();
        expect(target.scrollTop).toBe(100);
      });

      it('reduced motion은 auto로 보정한다', () => {
        layout(viewports[0], { reduced: true });
        goToParticipationStep();
        expect(scrollTo).toHaveBeenLastCalledWith({ top: 371.375, behavior: 'auto' });
      });

      it('첫 렌더와 같은 단계의 입력 변경은 scroll/focus를 옮기지 않는다', () => {
        layout();
        expect(scrollTo).not.toHaveBeenCalled();
        const control = screen.getByLabelText(/대회명/);
        control.focus();
        fireEvent.change(control, { target: { value: '입력 중인 대회' } });
        expect(control).toHaveFocus();
        expect(scrollTo).not.toHaveBeenCalled();
      });

      it('이전/스테퍼 반복 이동도 입력을 유지하고 새 제목만 focus한다', () => {
        const { target } = layout();
        goToParticipationStep();
        fireEvent.change(screen.getByLabelText(/참가 팀 수/), { target: { value: '12' } });
        target.scrollTop = 900;
        fireEvent.click(screen.getByRole('button', { name: /이전/ }));
        expect(screen.getByRole('heading', { level: 2, name: /일정/ })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: /3단계 참가 조건/ }));
        expect(screen.getByLabelText(/참가 팀 수/)).toHaveValue(12);
        expect(screen.getByRole('heading', { level: 2, name: /참가 조건/ })).toHaveFocus();
        expect(target.scrollTop).toBe(371.375);
        expect(createMutate).not.toHaveBeenCalled();
      });

      it('검증으로 다른 단계에 돌아가면 제목을 거치지 않고 첫 오류 필드가 우선한다', () => {
        layout();
        goToParticipationStep();
        fireEvent.click(screen.getByRole('button', { name: /이전/ }));
        fireEvent.change(screen.getByLabelText(/대회 시작/), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /이전/ }));
        const focusedHeadings: string[] = [];
        const record = (event: FocusEvent) => { if ((event.target as HTMLElement).tagName === 'H2') focusedHeadings.push((event.target as HTMLElement).textContent ?? ''); };
        document.addEventListener('focusin', record);
        try {
          const stepper = screen.getByRole('button', { name: /4단계 상금/ });
          stepper.focus();
          fireEvent.click(stepper);
          expect(screen.getByLabelText(/대회 시작/)).toHaveFocus();
          expect(focusedHeadings).toEqual([]);
          expect(createMutate).not.toHaveBeenCalled();
        } finally { document.removeEventListener('focusin', record); }
      });

      it('제목 다음 Tab은 첫 입력으로 가고 Enter로 자동 생성하지 않는다', async () => {
        layout();
        goToParticipationStep();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.keyboard('{Enter}');
        expect(createMutate).not.toHaveBeenCalled();
        await user.tab();
        expect(screen.getByLabelText(/참가 팀 수/)).toHaveFocus();
      });
    });
  });
});
