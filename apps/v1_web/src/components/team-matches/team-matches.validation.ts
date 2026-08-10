import { labelToLevelCode } from '@/lib/v1-levels';
import type { V1TeamMatchMutationPayload } from '@/types/api';
import type { TeamMatchCreateStep, TeamMatchCreateViewModel } from './team-matches.types';

/**
 * 팀매치 생성/수정 위저드의 "필수값이 뭔지" 를 판정하는 단일 소스.
 *
 * 이전에는 buildTeamMatchMutationPayload 가 하나라도 비면 무조건 payload 전체를 null로
 * 반환하는 단일 boolean 게이트였다. 그래서 사용자가 실제로 겪은 사고(종목·지역·제목은 이미
 * 채워져 있는데 "종목, 지역, 제목, 장소, 날짜를 모두 입력해 주세요" 라는 고정 문구가 뜬 것)가
 * 발생했다. 이 파일의 RULES 테이블이 "무엇이 왜 필요한지"의 유일한 출처이며,
 * ① 스텝 이동 시 즉시 검증(getTeamMatchStepErrors) ② 최종 제출 시 실제 결측 필드 안내
 * (buildTeamMatchPayloadResult) 둘 다 이 테이블을 재사용해 문자열 드리프트를 구조적으로 막는다.
 */

type TeamMatchDraft = TeamMatchCreateViewModel['draft'];

export type TeamMatchFieldKey = keyof TeamMatchDraft | 'hostTeamId' | 'sportId' | 'regionId';

export type TeamMatchMissingField = {
  field: TeamMatchFieldKey;
  label: string;
  step: TeamMatchCreateStep;
};

export type TeamMatchValidationContext = {
  hostTeamId: string;
  sportId: string;
  regionId: string;
  draft: TeamMatchDraft;
};

const defaultGenderRule = '성별 무관';

