import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1AdminTournaments,
  useV1CreateTournament,
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
}));

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournaments: vi.fn(),
  useV1CreateTournament: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1UploadImages: vi.fn(),
}));

const useV1AdminTournamentsMock = vi.mocked(useV1AdminTournaments, { partial: true });
const useV1CreateTournamentMock = vi.mocked(useV1CreateTournament, { partial: true });
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
    scheduledAt: '2026-07-01T09:00:00.000Z',
    scheduledEndAt: null,
    venue: '서울 풋살장',
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
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
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', name: '풋살', levels: [] }],
      isPending: false,
    });
    useV1AdminTournamentsMock.mockReturnValue({
      data: {
        items: [previousTournament()],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isPending: false,
    });
    useV1CreateTournamentMock.mockReturnValue({
      mutate: createMutate,
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
