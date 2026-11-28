import type { GenderChoice } from '@/components/admin/tournaments/tournament-gender-choice-field';
import { groupKnockoutShapes, planBracketTemplateCounts, recommendedKnockoutSize } from '@/lib/bracket-template-counts';
import { DAY_MS, kstDatetimeLocalToIso, kstMidnightMs, toKstDateString } from '@/lib/kst-calendar';
import { josa } from '@/lib/korean';
import { stagePlanCounts } from '@/lib/stage-plan';
import { TOURNAMENT_FORMAT_NAMES } from '@/lib/tournament-format-labels';
import type { StagePlan, StagePool } from '@/types/stage-plan';
import type { V1CreateTournamentPayload } from '@/types/api';

export type CreateFormatChoice = 'group_knockout' | 'knockout' | 'league' | 'staged';

export const CREATE_FORMAT_OPTIONS: ReadonlyArray<{ value: CreateFormatChoice; label: string; description: string }> = [
  { value: 'group_knockout', label: TOURNAMENT_FORMAT_NAMES.group_knockout, description: '조별로 겨룬 뒤 상위 팀끼리 토너먼트를 해요' },
  { value: 'knockout', label: TOURNAMENT_FORMAT_NAMES.knockout, description: '한 번 지면 탈락해요' },
  { value: 'league', label: TOURNAMENT_FORMAT_NAMES.league, description: '모든 팀과 한 번씩 겨뤄 순위를 정해요' },
  { value: 'staged', label: TOURNAMENT_FORMAT_NAMES.league_knockouts, description: '예선 순위대로 상위·하위 결선을 따로 열어요' },
];

export const DEFAULT_GENDER_CATEGORY: GenderChoice = 'none';

/** 만들기에서는 선수 수를 받지 않아 서버 기본 최대 선수 수로 혼성 인원을 검증한다. */
export const SERVER_DEFAULT_MAX_PLAYERS = 10;
export const TEAM_COUNT_MIN = 2;
export const TEAM_COUNT_MAX = 64;
const GENDER_QUOTA_MAX = 50;
const DEADLINE_SUGGEST_DAYS = 3;
const STAGED_POOL_MAX_TEAMS = 8;

export type CreateFormState = {
  sportId: string;
  title: string;
  format: CreateFormatChoice;
  scheduledAt: string;
  registrationDeadlineAt: string;
  registrationDeadlineDirty: boolean;
  teamCount: string;
  genderCategory: GenderChoice;
  genderMinMale: string;
  genderMaxMale: string;
  genderMinFemale: string;
  genderMaxFemale: string;
};

export function initialCreateFormState(format: CreateFormatChoice = 'group_knockout'): CreateFormState {
  return {
    sportId: '',
    title: '',
    format,
    scheduledAt: '',
    registrationDeadlineAt: '',
    registrationDeadlineDirty: false,
    teamCount: '8',
    genderCategory: DEFAULT_GENDER_CATEGORY,
    genderMinMale: '',
    genderMaxMale: '',
    genderMinFemale: '',
    genderMaxFemale: '',
  };
}

export type CreateFormAction =
  | {
      type: 'set-field';
      field: 'sportId' | 'title' | 'teamCount' | 'genderMinMale' | 'genderMaxMale' | 'genderMinFemale' | 'genderMaxFemale';
      value: string;
    }
  | { type: 'set-format'; value: CreateFormatChoice }
  | { type: 'set-gender'; value: GenderChoice }
  | { type: 'set-scheduled-at'; value: string }
  | { type: 'set-registration-deadline'; value: string }
  | { type: 'step-team-count'; delta: 1 | -1 };

export function createFormReducer(state: CreateFormState, action: CreateFormAction): CreateFormState {
  switch (action.type) {
    case 'set-field':
      return { ...state, [action.field]: action.value };
    case 'set-format':
      return { ...state, format: action.value };
    case 'set-gender':
      return { ...state, genderCategory: action.value };
    case 'set-scheduled-at':
      return {
        ...state,
        scheduledAt: action.value,
        registrationDeadlineAt: state.registrationDeadlineDirty
          ? state.registrationDeadlineAt
          : suggestRegistrationDeadline(action.value),
      };
    case 'set-registration-deadline':
      return { ...state, registrationDeadlineAt: action.value, registrationDeadlineDirty: true };
    case 'step-team-count': {
      const current = parseInteger(state.teamCount);
      const next = current === null ? TEAM_COUNT_MIN : current + action.delta;
      return { ...state, teamCount: String(Math.min(TEAM_COUNT_MAX, Math.max(TEAM_COUNT_MIN, next))) };
    }
  }
}

