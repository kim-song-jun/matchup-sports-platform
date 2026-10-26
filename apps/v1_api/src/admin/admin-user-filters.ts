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
  profile: { is: { deletedAt: null, nickname: { not: '' } } },
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

export function signupStage(row: { onboardingStatus: string; profile: { nickname: string; deletedAt: Date | null } | null; termsConsents: unknown[] }) {
  if (row.onboardingStatus === 'social_terms_required'
    || (row.onboardingStatus === 'not_started' && row.termsConsents.length === 0)) return 'terms_required';
  if (row.onboardingStatus === 'social_profile_deferred') return 'profile_deferred';
  if (['terms_done', 'social_profile_required'].includes(row.onboardingStatus)
    || !row.profile?.nickname || row.profile.deletedAt) return 'profile_required';
  return row.onboardingStatus === 'completed' ? 'onboarding_complete' : 'required_complete';
}
