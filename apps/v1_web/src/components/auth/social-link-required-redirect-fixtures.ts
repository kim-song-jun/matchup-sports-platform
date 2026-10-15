import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { expect } from 'vitest';
import { RECORD_CONSENT_POLICY_HASH } from '@/lib/record-consent';
import type { V1AuthMe, V1AuthSessionResponse, V1CurrentSignupTerms, V1OnboardingDetail, V1OnboardingPreferencePayload } from '@/types/api';

export const SPORT = '22222222-2222-4222-8222-222222222222';
export const LEVEL = '33333333-3333-4333-8333-333333333333';
export const REGION = '44444444-4444-4444-8444-444444444444';
export const DISTRICT = '55555555-5555-4555-8555-555555555555';
export const DOCUMENT = '66666666-6666-4666-8666-666666666666';
export const ADDED_DOCUMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const HOLDER = '88888888-8888-4888-8888-888888888888';
export const PENDING = '99999999-9999-4999-8999-999999999999';
type SignupStatus = 'social_profile_required' | 'social_profile_deferred';
type TermsSnapshot = V1CurrentSignupTerms & { compliance: NonNullable<V1CurrentSignupTerms['compliance']> };
export type RequiredRoute = '/onboarding/sport' | '/terms?mode=renewal';
type PreferenceStep = V1OnboardingPreferencePayload['currentStep'];
export type FixtureStatus = SignupStatus | 'signup_done' | 'sport_done' | 'level_done' | 'region_done' | 'completed' | 'deferred';
export const requiredRoutes: RequiredRoute[] = ['/onboarding/sport', '/terms?mode=renewal'];
export const compliance = (accepted: boolean): NonNullable<V1CurrentSignupTerms['compliance']> => ({
  compliant: accepted, pendingRequiredDocumentIds: accepted ? [] : [DOCUMENT], nextRoute: accepted ? null : '/terms?mode=renewal',
});
export const terms = (accepted: boolean): TermsSnapshot => ({
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
export const authSession = (auth: V1AuthMe, nextRoute?: string): V1AuthSessionResponse => ({
  ...auth, session: { userId: auth.user.id, userEmail: auth.user.email }, next: nextRoute ? { route: nextRoute } : undefined,
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

type RedirectFixtureState = {
  auth: V1AuthMe;
  onboarding: V1OnboardingDetail;
  requiredRoute: RequiredRoute;
  renewalRequired: boolean;
  acceptedTerms: boolean;
  additionalTermsAccepted: boolean;
  consentResult: 'accepted' | 'partial' | 'failure';
  loginRequests: number;
  profileRequests: number;
  phoneOnlyRequests: number;
  completeRequests: number;
  acceptRequests: number;
  savedSteps: PreferenceStep[];
};
function initialState(): RedirectFixtureState {
  return {
    auth: makeAuth('social_profile_required'),
    onboarding: { status: 'signup_done', currentStep: 'sport', canResume: true, missing: ['sports'], sports: [], regions: [], regionOptional: true },
    requiredRoute: '/onboarding/sport', renewalRequired: false, acceptedTerms: false, additionalTermsAccepted: false, consentResult: 'accepted',
    loginRequests: 0, profileRequests: 0, phoneOnlyRequests: 0, completeRequests: 0, acceptRequests: 0, savedSteps: [],
  };
}
function currentTerms(state: RedirectFixtureState): TermsSnapshot {
  const current = terms(state.acceptedTerms);
  if (state.consentResult !== 'partial' || !state.acceptedTerms) return current;
  return { ...current, items: [...current.items, {
    policyId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'privacy_policy', documentId: ADDED_DOCUMENT,
    title: '추가 필수 약관', version: 'v2', subtitle: null, content: '새로 적용된 필수 문서', changeSummary: '동의 대상 추가',
    requirement: 'required', displayOrder: 2, requiresReconsent: true, enforcementAt: null, effectiveAt: null,
    accepted: state.additionalTermsAccepted, requiresAction: !state.additionalTermsAccepted,
  }], compliance: state.additionalTermsAccepted ? compliance(true)
    : { compliant: false, pendingRequiredDocumentIds: [ADDED_DOCUMENT], nextRoute: '/terms?mode=renewal' } };
}
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const failure = (message: string, status = 400) => HttpResponse.json({ status: 'error', statusCode: status, code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'VALIDATION_FAILED', message }, { status });
function authenticatedEntry(state: RedirectFixtureState) {
  if (state.renewalRequired || state.requiredRoute.startsWith('/terms')) state.auth.termsCompliance = compliance(false);
  if (state.requiredRoute.startsWith('/terms')) state.onboarding = { ...state.onboarding, status: 'completed', currentStep: 'done', canResume: false, missing: [],
    sports: [{ sportId: SPORT, sportName: '풋살', levelId: LEVEL, levelName: '초급' }],
  };
  const response = success(authSession(state.auth, state.requiredRoute));
  if (state.acceptedTerms) state.auth = { ...state.auth, termsCompliance: compliance(true) };
  return response;
}
export function createRedirectFixture() {
  const state = initialState();
  const server = setupServer(
    http.get('*/api/v1/auth/me', () => success(state.auth)),
    http.post('*/api/v1/logs/client-error', () => success({})),
    http.post('*/api/v1/verification/phone/request', () => HttpResponse.json({ status: 'error', statusCode: 409, code: 'PHONE_CONFLICT', message: '이미 사용 중인 번호예요.' }, { status: 409 })),
    http.post('*/api/v1/auth/login', async ({ request }) => {
      expect(await request.json()).toEqual({ email: 'owner@example.test', password: 'synthetic-password' });
      state.loginRequests += 1;
      state.auth = makeAuth(state.requiredRoute.startsWith('/onboarding') ? 'signup_done' : 'completed', HOLDER, true);
      state.auth.user = { ...state.auth.user, email: 'owner@example.test', authProvider: 'email' };
      return authenticatedEntry(state);
    }),
    http.get('*/api/v1/auth/check-nickname', () => success({ available: true })),
    http.post('*/api/v1/auth/social-profile', async ({ request }) => {
      expect(await request.json()).toEqual({ nickname: '카카오러너', displayName: '김러너', phone: '01087654321',
        birthDate: '20000229', gender: 'female', recordConsent: { granted: true, policyHash: RECORD_CONSENT_POLICY_HASH } });
      state.profileRequests += 1;
      state.auth = makeAuth('signup_done', PENDING, true);
      state.auth.user.phone = '01087654321';
      return authenticatedEntry(state);
    }),
    ...['auth/phone/issue', 'auth/phone/verify', 'auth/social-link/preview', 'auth/social-link'].map((path) =>
      http.post('*/api/v1/' + path, () => {
        state.phoneOnlyRequests += 1;
        return HttpResponse.json({ status: 'error', statusCode: 409, code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF',
          message: '기존 계정으로 로그인해 주세요.' }, { status: 409 });
      })),
    http.get('*/api/v1/master/sports', () => success([{ id: SPORT, code: 'futsal', name: '풋살', levels: [{ id: LEVEL, name: '초급' }] }])),
    http.get('*/api/v1/master/regions', () => success([{ id: REGION, name: '서울', parentId: null, level: 1, children: [{ id: DISTRICT, name: '마포구', parentId: REGION, level: 2 }] }])),
    http.get('*/api/v1/onboarding', () => success(state.onboarding)),
    http.patch('*/api/v1/onboarding/preferences', async ({ request }) => {
      const body: unknown = await request.json();
      if (!isPreferencePayload(body)) return failure('온보딩 입력이 올바르지 않아요.');
      state.savedSteps.push(body.currentStep);
      const sports = body.sports ?? [];
      const status: FixtureStatus = sports.length === 0 ? 'signup_done' : sports.some((sport) => !sport.levelId) ? 'sport_done'
        : body.currentStep === 'region' || body.currentStep === 'confirm' ? 'region_done' : 'level_done';
      state.onboarding = { ...state.onboarding, status, currentStep: body.currentStep,
        sports: body.sports?.map((sport) => ({ sportId: sport.sportId, sportName: '풋살', levelId: sport.levelId ?? null, levelName: sport.levelId ? '초급' : null })) ?? state.onboarding.sports,
        regions: body.regions?.map((region) => ({ ...region, name: '마포구' })) ?? state.onboarding.regions,
      };
      state.onboarding.missing = state.onboarding.sports.length === 0 ? ['sports'] : state.onboarding.sports.some((sport) => !sport.levelId) ? ['levels'] : [];
      state.auth = { ...state.auth, user: { ...state.auth.user, onboardingStatus: status } };
      return success({ status, currentStep: body.currentStep, missing: state.onboarding.missing, canContinue: state.onboarding.missing.length === 0,
        sports: sports.map((sport) => ({ sportId: sport.sportId, levelId: sport.levelId ?? null })), regions: body.regions ?? [],
      });
    }),
    http.post('*/api/v1/onboarding/complete', () => {
      state.completeRequests += 1;
      if (state.onboarding.missing.length > 0) return failure('Onboarding completion requirements are not met');
      state.auth = { ...state.auth, user: { ...state.auth.user, onboardingStatus: 'completed' } };
      state.onboarding = { ...state.onboarding, status: 'completed', currentStep: 'done', canResume: false, missing: [] };
      return success({ status: 'completed', missing: [], limited: false, next: { route: '/home', reason: 'onboarding_completed' } });
    }),
    http.post('*/api/v1/onboarding/defer', () => {
      state.auth = { ...state.auth, user: { ...state.auth.user, onboardingStatus: 'deferred' } };
      state.onboarding = { ...state.onboarding, status: 'deferred', currentStep: 'confirm' };
      return success({ status: 'deferred', missing: state.onboarding.missing, limited: true, next: { route: '/home', reason: 'onboarding_deferred' } });
    }),
    http.get('*/api/v1/terms/current', () => success(currentTerms(state))),
    http.post('*/api/v1/terms/consents', async ({ request }) => {
      const additional = state.consentResult === 'partial' && state.acceptedTerms;
      expect(await request.json()).toEqual({ documentIds: [additional ? ADDED_DOCUMENT : DOCUMENT] });
      state.acceptRequests += 1;
      if (state.consentResult === 'failure') return failure('약관 저장 응답이 지연됐어요.', 503);
      if (additional) state.additionalTermsAccepted = true;
      state.acceptedTerms = true;
      const result = currentTerms(state);
      state.auth = { ...state.auth, termsCompliance: result.compliance };
      return success(result);
    }),
  );
  return { state, server, reset: () => Object.assign(state, initialState()) };
}