function parseStartsAt(draft: TeamMatchDraft): Date | null {
  if (!draft.date || !draft.startTime) return null;
  const value = new Date(`${draft.date}T${draft.startTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function parseDeadlineAt(draft: TeamMatchDraft): Date | null {
  if (!draft.deadlineDate || !draft.deadlineTime) return null;
  const value = new Date(`${draft.deadlineDate}T${draft.deadlineTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

const RULES: Array<{
  field: TeamMatchFieldKey;
  label: string;
  step: TeamMatchCreateStep;
  isSatisfied: (ctx: TeamMatchValidationContext) => boolean;
}> = [
  { field: 'hostTeamId', label: '팀을 선택해 주세요', step: 'team', isSatisfied: (ctx) => Boolean(ctx.hostTeamId) },
  { field: 'sportId', label: '종목을 선택해 주세요', step: 'sport', isSatisfied: (ctx) => Boolean(ctx.sportId) },
  { field: 'title', label: '매치 제목을 입력해 주세요', step: 'info', isSatisfied: (ctx) => Boolean(ctx.draft.title.trim()) },
  { field: 'regionId', label: '지역을 선택해 주세요', step: 'place-time', isSatisfied: (ctx) => Boolean(ctx.regionId) },
  { field: 'venue', label: '장소를 입력해 주세요', step: 'place-time', isSatisfied: (ctx) => Boolean(ctx.draft.venue.trim()) },
  { field: 'date', label: '날짜를 입력해 주세요', step: 'place-time', isSatisfied: (ctx) => Boolean(ctx.draft.date) },
  { field: 'startTime', label: '시작 시간을 입력해 주세요', step: 'place-time', isSatisfied: (ctx) => Boolean(ctx.draft.startTime) },
  {
    field: 'startTime',
    label: '시작 시간은 지금 이후로 설정해 주세요',
    step: 'place-time',
    isSatisfied: (ctx) => {
      const startsAt = parseStartsAt(ctx.draft);
      // 날짜·시작 시간이 아예 비어 있으면 위 규칙이 이미 잡는다 — 여기서는 값이 있을 때만 판단.
      if (!startsAt) return true;
      return startsAt > new Date();
    },
  },
  {
    field: 'deadlineTime',
    label: '신청 마감은 시작 시간보다 빨라야 해요',
    step: 'place-time',
    isSatisfied: (ctx) => {
      const deadlineAt = parseDeadlineAt(ctx.draft);
      // 마감을 아예 설정하지 않으면 "경기 시작 전까지" 상시 접수로 통과.
      if (!deadlineAt) return true;
      const startsAt = parseStartsAt(ctx.draft);
      if (!startsAt) return true;
      return deadlineAt < startsAt;
    },
  },
];

export function getTeamMatchMissingFields(ctx: TeamMatchValidationContext): TeamMatchMissingField[] {
  return RULES.filter((rule) => !rule.isSatisfied(ctx)).map(({ field, label, step }) => ({ field, label, step }));
}

/** RULES에서 특정 필드의 (첫) label/step을 찾는다 — 결측 필드 안내 문구를 한 곳에서만 관리. */
function missingFieldFor(field: TeamMatchFieldKey): TeamMatchMissingField {
  const rule = RULES.find((r) => r.field === field);
  if (!rule) throw new Error(`No validation rule registered for field: ${field}`);
  return { field: rule.field, label: rule.label, step: rule.step };
}

/** 특정 스텝에 속한 필드만 골라 field → 문구 맵으로 변환한다(CreateField의 error prop에 바로 꽂는 용도). */
export function getTeamMatchStepErrors(ctx: TeamMatchValidationContext, step: TeamMatchCreateStep): Partial<Record<TeamMatchFieldKey, string>> {
  const errors: Partial<Record<TeamMatchFieldKey, string>> = {};
  for (const missing of getTeamMatchMissingFields(ctx)) {
    if (missing.step === step && !errors[missing.field]) errors[missing.field] = missing.label;
  }
  return errors;
}

/** edit 모드처럼 스텝 구분 없이 한 화면에 모든 필드가 있을 때 쓰는 평탄화된 맵. */
export function toFieldErrorMap(missing: TeamMatchMissingField[]): Partial<Record<TeamMatchFieldKey, string>> {
  const errors: Partial<Record<TeamMatchFieldKey, string>> = {};
  for (const item of missing) {
    if (!errors[item.field]) errors[item.field] = item.label;
  }
  return errors;
}

/** draftFromTeamMatchEdit(team-matches-create-client.tsx)와 payload 빌더가 공유하는 성별 조건 정규화. */
export function normalizeGenderRule(value?: string | null) {
  if (value === '남' || value === '여') return value;
  return defaultGenderRule;
}

export type TeamMatchPayloadResult =
  | { payload: V1TeamMatchMutationPayload; missingFields?: undefined }
  | { payload?: undefined; missingFields: TeamMatchMissingField[] };

export function buildTeamMatchPayloadResult(draft: TeamMatchDraft, hostTeamId: string, sportId: string, regionId: string): TeamMatchPayloadResult {
  const ctx: TeamMatchValidationContext = { hostTeamId, sportId, regionId, draft };
  const missingFields = getTeamMatchMissingFields(ctx);
  if (missingFields.length > 0) return { missingFields };

  const startsAt = parseStartsAt(draft);
  if (!startsAt) {
    // RULES의 'date'/'startTime' 존재 검사(빈 문자열 아님)는 통과했지만 실제로는
    // new Date(...)가 실패하는 값 — 예: localStorage에서 복원된 손상된 draft.
    // 단언 후 크래시 대신 결측 필드로 되돌려 상위 UI가 그 스텝으로 안내하게 한다.
    return { missingFields: [missingFieldFor('date'), missingFieldFor('startTime')] };
  }
  const endsAt = draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : null;
  const deadlineAt = parseDeadlineAt(draft);

  return {
    payload: {
      hostTeamId,
      sportId,
      regionId,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt && endsAt > startsAt ? endsAt.toISOString() : null,
      deadlineAt: deadlineAt?.toISOString() ?? null,
      imageUrl: draft.imageUrl.trim() || null,
      manualPlaceName: draft.venue.trim(),
      addressText: draft.address.trim() || null,
      costNote: draft.cost || draft.opponentCost ? `총 ${draft.cost.toLocaleString('ko-KR')}원 · 상대팀 ${draft.opponentCost.toLocaleString('ko-KR')}원` : null,
      // rulesText는 더 이상 쓰기 대상이 아니다 — 경기조건은 matchFormat/matchStyle/uniformColor
      // 구조화 컬럼으로만 쓴다(team-matches-create-client.tsx의 원래 buildTeamMatchMutationPayload
      // 설계를 그대로 따른다 — 위저드 단계 게이팅 리팩터로 이 파일에 옮겨오며 함께 이관).
      rulesText: null,
      minLevelCode: draft.grade.trim() ? labelToLevelCode(draft.grade) : null,
      maxLevelCode: draft.grade.trim() ? labelToLevelCode(draft.grade) : null,
      genderRule: normalizeGenderRule(draft.gender),
      matchFormat: draft.format.trim() || null,
      matchStyle: draft.style.map((item) => item.trim()).filter(Boolean),
      uniformColor: draft.uniform.trim() || null,
    },
  };
}

/** CreateProgress 배지: 각 스텝이 자기 필수 필드를 전부 채웠는지(필수 필드가 없는 스텝은 항상 완료). */
export function getCompleteTeamMatchSteps(ctx: TeamMatchValidationContext, steps: TeamMatchCreateStep[]): TeamMatchCreateStep[] {
  const missingSteps = new Set(getTeamMatchMissingFields(ctx).map((item) => item.step));
  return steps.filter((step) => !missingSteps.has(step));
}

/** steps를 순서대로 검사해 결측 필드가 있는 첫 스텝을 반환한다(없으면 null).
 * 진행 표시줄 클릭 이동에서 target 이전 스텝이 전부 유효한지 판정할 때 쓴다. */
export function firstIncompleteTeamMatchStep(
  ctx: TeamMatchValidationContext,
  steps: TeamMatchCreateStep[],
): TeamMatchCreateStep | null {
  const missingSteps = new Set(getTeamMatchMissingFields(ctx).map((item) => item.step));
  return steps.find((step) => missingSteps.has(step)) ?? null;
}