export type CreateErrorField =
  | 'sportId'
  | 'title'
  | 'scheduledAt'
  | 'registrationDeadlineAt'
  | 'teamCount'
  | 'genderMinMale'
  | 'genderMaxMale'
  | 'genderMinFemale'
  | 'genderMaxFemale'
  | 'genderQuota';
export type CreateFormErrors = Partial<Record<CreateErrorField, string>>;

const ERROR_FIELD_ORDER: readonly CreateErrorField[] = [
  'sportId',
  'title',
  'scheduledAt',
  'registrationDeadlineAt',
  'teamCount',
  'genderMinMale',
  'genderMaxMale',
  'genderMinFemale',
  'genderMaxFemale',
  'genderQuota',
];

const ERROR_FIELD_LABELS: Record<CreateErrorField, string> = {
  sportId: '종목',
  title: '대회명',
  scheduledAt: '대회 시작',
  registrationDeadlineAt: '신청 마감',
  teamCount: '팀 수',
  genderMinMale: '남성 최소 인원',
  genderMaxMale: '남성 최대 인원',
  genderMinFemale: '여성 최소 인원',
  genderMaxFemale: '여성 최대 인원',
  genderQuota: '남녀 인원',
};

export function validateCreateForm(state: CreateFormState): CreateFormErrors {
  const errors: CreateFormErrors = {};

  if (!state.sportId) errors.sportId = '종목을 선택해 주세요.';
  if (!state.title.trim()) errors.title = '대회명을 입력해 주세요.';

  if (!state.scheduledAt) errors.scheduledAt = '대회 시작 일시를 선택해 주세요.';
  if (!state.registrationDeadlineAt) errors.registrationDeadlineAt = '신청 마감 일시를 선택해 주세요.';
  const start = localTimestamp(state.scheduledAt);
  const deadline = localTimestamp(state.registrationDeadlineAt);
  const now = Date.now();
  // 시작이 이미 지났으면 그 칸에서만 말한다 — 마감 칸까지 붉히면 멀쩡한 칸을 고치려 든다.
  const startIsFuture = start !== null && start > now;
  if (start !== null && !startIsFuture) errors.scheduledAt = '대회 시작 일시는 지금 이후여야 해요.';
  if (startIsFuture && deadline !== null && deadline >= start) {
    errors.registrationDeadlineAt = '신청 마감은 대회 시작 전이어야 해요.';
  }
  if (deadline !== null && deadline <= now) errors.registrationDeadlineAt = '신청 마감은 지금 이후여야 해요.';

  if (!isValidTeamCount(state.teamCount)) {
    errors.teamCount = `참가 팀 수는 ${TEAM_COUNT_MIN}~${TEAM_COUNT_MAX}개여야 해요.`;
  }

  if (state.genderCategory === 'mixed') validateGenderQuota(state, errors);
  return errors;
}

function validateGenderQuota(state: CreateFormState, errors: CreateFormErrors) {
  const minMale = optionalNumber(state.genderMinMale);
  const maxMale = optionalNumber(state.genderMaxMale);
  const minFemale = optionalNumber(state.genderMinFemale);
  const maxFemale = optionalNumber(state.genderMaxFemale);
  const quotaValues = [
    ['genderMinMale', minMale],
    ['genderMaxMale', maxMale],
    ['genderMinFemale', minFemale],
    ['genderMaxFemale', maxFemale],
  ] as const;
  for (const [field, value] of quotaValues) {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > GENDER_QUOTA_MAX)) {
      errors[field] = `${josa(ERROR_FIELD_LABELS[field], ['은', '는'])} 0~${GENDER_QUOTA_MAX}명 사이의 정수여야 해요.`;
    }
  }
  if (minMale !== null && maxMale !== null && minMale > maxMale) {
    errors.genderMaxMale = '남성 최대 인원은 최소 인원보다 작을 수 없어요.';
  }
  if (minFemale !== null && maxFemale !== null && minFemale > maxFemale) {
    errors.genderMaxFemale = '여성 최대 인원은 최소 인원보다 작을 수 없어요.';
  }
  if ((minMale ?? 0) + (minFemale ?? 0) > SERVER_DEFAULT_MAX_PLAYERS) {
    errors.genderQuota = '성별 최소 인원 합이 최대 선수 수를 넘을 수 없어요.';
  }
  if ((maxMale ?? 0) > SERVER_DEFAULT_MAX_PLAYERS || (maxFemale ?? 0) > SERVER_DEFAULT_MAX_PLAYERS) {
    errors.genderQuota = '성별 최대 인원은 대회 최대 선수 수를 넘을 수 없어요.';
  }
}

