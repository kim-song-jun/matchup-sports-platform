import { labelToLevelCode } from '@/lib/v1-levels';
import type { V1MatchMutationPayload } from '@/types/api';
import type { MatchCreateStep, MatchCreateViewModel } from './matches.types';

/**
 * 개인매치 생성/수정 위저드의 "필수값이 뭔지" 를 판정하는 단일 소스.
 * team-matches.validation.ts 와 동일한 목적 — buildMatchMutationPayload가 하나라도 비면
 * payload 전체를 null로 반환하던 단일 boolean 게이트를 없애고, 스텝별 즉시 검증과 최종 제출
 * 시 결측 필드 안내가 같은 RULES 테이블을 공유하게 한다.
 */

type MatchDraft = MatchCreateViewModel['draft'];

export type MatchFieldKey = keyof MatchDraft | 'sportId' | 'regionId';

export type MatchMissingField = {
  field: MatchFieldKey;
  label: string;
  step: MatchCreateStep;
};

export type MatchValidationContext = {
  sportId: string;
  regionId: string;
  draft: MatchDraft;
};

const defaultGenderRule = '성별 무관';

function parseStartsAt(draft: MatchDraft): Date | null {
  if (!draft.date || !draft.startTime) return null;
  const value = new Date(`${draft.date}T${draft.startTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function parseDeadlineAt(draft: MatchDraft): Date | null {
  if (!draft.deadlineDate || !draft.deadlineTime) return null;
  const value = new Date(`${draft.deadlineDate}T${draft.deadlineTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

const RULES: Array<{
  field: MatchFieldKey;
  label: string;
  step: MatchCreateStep;
  isSatisfied: (ctx: MatchValidationContext) => boolean;
}> = [
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
      if (!deadlineAt) return true;
      const startsAt = parseStartsAt(ctx.draft);
      if (!startsAt) return true;
      return deadlineAt < startsAt;
    },
  },
];

export function getMatchMissingFields(ctx: MatchValidationContext): MatchMissingField[] {
  return RULES.filter((rule) => !rule.isSatisfied(ctx)).map(({ field, label, step }) => ({ field, label, step }));
}

/** RULES에서 특정 필드의 (첫) label/step을 찾는다 — 결측 필드 안내 문구를 한 곳에서만 관리. */
function missingFieldFor(field: MatchFieldKey): MatchMissingField {
  const rule = RULES.find((r) => r.field === field);
  if (!rule) throw new Error(`No validation rule registered for field: ${field}`);
  return { field: rule.field, label: rule.label, step: rule.step };
}

export function getMatchStepErrors(ctx: MatchValidationContext, step: MatchCreateStep): Partial<Record<MatchFieldKey, string>> {
  const errors: Partial<Record<MatchFieldKey, string>> = {};
  for (const missing of getMatchMissingFields(ctx)) {
    if (missing.step === step && !errors[missing.field]) errors[missing.field] = missing.label;
  }
  return errors;
}

/** edit 모드처럼 스텝 구분 없이 한 화면에 모든 필드가 있을 때 쓰는 평탄화된 맵. */
export function toFieldErrorMap(missing: MatchMissingField[]): Partial<Record<MatchFieldKey, string>> {
  const errors: Partial<Record<MatchFieldKey, string>> = {};
  for (const item of missing) {
    if (!errors[item.field]) errors[item.field] = item.label;
  }
  return errors;
}

/** draftFromMatchEdit(matches-create-client.tsx)와 payload 빌더가 공유하는 성별 조건 정규화. */
export function normalizeGenderRule(value?: string | null) {
  if (value === '남' || value === '여') return value;
  return defaultGenderRule;
}

export type MatchPayloadResult =
  | { payload: V1MatchMutationPayload; missingFields?: undefined }
  | { payload?: undefined; missingFields: MatchMissingField[] };

export function buildMatchPayloadResult(draft: MatchDraft, sportId: string, regionId: string): MatchPayloadResult {
  const ctx: MatchValidationContext = { sportId, regionId, draft };
  const missingFields = getMatchMissingFields(ctx);
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
      sportId,
      regionId,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      imageUrl: draft.image || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt && endsAt > startsAt ? endsAt.toISOString() : null,
      deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
      capacity: Math.max(Number(draft.capacity) || 2, 2),
      manualPlaceName: draft.venue.trim(),
      addressText: draft.address.trim() || null,
      rulesText: draft.rules.trim() || null,
      minLevelCode: labelToLevelCode(draft.minLevel),
      maxLevelCode: labelToLevelCode(draft.maxLevel),
      genderRule: normalizeGenderRule(draft.gender),
    },
  };
}

/** CreateProgress 배지: 각 스텝이 자기 필수 필드를 전부 채웠는지(필수 필드가 없는 스텝은 항상 완료). */
export function getCompleteMatchSteps(ctx: MatchValidationContext, steps: MatchCreateStep[]): MatchCreateStep[] {
  const missingSteps = new Set(getMatchMissingFields(ctx).map((item) => item.step));
  return steps.filter((step) => !missingSteps.has(step));
}
