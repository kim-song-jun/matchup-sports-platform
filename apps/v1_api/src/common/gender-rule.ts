import type { Prisma } from '@prisma/client';

/** 성별 조건(genderRule) 정본 값. 쓰기 경로(DTO)는 이 값만 받는다. */
export const GENDER_RULES = ['성별 무관', '남', '여'] as const;
export type GenderRule = (typeof GENDER_RULES)[number];

const ANY_GENDER_RULE: GenderRule = '성별 무관';

// 정본 이전에 저장됐거나 다른 클라이언트가 보낸 "성별 무관" 별칭. 읽기·필터에서만 정본으로 접는다.
const ANY_GENDER_RULE_ALIASES = ['무관', 'any'] as const;

/**
 * 저장된 값을 정본으로 접는다. 정본도 별칭도 아닌 값(내부 코드·자유 입력)은 null —
 * 응답에 원문으로 내보내지 않는다. 별칭 목록은 genderRuleColumnFilter 의 `in` 과 같은 집합이라
 * 대소문자·공백 변형은 별칭이 아니다(표시도 필터도 같이 제외된다).
 */
export function normalizeGenderRule(raw: string | null | undefined): GenderRule | null {
  if (!raw) return null;
  if ((GENDER_RULES as readonly string[]).includes(raw)) return raw as GenderRule;
  return (ANY_GENDER_RULE_ALIASES as readonly string[]).includes(raw) ? ANY_GENDER_RULE : null;
}

/** genderRule 컬럼용 where 조각. "성별 무관"은 별칭으로 저장된 행도 포함한다. */
export function genderRuleColumnFilter(rule: GenderRule | '무관'): Prisma.StringNullableFilter | string {
  if (rule !== ANY_GENDER_RULE && rule !== '무관') return rule;
  return { in: [ANY_GENDER_RULE, ...ANY_GENDER_RULE_ALIASES] };
}