/** 서버가 채우는 값(선수 수·참가비·출전 인원·경기 시간)은 보내지 않는다 — 보내면 종목 기본값을 덮는다. */
export function buildCreatePayload(state: CreateFormState): V1CreateTournamentPayload {
  const payload: V1CreateTournamentPayload = {
    sportId: state.sportId,
    title: state.title.trim(),
    format: state.format === 'staged' ? 'league_knockouts' : state.format,
    teamCount: Number(state.teamCount.trim()),
  };
  const scheduledAt = kstDatetimeLocalToIso(state.scheduledAt);
  const registrationDeadlineAt = kstDatetimeLocalToIso(state.registrationDeadlineAt);
  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (registrationDeadlineAt) payload.registrationDeadlineAt = registrationDeadlineAt;
  if (state.format === 'staged') payload.stagePlan = stagePlanForTeamCount(payload.teamCount ?? TEAM_COUNT_MIN);

  if (state.genderCategory !== 'none') payload.genderCategory = state.genderCategory;
  if (state.genderCategory === 'mixed') {
    const quotas = [
      ['genderMinMale', state.genderMinMale],
      ['genderMaxMale', state.genderMaxMale],
      ['genderMinFemale', state.genderMinFemale],
      ['genderMaxFemale', state.genderMaxFemale],
    ] as const;
    for (const [field, raw] of quotas) {
      const value = optionalNumber(raw);
      if (value !== null) payload[field] = value;
    }
  }
  return payload;
}

/** 팀 수에 맞춘 기본 예선 구성 — 조당 8팀 이하로 고르게 나눈다. 서버는 첫 단계 자리 합이 팀 수와 같아야 받는다. */
export function stagePlanForTeamCount(teamCount: number): StagePlan {
  const poolCount = Math.ceil(teamCount / STAGED_POOL_MAX_TEAMS);
  const baseSize = Math.floor(teamCount / poolCount);
  const largerPools = teamCount % poolCount;
  const pools: StagePool[] = Array.from({ length: poolCount }, (_, index) => ({
    key: `preliminary-${index + 1}`,
    name: poolCount === 1 ? '예선 리그' : `${String.fromCharCode(65 + index)}조`,
    format: 'league',
    capacity: baseSize + (index < largerPools ? 1 : 0),
    legs: 1,
    sources: [],
  }));
  return { version: 1, stages: [{ key: 'preliminary', name: '예선', pools }] };
}

const KNOCKOUT_ROUND_NAMES: Readonly<Record<number, string>> = {
  2: '결승',
  4: '4강 → 결승',
  8: '8강 → 4강 → 결승',
  12: '12강 → 8강 → 4강 → 결승',
  16: '16강 → 8강 → 4강 → 결승',
};

export function describeFormatOutcome(format: CreateFormatChoice, teamCount: number): string {
  if (!Number.isInteger(teamCount) || teamCount < TEAM_COUNT_MIN || teamCount > TEAM_COUNT_MAX) return '';

  if (format === 'group_knockout') {
    const shape = groupKnockoutShapes(teamCount)[0];
    if (!shape) return '조 편성은 신청이 끝난 뒤 대진을 만들 때 정해요.';
    const counts = planBracketTemplateCounts({ kind: 'group_knockout', ...shape, legs: 1, thirdPlace: false });
    if (!counts) return '조 편성은 신청이 끝난 뒤 대진을 만들 때 정해요.';
    const lastGroup = String.fromCharCode(64 + shape.groupCount);
    const groups = shape.groupCount === 2 ? 'A·B조' : `A~${lastGroup}조`;
    const rounds = KNOCKOUT_ROUND_NAMES[shape.groupCount * shape.advancePerGroup];
    return `${groups} ${shape.teamsPerGroup}팀씩 → ${rounds}, 경기 ${counts.fixtures}개로 치러요.`;
  }

  if (format === 'knockout') {
    const size = recommendedKnockoutSize(teamCount);
    const counts = size ? planBracketTemplateCounts({ kind: 'knockout', size, thirdPlace: false }) : null;
    if (!size || !counts) return '대진은 신청이 끝난 뒤 만들 때 정해요.';
    return `${KNOCKOUT_ROUND_NAMES[size]}, 경기 ${counts.fixtures}개로 치러요.`;
  }

  if (format === 'league') {
    return `모든 팀이 한 번씩 겨뤄 경기 ${(teamCount * (teamCount - 1)) / 2}개로 치러요.`;
  }

  const plan = stagePlanForTeamCount(teamCount);
  const { fixtures } = stagePlanCounts(plan);
  const pools = plan.stages[0].pools.length;
  const opening = pools === 1 ? `예선 ${teamCount}팀 리그(경기 ${fixtures}개)` : `예선 ${pools}개 조(경기 ${fixtures}개)`;
  return `${opening}로 시작해요. 결선은 대진에서 이어서 짜요.`;
}

