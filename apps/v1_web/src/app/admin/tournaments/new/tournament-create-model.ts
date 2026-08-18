import type {
  V1CreateTournamentPayload,
  V1Tournament,
  V1TournamentFormat,
  V1TournamentGenderCategory,
  V1TournamentListItem,
} from '@/types/api';
import type { TournamentPrizeRow } from '@/components/admin/tournaments/prize-breakdown-editor';
import {
  createPrizeRowId,
  serializeTournamentPrizeRows,
} from '@/components/admin/tournaments/prize-breakdown-editor';
import type { TournamentPromoCardValue } from '@/components/admin/tournaments/promo-card-fields';
import {
  datetimeLocalToIso,
  isoToDatetimeLocal,
} from '@/components/admin/tournaments/tournament-datetime-field';
import { parsePrizeRows } from '@/lib/prize-breakdown';
import {
  applyPromoFactDefaults,
  buildTournamentPromoFactDefaults,
  EMPTY_PROMO_FACTS_DIRTY,
  markChangedPromoFacts,
  PROMO_FACT_KEYS,
  type PromoFactKey,
  type PromoFactsDirty,
} from '@/lib/tournament-promo-defaults';

export const TOURNAMENT_CREATE_STEPS = [
  { title: '기본 정보', description: '종목과 대회 성격' },
  { title: '일정·장소', description: '날짜와 신청 마감' },
  { title: '참가 조건', description: '정원과 정산 계좌' },
  { title: '상금·홍보', description: '공개 화면 준비' },
  { title: '공개 확인', description: '참가자 화면 미리보기' },
] as const;

/** "참가 조건" 다음, 아직 입력만 하는 마지막 단계(상금·홍보) — 여기서 "다음"을 누르면
 * 대회가 초안으로 즉시 생성된다. CONFIRM_STEP_INDEX는 그 결과를 보여주는 새 마지막 단계. */
export const LAST_INPUT_STEP_INDEX = TOURNAMENT_CREATE_STEPS.length - 2;
export const CONFIRM_STEP_INDEX = TOURNAMENT_CREATE_STEPS.length - 1;

export type TournamentCreateState = {
  step: number;
  /** 초안이 이미 생성된 뒤의 대회 id. null이면 아직 서버에 아무것도 만들지 않은 상태 —
   * "참가 조건" 다음 단계에서 이 값의 유무로 생성(POST)인지 수정(PATCH)인지를 가른다. */
  draftId: string | null;
  sportId: string;
  title: string;
  format: V1TournamentFormat;
  genderCategory: V1TournamentGenderCategory;
  scheduledAt: string;
  scheduledEndAt: string;
  registrationDeadlineAt: string;
  rosterDeadlineAt: string;
  registrationDeadlineDirty: boolean;
  rosterDeadlineDirty: boolean;
  venue: string;
  teamCount: string;
  minPlayers: string;
  maxPlayers: string;
  /** "출전 인원"(라인업 상한) — 위 minPlayers/maxPlayers(등록 로스터 크기)와 다른 값.
   * 빈 문자열이면 아직 안 골랐거나 종목의 canonical 기본값을 그대로 쓴다는 뜻이다. */
  lineupMaxPlayers: string;
  /** "교체 방식" — 빈 문자열이면 아직 안 골랐거나 종목의 canonical 기본값을 그대로 쓴다. */
  substitutionMode: '' | 'limited' | 'rolling';
  /** "교체 횟수" — substitutionMode가 'limited'일 때만 의미가 있다. */
  maxSubstitutions: string;
  genderMinMale: string;
  genderMaxMale: string;
  genderMinFemale: string;
  genderMaxFemale: string;
  /** "최소 경기 수" — format이 'league'일 때만 노출. 빈 문자열이면 미설정(서버 검증 안 함). */
  minMatchesPerTeam: string;
  entryFee: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  prizePool: string;
  prizeSummary: string;
  prizeRows: TournamentPrizeRow[];
  rulesText: string;
  refundPolicyText: string;
  coverImageUrl: string | null;
  promoHome: TournamentPromoCardValue;
  promoList: TournamentPromoCardValue;
  /**
   * 홍보 카드의 날짜/팀/장소/상금 문구 중 관리자가 직접 고친 것 — true인 문구는 앞 단계
   * 값이 바뀌어도 자동 갱신하지 않는다(registrationDeadlineDirty와 같은 규칙).
   */
  promoFactsDirty: { promoHome: PromoFactsDirty; promoList: PromoFactsDirty };
};

