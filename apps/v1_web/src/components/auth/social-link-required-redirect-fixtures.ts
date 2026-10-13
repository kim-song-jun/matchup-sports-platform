import type { V1AuthMe, V1CurrentSignupTerms, V1OnboardingPreferencePayload } from '@/types/api';

export const SPORT = '22222222-2222-4222-8222-222222222222';
export const LEVEL = '33333333-3333-4333-8333-333333333333';
export const REGION = '44444444-4444-4444-8444-444444444444';
export const DISTRICT = '55555555-5555-4555-8555-555555555555';
export const DOCUMENT = '66666666-6666-4666-8666-666666666666';
export const HOLDER = '88888888-8888-4888-8888-888888888888';
export const PENDING = '99999999-9999-4999-8999-999999999999';
type SignupStatus = 'social_profile_required' | 'social_profile_deferred';
export type RequiredRoute = '/onboarding/sport' | '/terms?mode=renewal';
type PreferenceStep = V1OnboardingPreferencePayload['currentStep'];
export type FixtureStatus = SignupStatus | 'signup_done' | 'sport_done' | 'level_done' | 'region_done' | 'completed' | 'deferred';
export const requiredRoutes: RequiredRoute[] = ['/onboarding/sport', '/terms?mode=renewal'];
export const signupJourneys: Array<[SignupStatus, RequiredRoute]> = [
  ['social_profile_required', '/onboarding/sport'], ['social_profile_deferred', '/onboarding/sport'],
  ['social_profile_required', '/terms?mode=renewal'], ['social_profile_deferred', '/terms?mode=renewal'],
];
export const compliance = (accepted: boolean): NonNullable<V1CurrentSignupTerms['compliance']> => ({
  compliant: accepted, pendingRequiredDocumentIds: accepted ? [] : [DOCUMENT], nextRoute: accepted ? null : '/terms?mode=renewal',
});
export const terms = (accepted: boolean): V1CurrentSignupTerms => ({
  context: 'signup', ready: true,
  items: [{
    policyId: '77777777-7777-4777-8777-777777777777', code: 'service_terms', documentId: DOCUMENT, title: '서비스 이용약관',
    version: 'v2', subtitle: null, content: '필수 약관 본문', changeSummary: '약관 갱신',
    requirement: 'required', displayOrder: 1, requiresReconsent: true, enforcementAt: null,
    effectiveAt: null, accepted, requiresAction: !accepted,
  }],
  compliance: compliance(accepted),
});
export const makeAuth = (status: FixtureStatus, id = PENDING, phoneVerified = false): V1AuthMe => ({
  user: { id, email: null, phone: phoneVerified ? '01012345678' : null, accountStatus: 'active', onboardingStatus: status, authProvider: 'kakao' },
  profile: { displayName: '김러너', nickname: '카카오러너' },
  verification: { emailVerified: false, phoneVerified },
  socialSignupPrefill: null,
  termsCompliance: compliance(true),
});
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isPreferencePayload(value: unknown): value is V1OnboardingPreferencePayload {
  return isRecord(value) && ['sport', 'level', 'region', 'confirm'].some((step) => step === value.currentStep)
    && Object.keys(value).every((key) => ['currentStep', 'sports', 'regions'].includes(key))
    && (value.sports === undefined || (Array.isArray(value.sports) && value.sports.length <= 1 && value.sports.every((sport: unknown) =>
      isRecord(sport) && sport.sportId === SPORT && (sport.levelId == null || sport.levelId === LEVEL)
      && Object.keys(sport).every((key) => ['sportId', 'levelId'].includes(key)))))
    && (value.regions === undefined || (Array.isArray(value.regions) && value.regions.length <= 1 && value.regions.every((region: unknown) =>
      isRecord(region) && region.regionId === DISTRICT && typeof region.primary === 'boolean'
      && Object.keys(region).every((key) => ['regionId', 'primary'].includes(key)))));
}
export function stepForRoute(pathname: string): PreferenceStep | null {
  switch (pathname) {
    case '/onboarding/sport': return 'sport';
    case '/onboarding/level': return 'level';
    case '/onboarding/region': return 'region';
    case '/onboarding/confirm': return 'confirm';
    default: return null;
  }
}
