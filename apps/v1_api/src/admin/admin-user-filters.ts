import type { Prisma, V1AuthProvider } from '@prisma/client';

export const USER_SIGNUP_FILTERS = [
  'required_complete', 'onboarding_complete', 'incomplete',
  'terms_required', 'profile_required', 'profile_deferred',
] as const;
export type UserSignupFilter = typeof USER_SIGNUP_FILTERS[number];
export const USER_AUTH_PROVIDERS = ['email', 'kakao', 'apple'] as const satisfies readonly V1AuthProvider[];

// These describe signup progress, not acceptance of a later terms revision.
// A deferred social profile has an auto-generated nickname, so profile existence alone is insufficient.
const termsRequired: Prisma.V1UserWhereInput = {
  OR: [
    { onboardingStatus: 'social_terms_required' },
    { onboardingStatus: 'not_started', termsConsents: { none: {} } },
  ],
};
const profilePresent: Prisma.V1UserWhereInput = {
  // Withdrawal anonymizes and soft-deletes the profile. Keep the completed signup history.
  profile: { is: { nickname: { not: '' } } },
};
const profileDeferred: Prisma.V1UserWhereInput = { onboardingStatus: 'social_profile_deferred' };
const profileRequired: Prisma.V1UserWhereInput = {
  AND: [
    { NOT: termsRequired },
    { NOT: profileDeferred },
    { OR: [{ onboardingStatus: { in: ['terms_done', 'social_profile_required'] } }, { NOT: profilePresent }] },
  ],
};
const incomplete: Prisma.V1UserWhereInput = { OR: [termsRequired, profileRequired, profileDeferred] };
const requiredComplete: Prisma.V1UserWhereInput = { NOT: incomplete };

export const USER_SIGNUP_WHERE: Record<UserSignupFilter, Prisma.V1UserWhereInput> = {
  required_complete: requiredComplete,
  onboarding_complete: { AND: [requiredComplete, { onboardingStatus: 'completed' }] },
  incomplete,
  terms_required: termsRequired,
  profile_required: profileRequired,
  profile_deferred: profileDeferred,
};

export function signupFilterWhere(values?: readonly UserSignupFilter[]): Prisma.V1UserWhereInput {
  return values?.length ? { OR: values.map((key) => USER_SIGNUP_WHERE[key]) } : {};
}

export function authProviderWhere(values?: readonly V1AuthProvider[]): Prisma.V1UserWhereInput {
  // Relation `some` counts users rather than identities, including linked accounts only once.
  return values?.length ? { authIdentities: { some: { status: 'active', provider: { in: [...values] } } } } : {};
}

export function signupStage(row: { onboardingStatus: string; profile: { nickname: string } | null; termsConsents: unknown[] }) {
  if (row.onboardingStatus === 'social_terms_required'
    || (row.onboardingStatus === 'not_started' && row.termsConsents.length === 0)) return 'terms_required';
  if (row.onboardingStatus === 'social_profile_deferred') return 'profile_deferred';
  if (['terms_done', 'social_profile_required'].includes(row.onboardingStatus)
    || !row.profile?.nickname) return 'profile_required';
  return row.onboardingStatus === 'completed' ? 'onboarding_complete' : 'required_complete';
}

const PHONE_QUERY_MIN_DIGITS = 4;
const PHONE_LIKE_QUERY = /^[\d\s-]+$/;

/**
 * 검색어가 전화번호처럼 보이면(숫자·하이픈·공백뿐, 숫자 4자리 이상) 하이픈을 뺀 숫자만 돌려준다.
 * 저장된 번호는 하이픈 없는 11자리라, `010-1234-5678` 도 `01012345678` 도 같은 조건으로 찾는다.
 * 닉네임이 숫자뿐이어도 기존 이름·이메일 조건은 그대로 두고 OR 로 합치므로 놓치지 않는다.
 */
export function phoneSearchDigits(q: string): string | null {
  const text = q.trim();
  if (!PHONE_LIKE_QUERY.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  return digits.length >= PHONE_QUERY_MIN_DIGITS ? digits : null;
}

/** 회원 목록 검색 조건: 닉네임·실명·표시 이름·이메일·전화번호(부분 일치). */
export function userSearchWhere(q?: string): Prisma.V1UserWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: 'insensitive' as const };
  const phoneDigits = phoneSearchDigits(q);
  return {
    OR: [
      { profile: { nickname: contains } },
      { profile: { realName: contains } },
      { profile: { displayName: contains } },
      { email: contains },
      ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
    ],
  };
}