const EMPTY_PROMO: TournamentPromoCardValue = {
  enabled: false,
  title: '',
  subtitle: '',
  imageUrl: '',
  badgeText: '',
  dateText: '',
  teamsText: '',
  locationText: '',
  prizeText: '',
  priority: '0',
};

export const INITIAL_TOURNAMENT_CREATE_STATE: TournamentCreateState = {
  step: 0,
  draftId: null,
  sportId: '',
  title: '',
  format: 'group_knockout',
  genderCategory: 'mixed',
  scheduledAt: '',
  scheduledEndAt: '',
  registrationDeadlineAt: '',
  rosterDeadlineAt: '',
  registrationDeadlineDirty: false,
  rosterDeadlineDirty: false,
  venue: '',
  teamCount: '8',
  minPlayers: '6',
  maxPlayers: '10',
  lineupMaxPlayers: '',
  substitutionMode: '',
  maxSubstitutions: '',
  genderMinMale: '',
  genderMaxMale: '',
  genderMinFemale: '',
  genderMaxFemale: '',
  minMatchesPerTeam: '',
  entryFee: '0',
  bankName: '',
  bankAccount: '',
  bankHolder: '',
  prizePool: '',
  prizeSummary: '',
  prizeRows: [
    { id: 'prize-1', label: '1위', value: '' },
    { id: 'prize-2', label: '2위', value: '' },
    { id: 'prize-3', label: '3위', value: '' },
  ],
  rulesText: '',
  refundPolicyText: '',
  coverImageUrl: null,
  promoHome: { ...EMPTY_PROMO },
  promoList: { ...EMPTY_PROMO },
  promoFactsDirty: {
    promoHome: { ...EMPTY_PROMO_FACTS_DIRTY },
    promoList: { ...EMPTY_PROMO_FACTS_DIRTY },
  },
};

type FormField = Exclude<
  keyof TournamentCreateState,
  'step' | 'prizeRows' | 'promoHome' | 'promoList' | 'promoFactsDirty'
>;

export type TournamentCreateAction =
  | { type: 'set-step'; step: number }
  | { type: 'set-field'; field: FormField; value: TournamentCreateState[FormField] }
  | { type: 'set-scheduled-at'; value: string }
  | { type: 'set-registration-deadline'; value: string }
  | { type: 'set-roster-deadline'; value: string }
  | { type: 'set-prize-rows'; rows: TournamentPrizeRow[] }
  | { type: 'set-promo'; slot: 'promoHome' | 'promoList'; value: TournamentPromoCardValue }
  | {
      type: 'patch-promo';
      slot: 'promoHome' | 'promoList';
      patch: Partial<TournamentPromoCardValue>;
    }
  /** 한 홍보 카드의 사실 문구를 앞 단계 값 기준으로 되돌린다("대회 정보로 다시 채우기"). */
  | { type: 'reset-promo-facts'; slot: 'promoHome' | 'promoList' }
  | { type: 'copy-bank'; bankName: string; bankAccount: string; bankHolder: string }
  /** 초안 생성/수정 성공 직후 — draftId를 고정하고 확인 단계로 넘어간다. */
  | { type: 'draft-created'; tournament: V1Tournament }
  /** 새로고침으로 돌아온 admin/tournaments/new?draftId=… — 서버 값으로 폼 전체를 복원한다. */
  | { type: 'hydrate-from-draft'; tournament: V1Tournament };