export function registrationDeadlineHint(state: CreateFormState): { tone: 'info' | 'warning'; text: string } | null {
  if (state.registrationDeadlineDirty) return null;
  if (!state.scheduledAt) return { tone: 'info', text: '대회 시작을 고르면 3일 전 밤으로 미리 채워요.' };
  if (state.registrationDeadlineAt) return { tone: 'info', text: '시작 3일 전 밤으로 미리 채웠어요. 바꿔도 돼요.' };
  if (isShortLeadTime(state.scheduledAt)) {
    return { tone: 'warning', text: '대회가 곧 시작해서 미리 채우지 않았어요. 직접 정해 주세요.' };
  }
  return null;
}

/** 시작이 지금부터 3일 이내인가. 과거 시작은 아니다(시작 칸 오류가 따로 말한다). */
export function isShortLeadTime(scheduledAt: string): boolean {
  const start = localTimestamp(scheduledAt);
  if (start === null) return false;
  const remaining = start - Date.now();
  return remaining >= 0 && remaining <= DEADLINE_SUGGEST_DAYS * DAY_MS;
}

/** 채우지 않은 필수 칸 이름. 순서는 화면 위에서 아래다. */
export function remainingRequiredLabels(state: CreateFormState): string[] {
  const remaining: string[] = [];
  if (!state.sportId) remaining.push(ERROR_FIELD_LABELS.sportId);
  if (!state.title.trim()) remaining.push(ERROR_FIELD_LABELS.title);
  if (!state.scheduledAt) remaining.push(ERROR_FIELD_LABELS.scheduledAt);
  if (!state.registrationDeadlineAt) remaining.push(ERROR_FIELD_LABELS.registrationDeadlineAt);
  if (!state.teamCount.trim()) remaining.push(ERROR_FIELD_LABELS.teamCount);
  return remaining;
}

export type CreateBarStatus = { tone: 'todo' | 'ok' | 'error'; text: string; count?: number };

export function summarizeBarStatus(state: CreateFormState, errors: CreateFormErrors): CreateBarStatus {
  const remaining = remainingRequiredLabels(state);
  const wrongField = ERROR_FIELD_ORDER.find(
    (field) => errors[field] && !remaining.includes(ERROR_FIELD_LABELS[field]),
  );
  if (wrongField) {
    return { tone: 'error', text: `${josa(ERROR_FIELD_LABELS[wrongField], ['을', '를'])} 고쳐 주세요` };
  }
  if (remaining.length === 0) return { tone: 'ok', text: '필수 정보를 모두 채웠어요' };
  const [first, second] = remaining;
  const text =
    remaining.length === 1
      ? `${josa(first, ['이', '가'])} 남았어요`
      : remaining.length === 2
        ? `${josa(first, ['과', '와'])} ${josa(second, ['이', '가'])} 남았어요`
        : `${first} 외 ${remaining.length - 1}가지가 남았어요`;
  return { tone: 'todo', count: remaining.length, text };
}

/** 신청 마감 제안 = 시작 3일 전 23:59(KST). 이미 지난 시각이면 제안하지 않는다. */
function suggestRegistrationDeadline(scheduledAt: string): string {
  const start = localTimestamp(scheduledAt);
  if (start === null) return '';
  const day = toKstDateString(new Date(kstMidnightMs(toKstDateString(new Date(start))) - DEADLINE_SUGGEST_DAYS * DAY_MS));
  const suggestion = `${day}T23:59`;
  const suggestionTs = localTimestamp(suggestion);
  return suggestionTs !== null && suggestionTs > Date.now() ? suggestion : '';
}

/** 입력값(KST 벽시계)의 인스턴트 밀리초. 비었거나 깨졌으면 null. */
function localTimestamp(value: string): number | null {
  const iso = kstDatetimeLocalToIso(value);
  return iso ? Date.parse(iso) : null;
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function isValidTeamCount(value: string): boolean {
  const parsed = parseInteger(value);
  return parsed !== null && parsed >= TEAM_COUNT_MIN && parsed <= TEAM_COUNT_MAX;
}
