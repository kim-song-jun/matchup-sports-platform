import type {
  V1CreateTournamentPayload,
  V1TournamentFormat,
  V1TournamentGenderCategory,
} from '@/types/api';
import type { TournamentPrizeRow } from '@/components/admin/tournaments/prize-breakdown-editor';
import { serializeTournamentPrizeRows } from '@/components/admin/tournaments/prize-breakdown-editor';
import type { TournamentPromoCardValue } from '@/components/admin/tournaments/promo-card-fields';
import { datetimeLocalToIso } from '@/components/admin/tournaments/tournament-datetime-field';

export const TOURNAMENT_CREATE_STEPS = [
  { title: '기본 정보', description: '종목과 대회 성격' },
  { title: '일정·장소', description: '날짜와 신청 마감' },
  { title: '참가 조건', description: '정원과 정산 계좌' },
  { title: '상금·홍보', description: '공개 화면 준비' },
] as const;

export type TournamentCreateState = {
  step: number;
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
  genderMinMale: string;
  genderMaxMale: string;
  genderMinFemale: string;
  genderMaxFemale: string;
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
  genderMinMale: '',
  genderMaxMale: '',
  genderMinFemale: '',
  genderMaxFemale: '',
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
};

type FormField = Exclude<
  keyof TournamentCreateState,
  'step' | 'prizeRows' | 'promoHome' | 'promoList'
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
  | { type: 'copy-bank'; bankName: string; bankAccount: string; bankHolder: string };

export function tournamentCreateReducer(
  state: TournamentCreateState,
  action: TournamentCreateAction,
): TournamentCreateState {
  switch (action.type) {
    case 'set-step':
      return { ...state, step: Math.max(0, Math.min(TOURNAMENT_CREATE_STEPS.length - 1, action.step)) };
    case 'set-field':
      return { ...state, [action.field]: action.value };
    case 'set-scheduled-at': {
      const registrationDeadlineAt = state.registrationDeadlineDirty
        ? state.registrationDeadlineAt
        : suggestDeadline(action.value, 3);
      const rosterDeadlineAt = state.rosterDeadlineDirty
        ? state.rosterDeadlineAt
        : suggestDeadline(action.value, 7);
      return { ...state, scheduledAt: action.value, registrationDeadlineAt, rosterDeadlineAt };
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
      return { ...state, [action.slot]: action.value };
    case 'patch-promo':
      return { ...state, [action.slot]: { ...state[action.slot], ...action.patch } };
    case 'copy-bank':
      return {
        ...state,
        bankName: action.bankName,
        bankAccount: action.bankAccount,
        bankHolder: action.bankHolder,
      };
  }
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