export function tournamentCreateReducer(
  state: TournamentCreateState,
  action: TournamentCreateAction,
): TournamentCreateState {
  switch (action.type) {
    case 'set-step':
      return { ...state, step: Math.max(0, Math.min(TOURNAMENT_CREATE_STEPS.length - 1, action.step)) };
    case 'set-field':
      // 종목이 바뀌면 이전 종목 기준으로 고른 출전 인원은 더 이상 유효한 선택지가
      // 아닐 수 있다(예: 풋살 6명 → 축구로 바꾸면 6명은 선택 불가) — 함께 초기화해
      // 새 종목의 선택지 목록이 로드되면 컴포넌트가 canonical 기본값으로 다시 채운다.
      if (action.field === 'sportId' && action.value !== state.sportId) {
        return { ...state, sportId: action.value as string, lineupMaxPlayers: '' };
      }
      return syncPromoFacts({ ...state, [action.field]: action.value }, action.field);
    case 'set-scheduled-at': {
      const registrationDeadlineAt = state.registrationDeadlineDirty
        ? state.registrationDeadlineAt
        : suggestDeadline(action.value, 3);
      const rosterDeadlineAt = state.rosterDeadlineDirty
        ? state.rosterDeadlineAt
        : suggestDeadline(action.value, 7);
      return syncPromoFacts(
        { ...state, scheduledAt: action.value, registrationDeadlineAt, rosterDeadlineAt },
        'scheduledAt',
      );
    }
    case 'set-registration-deadline':
      return {
        ...state,
        registrationDeadlineAt: action.value,
        registrationDeadlineDirty: true,
      };
    case 'set-roster-deadline':
      return { ...state, rosterDeadlineAt: action.value, rosterDeadlineDirty: true };
    case 'set-prize-rows':
      return { ...state, prizeRows: action.rows };
    case 'set-promo':
      return withPromoValue(state, action.slot, action.value);
    case 'patch-promo':
      return withPromoValue(state, action.slot, { ...state[action.slot], ...action.patch });
    case 'reset-promo-facts': {
      const cleared: TournamentCreateState = {
        ...state,
        promoFactsDirty: {
          ...state.promoFactsDirty,
          [action.slot]: { ...EMPTY_PROMO_FACTS_DIRTY },
        },
      };
      return {
        ...cleared,
        [action.slot]: applyPromoFactDefaults(
          cleared[action.slot],
          buildTournamentPromoFactDefaults(cleared),
          EMPTY_PROMO_FACTS_DIRTY,
        ),
      };
    }
    case 'copy-bank':
      return {
        ...state,
        bankName: action.bankName,
        bankAccount: action.bankAccount,
        bankHolder: action.bankHolder,
      };
    case 'draft-created':
      // 지금 폼에 입력된 값은 이미 서버에 그대로 반영됐다 — id만 고정하고 확인 단계로 이동한다.
      return { ...state, draftId: action.tournament.id, step: CONFIRM_STEP_INDEX };
    case 'hydrate-from-draft':
      return {
        ...mapTournamentToWizardFields(action.tournament),
        step: CONFIRM_STEP_INDEX,
      };
  }
}

/** buildTournamentPromoFactDefaults의 입력이 되는 앞 단계 필드 — 이 값이 바뀌면 문구를 다시 만든다. */
const PROMO_FACT_SOURCE_FIELDS = [
  'scheduledAt',
  'scheduledEndAt',
  'venue',
  'prizePool',
  'prizeSummary',
] as const;

/**
 * 앞 단계 값이 바뀐 뒤, 관리자가 손대지 않은 홍보 문구를 새 값으로 다시 채운다.
 * changedField를 주면 그 필드가 홍보 문구의 출처일 때만 동작하고, 생략하면 항상 다시 채운다.
 */
function syncPromoFacts(
  state: TournamentCreateState,
  changedField?: keyof TournamentCreateState,
): TournamentCreateState {
  if (changedField && !(PROMO_FACT_SOURCE_FIELDS as readonly string[]).includes(changedField)) {
    return state;
  }
  const defaults = buildTournamentPromoFactDefaults(state);
  const promoHome = applyPromoFactDefaults(state.promoHome, defaults, state.promoFactsDirty.promoHome);
  const promoList = applyPromoFactDefaults(state.promoList, defaults, state.promoFactsDirty.promoList);
  if (promoHome === state.promoHome && promoList === state.promoList) return state;
  return { ...state, promoHome, promoList };
}

/** 홍보 카드 값을 교체하면서, 관리자가 직접 바꾼 사실 문구를 dirty로 표시한다. */
function withPromoValue(
  state: TournamentCreateState,
  slot: 'promoHome' | 'promoList',
  value: TournamentPromoCardValue,
): TournamentCreateState {
  const dirty = markChangedPromoFacts(state[slot], value, state.promoFactsDirty[slot]);
  if (dirty === state.promoFactsDirty[slot]) return { ...state, [slot]: value };
  return {
    ...state,
    [slot]: value,
    promoFactsDirty: { ...state.promoFactsDirty, [slot]: dirty },
  };
}

/** 서버에 이미 저장돼 있던 문구는 관리자가 정한 값이므로 dirty로 본다(자동 갱신 대상 제외). */
function dirtyFromSavedPromo(value: Record<PromoFactKey, string>): PromoFactsDirty {
  const dirty = { ...EMPTY_PROMO_FACTS_DIRTY };
  for (const key of PROMO_FACT_KEYS) {
    if (value[key].trim().length > 0) dirty[key] = true;
  }
  return dirty;
}

/**
 * V1Tournament(서버 응답) → 위저드 폼 필드. 새로고침으로 `?draftId=`만 남았을 때 폼 전체를
 * 되살리는 데 쓴다(뒤로가기 없이 "이전"으로 3단계를 다시 열어도 값이 비어 있지 않아야 한다).
 * buildTournamentCreatePayload의 정확한 역변환 — 필드가 늘어나면 두 함수를 함께 갱신할 것.
 */
export function mapTournamentToWizardFields(tournament: V1Tournament): TournamentCreateState {
  const prizeRows: TournamentPrizeRow[] = tournament.prizeBreakdown
    ? parsePrizeRows(tournament.prizeBreakdown).map((row) => ({
        id: createPrizeRowId(),
        label: row.label,
        value: row.amount,
      }))
    : INITIAL_TOURNAMENT_CREATE_STATE.prizeRows;

  return syncPromoFacts({
    ...INITIAL_TOURNAMENT_CREATE_STATE,
    draftId: tournament.id,
    sportId: tournament.sportId,
    title: tournament.title,
    format: tournament.format,
    genderCategory: tournament.genderCategory ?? 'mixed',
    scheduledAt: isoToDatetimeLocal(tournament.scheduledAt),
    scheduledEndAt: isoToDatetimeLocal(tournament.scheduledEndAt),
    registrationDeadlineAt: isoToDatetimeLocal(tournament.registrationDeadlineAt),
    rosterDeadlineAt: isoToDatetimeLocal(tournament.rosterDeadlineAt),
    // 이미 서버에 저장된 값이니 자동 제안 로직(D-3/D-7)이 다시 덮어쓰면 안 된다.
    registrationDeadlineDirty: true,
    rosterDeadlineDirty: true,
    venue: tournament.venue ?? '',
    teamCount: String(tournament.teamCount),
    minPlayers: String(tournament.minPlayers),
    maxPlayers: String(tournament.maxPlayers),
    lineupMaxPlayers: tournament.lineupMaxPlayers !== null ? String(tournament.lineupMaxPlayers) : '',
    substitutionMode: tournament.substitutionMode ?? '',
    maxSubstitutions: tournament.maxSubstitutions !== null ? String(tournament.maxSubstitutions) : '',
    genderMinMale: tournament.genderMinMale !== null ? String(tournament.genderMinMale) : '',
    genderMaxMale: tournament.genderMaxMale !== null ? String(tournament.genderMaxMale) : '',
    genderMinFemale: tournament.genderMinFemale !== null ? String(tournament.genderMinFemale) : '',
    genderMaxFemale: tournament.genderMaxFemale !== null ? String(tournament.genderMaxFemale) : '',
    minMatchesPerTeam:
      tournament.minMatchesPerTeam !== null ? String(tournament.minMatchesPerTeam) : '',
    entryFee: String(tournament.entryFee),
    bankName: tournament.bankName ?? '',
    bankAccount: tournament.bankAccount ?? '',
    bankHolder: tournament.bankHolder ?? '',
    prizePool: tournament.prizePool !== null ? String(tournament.prizePool) : '',
    prizeSummary: tournament.prizeSummary ?? '',
    prizeRows,
    rulesText: tournament.rulesText ?? '',
    refundPolicyText: tournament.refundPolicyText ?? '',
    coverImageUrl: tournament.coverImageUrl,
    promoHome: {
      enabled: tournament.promoHomeEnabled,
      title: tournament.promoHomeTitle ?? '',
      subtitle: tournament.promoHomeSubtitle ?? '',
      imageUrl: tournament.promoHomeImageUrl ?? '',
      badgeText: tournament.promoHomeBadgeText ?? '',
      dateText: tournament.promoHomeDateText ?? '',
      teamsText: tournament.promoHomeTeamsText ?? '',
      locationText: tournament.promoHomeLocationText ?? '',
      prizeText: tournament.promoHomePrizeText ?? '',
      priority: String(tournament.promoHomePriority),
    },
    promoList: {
      enabled: tournament.promoListEnabled,
      title: tournament.promoListTitle ?? '',
      subtitle: tournament.promoListSubtitle ?? '',
      imageUrl: tournament.promoListImageUrl ?? '',
      badgeText: tournament.promoListBadgeText ?? '',
      dateText: tournament.promoListDateText ?? '',
      teamsText: tournament.promoListTeamsText ?? '',
      locationText: tournament.promoListLocationText ?? '',
      prizeText: tournament.promoListPrizeText ?? '',
      priority: String(tournament.promoListPriority),
    },
    promoFactsDirty: {
      promoHome: dirtyFromSavedPromo({
        dateText: tournament.promoHomeDateText ?? '',
        locationText: tournament.promoHomeLocationText ?? '',
        prizeText: tournament.promoHomePrizeText ?? '',
      }),
      promoList: dirtyFromSavedPromo({
        dateText: tournament.promoListDateText ?? '',
        locationText: tournament.promoListLocationText ?? '',
        prizeText: tournament.promoListPrizeText ?? '',
      }),
    },
  });
}

/**
 * 위저드 상태 → 공개 목록 카드(V1TournamentListItem)로 변환 — "공개 화면 확인" 단계에서
 * 실제 <TournamentCard/>를 그대로 재사용해 보여주기 위한 어댑터. 신청자가 아직 없으므로
 * confirmedCount/pendingPaymentCount는 항상 0. status는 접수 시작 "이후" 참가자가 보게 될
 * 모습을 보여주려는 목적이라 실제 상태(draft)가 아니라 항상 'open'으로 표시한다 — draft는
 * 참가자에게 애초에 노출되지 않는 상태라 그대로 보여주면 "준비 중" 배지만 뜨는 오해를 준다.
 */
export function buildTournamentPreviewItem(
  state: TournamentCreateState,
  sport: { code?: string; name: string } | undefined,
): V1TournamentListItem {
  return {
    id: state.draftId ?? 'preview',
    sportId: state.sportId,
    sport: { code: sport?.code ?? '', name: sport?.name ?? '' },
    title: state.title.trim() || '새 대회',
    status: 'open',
    format: state.format,
    registrationDeadlineAt: datetimeLocalToIso(state.registrationDeadlineAt),
    scheduledAt: datetimeLocalToIso(state.scheduledAt),
    scheduledEndAt: datetimeLocalToIso(state.scheduledEndAt),
    venue: state.venue.trim() || null,
    coverImageUrl: state.coverImageUrl,
    teamCount: Number(state.teamCount) || 0,
    genderCategory: state.genderCategory,
    entryFee: Number(state.entryFee) || 0,
    prizePool: state.prizePool ? Number(state.prizePool) : null,
    prizeSummary: state.prizeSummary.trim() || null,
    prizeBreakdown: serializeTournamentPrizeRows(state.prizeRows) || null,
    promoHomeEnabled: state.promoHome.enabled,
    promoHomeTitle: state.promoHome.title.trim() || null,
    promoHomeSubtitle: state.promoHome.subtitle.trim() || null,
    promoHomeImageUrl: state.promoHome.imageUrl.trim() || null,
    promoHomeBadgeText: state.promoHome.badgeText.trim() || null,
    promoHomeDateText: state.promoHome.dateText.trim() || null,
    promoHomeTeamsText: state.promoHome.teamsText.trim() || null,
    promoHomeLocationText: state.promoHome.locationText.trim() || null,
    promoHomePrizeText: state.promoHome.prizeText.trim() || null,
    promoHomePriority: Number(state.promoHome.priority) || 0,
    promoListEnabled: state.promoList.enabled,
    promoListTitle: state.promoList.title.trim() || null,
    promoListSubtitle: state.promoList.subtitle.trim() || null,
    promoListImageUrl: state.promoList.imageUrl.trim() || null,
    promoListBadgeText: state.promoList.badgeText.trim() || null,
    promoListDateText: state.promoList.dateText.trim() || null,
    promoListTeamsText: state.promoList.teamsText.trim() || null,
    promoListLocationText: state.promoList.locationText.trim() || null,
    promoListPrizeText: state.promoList.prizeText.trim() || null,
    promoListPriority: Number(state.promoList.priority) || 0,
    campaignSlug: null,
    confirmedCount: 0,
    pendingPaymentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateTournamentCreateStep(state: TournamentCreateState, step = state.step) {
  const errors: Record<string, string> = {};

  if (step === 0) {
    if (!state.sportId) errors.sportId = '종목을 선택해 주세요.';
    if (!state.title.trim()) errors.title = '대회명을 입력해 주세요.';
  }

  if (step === 1) {
    if (!state.scheduledAt) errors.scheduledAt = '대회 시작 일시를 선택해 주세요.';
    if (!state.registrationDeadlineAt) {
      errors.registrationDeadlineAt = '신청 마감 일시를 선택해 주세요.';
    }
    if (!state.rosterDeadlineAt) errors.rosterDeadlineAt = '명단 제출 마감 일시를 선택해 주세요.';
    const start = localTimestamp(state.scheduledAt);
    const end = localTimestamp(state.scheduledEndAt);
    const registrationDeadline = localTimestamp(state.registrationDeadlineAt);
    const rosterDeadline = localTimestamp(state.rosterDeadlineAt);
    if (start !== null && end !== null && end < start) {
      errors.scheduledEndAt = '종료 일시는 시작 일시 이후여야 해요.';
    }
    if (start !== null && registrationDeadline !== null && registrationDeadline >= start) {
      errors.registrationDeadlineAt = '신청 마감은 대회 시작 전이어야 해요.';
    }
    if (start !== null && rosterDeadline !== null && rosterDeadline >= start) {
      errors.rosterDeadlineAt = '명단 제출 마감은 대회 시작 전이어야 해요.';
    }
  }

  if (step === 2) {
    const teamCount = numeric(state.teamCount);
    const minPlayers = numeric(state.minPlayers);
    const maxPlayers = numeric(state.maxPlayers);
    const entryFee = numeric(state.entryFee);
    if (teamCount === null || !Number.isInteger(teamCount) || teamCount < 2 || teamCount > 64) {
      errors.teamCount = '참가 팀 수는 2~64개여야 해요.';
    }
    if (minPlayers === null || !Number.isInteger(minPlayers) || minPlayers < 1 || minPlayers > 50) {
      errors.minPlayers = '최소 선수 수는 1~50명이어야 해요.';
    }
    if (maxPlayers === null || !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 50) {
      errors.maxPlayers = '최대 선수 수는 1~50명이어야 해요.';
    } else if (minPlayers !== null && minPlayers > maxPlayers) {
      errors.maxPlayers = '최대 선수 수는 최소 선수 수보다 작을 수 없어요.';
    }
    if (state.substitutionMode === 'limited') {
      // 비워두면 여기서 막는다. 예전엔 통과시켰는데, 그러면 canonical 이 무제한인
      // 종목(풋살)에서 서버가 422(SUBSTITUTION_LIMIT_REQUIRED)로 거절해 관리자는
      // 마지막 단계에서야 실패를 본다 — "안 입력되면 다음으로 못 넘어가게" 원칙대로
      // 입력 단계에서 잡는다.
      if (state.maxSubstitutions.trim() === '') {
        errors.maxSubstitutions = '교체 횟수를 제한하려면 허용 횟수를 입력해 주세요.';
      } else {
        const maxSubstitutions = numeric(state.maxSubstitutions);
        if (maxSubstitutions === null || !Number.isInteger(maxSubstitutions) || maxSubstitutions < 0 || maxSubstitutions > 50) {
          errors.maxSubstitutions = '교체 횟수는 0~50회 사이의 정수여야 해요.';
        }
      }
    }
    if (
      entryFee === null ||
      !Number.isInteger(entryFee) ||
      entryFee < 0 ||
      entryFee > 100_000_000
    ) {
      errors.entryFee = '참가비는 0원~1억 원 사이의 정수여야 해요.';
    } else if (entryFee > 0) {
      if (!state.bankName.trim()) errors.bankName = '유료 대회는 은행명이 필요해요.';
      if (!state.bankAccount.trim()) errors.bankAccount = '유료 대회는 계좌번호가 필요해요.';
      if (!state.bankHolder.trim()) errors.bankHolder = '유료 대회는 예금주가 필요해요.';
    }
    if (state.format === 'league' && state.minMatchesPerTeam.trim() !== '') {
      const minMatchesPerTeam = numeric(state.minMatchesPerTeam);
      if (
        minMatchesPerTeam === null ||
        !Number.isInteger(minMatchesPerTeam) ||
        minMatchesPerTeam < 1 ||
        minMatchesPerTeam > 50
      ) {
        errors.minMatchesPerTeam = '최소 경기 수는 1~50경기 사이의 정수여야 해요.';
      }
    }
    if (state.genderCategory === 'mixed') {
      const minMale = optionalNumeric(state.genderMinMale);
      const maxMale = optionalNumeric(state.genderMaxMale);
      const minFemale = optionalNumeric(state.genderMinFemale);
      const maxFemale = optionalNumeric(state.genderMaxFemale);
      const quotaValues = [
        ['genderMinMale', minMale, '남성 최소 인원'],
        ['genderMaxMale', maxMale, '남성 최대 인원'],
        ['genderMinFemale', minFemale, '여성 최소 인원'],
        ['genderMaxFemale', maxFemale, '여성 최대 인원'],
      ] as const;
      for (const [field, value, label] of quotaValues) {
        if (value !== null && (!Number.isInteger(value) || value < 0 || value > 50)) {
          errors[field] = `${label}은 0~50명 사이의 정수여야 해요.`;
        }
      }
      if (minMale !== null && maxMale !== null && minMale > maxMale) {
        errors.genderMaxMale = '남성 최대 인원은 최소 인원보다 작을 수 없어요.';
      }
      if (minFemale !== null && maxFemale !== null && minFemale > maxFemale) {
        errors.genderMaxFemale = '여성 최대 인원은 최소 인원보다 작을 수 없어요.';
      }
      if (
        maxPlayers !== null &&
        (minMale ?? 0) + (minFemale ?? 0) > maxPlayers
      ) {
        errors.genderQuota = '성별 최소 인원 합이 최대 선수 수를 넘을 수 없어요.';
      }
      if (
        maxPlayers !== null &&
        ((maxMale !== null && maxMale > maxPlayers) ||
          (maxFemale !== null && maxFemale > maxPlayers))
      ) {
        errors.genderQuota = '성별 최대 인원은 대회 최대 선수 수를 넘을 수 없어요.';
      }
    }
  }

  if (step === 3) {
    for (const [field, value, label] of [
      ['promoHomePriority', state.promoHome.priority, '홈 홍보 우선순위'],
      ['promoListPriority', state.promoList.priority, '목록 홍보 우선순위'],
    ] as const) {
      const priority = numeric(value);
      if (
        priority === null ||
        !Number.isInteger(priority) ||
        priority < 0 ||
        priority > 9999
      ) {
        errors[field] = `${label}는 0~9999 사이의 정수여야 해요.`;
      }
    }
  }

  return errors;
}

export function canSubmitTournamentCreate(state: TournamentCreateState) {
  return [0, 1, 2, 3].every(
    (step) => Object.keys(validateTournamentCreateStep(state, step)).length === 0,
  );
}

export function buildTournamentCreatePayload(
  state: TournamentCreateState,
): V1CreateTournamentPayload {
  const payload: V1CreateTournamentPayload = {
    sportId: state.sportId,
    title: state.title.trim(),
    format: state.format,
    genderCategory: state.genderCategory,
    scheduledAt: datetimeLocalToIso(state.scheduledAt) ?? undefined,
    scheduledEndAt: datetimeLocalToIso(state.scheduledEndAt),
    registrationDeadlineAt: datetimeLocalToIso(state.registrationDeadlineAt) ?? undefined,
    rosterDeadlineAt: datetimeLocalToIso(state.rosterDeadlineAt) ?? undefined,
    venue: state.venue.trim() || undefined,
    coverImageUrl: state.coverImageUrl,
    teamCount: Number(state.teamCount),
    minPlayers: Number(state.minPlayers),
    maxPlayers: Number(state.maxPlayers),
    lineupMaxPlayers: state.lineupMaxPlayers ? Number(state.lineupMaxPlayers) : undefined,
    substitutionMode: state.substitutionMode || undefined,
    // 'rolling'을 고르면 횟수는 의미가 없다(서버가 함께 오면 400으로 거절) — 안 보낸다.
    // trim 없이 truthy 로 보면 공백만 든 문자열('   ')이 통과해 Number('   ') === 0 으로
    // 직렬화된다 — 관리자가 아무것도 안 썼는데 "교체 0회"가 저장되는 사고다.
    maxSubstitutions:
      state.substitutionMode === 'limited' && state.maxSubstitutions.trim() !== ''
        ? Number(state.maxSubstitutions.trim())
        : undefined,
    // 빈 값이면 아예 보내지 않는다 — 0이나 빈 문자열을 보내면 서버 @IsInt @Min(1)이 422로
    // 거절한다(관리자가 아무것도 입력하지 않았는데 검증 요청이 되는 사고).
    minMatchesPerTeam: state.minMatchesPerTeam.trim() !== '' ? Number(state.minMatchesPerTeam.trim()) : undefined,
    entryFee: Number(state.entryFee || '0'),
    bankName: state.bankName.trim() || undefined,
    bankAccount: state.bankAccount.trim() || undefined,
    bankHolder: state.bankHolder.trim() || undefined,
    prizePool: state.prizePool ? Number(state.prizePool) : undefined,
    prizeSummary: state.prizeSummary.trim() || undefined,
    prizeBreakdown: serializeTournamentPrizeRows(state.prizeRows) || undefined,
    rulesText: state.rulesText.trim() || undefined,
    refundPolicyText: state.refundPolicyText.trim() || undefined,
    ...promoPayload('promoHome', state.promoHome),
    ...promoPayload('promoList', state.promoList),
  };

  if (state.genderCategory === 'mixed') {
    payload.genderMinMale = optionalNumeric(state.genderMinMale) ?? undefined;
    payload.genderMaxMale = optionalNumeric(state.genderMaxMale) ?? undefined;
    payload.genderMinFemale = optionalNumeric(state.genderMinFemale) ?? undefined;
    payload.genderMaxFemale = optionalNumeric(state.genderMaxFemale) ?? undefined;
  }

  return payload;
}

function promoPayload(
  prefix: 'promoHome' | 'promoList',
  value: TournamentPromoCardValue,
): Partial<V1CreateTournamentPayload> {
  const priority = numeric(value.priority) ?? 0;
  const fields = {
    enabled: value.enabled,
    title: value.title.trim(),
    subtitle: value.subtitle.trim(),
    imageUrl: value.imageUrl.trim(),
    badgeText: value.badgeText.trim(),
    dateText: value.dateText.trim(),
    teamsText: value.teamsText.trim(),
    locationText: value.locationText.trim(),
    prizeText: value.prizeText.trim(),
    priority,
  };

  return prefix === 'promoHome'
    ? {
        promoHomeEnabled: fields.enabled,
        promoHomeTitle: fields.title,
        promoHomeSubtitle: fields.subtitle,
        promoHomeImageUrl: fields.imageUrl,
        promoHomeBadgeText: fields.badgeText,
        promoHomeDateText: fields.dateText,
        promoHomeTeamsText: fields.teamsText,
        promoHomeLocationText: fields.locationText,
        promoHomePrizeText: fields.prizeText,
        promoHomePriority: fields.priority,
      }
    : {
        promoListEnabled: fields.enabled,
        promoListTitle: fields.title,
        promoListSubtitle: fields.subtitle,
        promoListImageUrl: fields.imageUrl,
        promoListBadgeText: fields.badgeText,
        promoListDateText: fields.dateText,
        promoListTeamsText: fields.teamsText,
        promoListLocationText: fields.locationText,
        promoListPrizeText: fields.prizeText,
        promoListPriority: fields.priority,
      };
}

function suggestDeadline(startValue: string, daysBefore: number) {
  const start = new Date(startValue);
  if (!startValue || Number.isNaN(start.getTime())) return '';
  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() - daysBefore);
  deadline.setHours(23, 59, 0, 0);
  return formatDatetimeLocal(deadline);
}

function formatDatetimeLocal(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localTimestamp(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function numeric(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalNumeric(value: string) {
  if (!value.trim()) return null;
  return numeric(value);
}
