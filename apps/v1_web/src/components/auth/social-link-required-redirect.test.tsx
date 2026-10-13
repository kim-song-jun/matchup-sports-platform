import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AuthMe, V1CurrentSignupTerms, V1OnboardingDetail, V1OnboardingPreferencePayload } from '@/types/api';
import { getSavedRedirectPath, saveRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { SocialSignupClient } from './social-signup-client';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { OnboardingClient } from './onboarding-client';
import { TermsClient } from './terms-client';

const navigation = vi.hoisted(() => ({ pathname: '/signup/social', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const SPORT = '22222222-2222-4222-8222-222222222222';
const LEVEL = '33333333-3333-4333-8333-333333333333';
const REGION = '44444444-4444-4444-8444-444444444444';
const DISTRICT = '55555555-5555-4555-8555-555555555555';
const DOCUMENT = '66666666-6666-4666-8666-666666666666';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const terms = (accepted: boolean): V1CurrentSignupTerms => ({
  context: 'signup', ready: true,
  items: [{
    policyId: 'policy-1', code: 'service_terms', documentId: DOCUMENT, title: '서비스 이용약관',
    version: 'v2', subtitle: null, content: '필수 약관 본문', changeSummary: '약관 갱신',
    requirement: 'required', displayOrder: 1, requiresReconsent: true, enforcementAt: null,
    effectiveAt: null, accepted, requiresAction: !accepted,
  }],
  compliance: { compliant: accepted, pendingRequiredDocumentIds: accepted ? [] : [DOCUMENT], nextRoute: accepted ? null : '/terms?mode=renewal' },
});
const makeAuth = (status: string, id = 'pending-1'): V1AuthMe => ({
  user: { id, email: null, onboardingStatus: status, authProvider: 'kakao' },
  profile: { displayName: '김러너', nickname: '카카오러너' },
  verification: { emailVerified: false, phoneVerified: false },
  socialSignupPrefill: null,
  termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
});
let auth: V1AuthMe;
let onboarding: V1OnboardingDetail;
let requiredRoute: '/onboarding/sport' | '/terms?mode=renewal';
let acceptedTerms: boolean;
let linkRequests: number;
let completeRequests: number;
let acceptRequests: number;
let savedSteps: string[];
let client: QueryClient;
const server = setupServer(
  http.get('*/api/v1/auth/me', () => success(auth)),
  http.post('*/api/v1/logs/client-error', () => success({})),
  http.post('*/api/v1/verification/phone/request', () => HttpResponse.json({ status: 'error', statusCode: 409, code: 'PHONE_CONFLICT', message: '이미 사용 중인 번호예요.' }, { status: 409 })),
  http.post('*/api/v1/auth/phone/issue', () => success({ expiresAt: new Date(Date.now() + 300_000).toISOString(), devCode: '123456' })),
  http.post('*/api/v1/auth/phone/verify', () => success({ verified: true, proofToken: 'proof-1' })),
  http.post('*/api/v1/auth/social-link/preview', () => success({ maskedEmail: 'ru***@gmail.com', providers: ['email'], hasPassword: true, linkingProvider: 'kakao' })),
  http.post('*/api/v1/auth/social-link', () => {
    linkRequests += 1;
    auth = makeAuth(requiredRoute.startsWith('/onboarding') ? 'in_progress' : 'completed', 'holder-1');
    if (requiredRoute.startsWith('/terms')) auth.termsCompliance = terms(false).compliance!;
    const response = success({ ...auth, session: { userId: 'holder-1', userEmail: null }, next: { route: requiredRoute } });
    // 다른 탭이 동의한 경우에도 연결 응답의 필수 경로는 거치고 최신 약관을 확인한다.
    if (acceptedTerms) auth = { ...auth, termsCompliance: terms(true).compliance! };
    return response;
  }),
  http.get('*/api/v1/master/sports', () => success([{ id: SPORT, code: 'futsal', name: '풋살', levels: [{ id: LEVEL, name: '초급' }] }])),
  http.get('*/api/v1/master/regions', () => success([{ id: REGION, name: '서울', parentId: null, level: 1, children: [{ id: DISTRICT, name: '마포구', parentId: REGION, level: 2 }] }])),
  http.get('*/api/v1/onboarding', () => success(onboarding)),
  http.patch('*/api/v1/onboarding/preferences', async ({ request }) => {
    const body = await request.json() as V1OnboardingPreferencePayload;
    savedSteps.push(body.currentStep);
    onboarding = { ...onboarding, currentStep: body.currentStep,
      sports: (body.sports ?? []).map((sport) => ({ sportId: sport.sportId, sportName: '풋살', levelId: sport.levelId ?? null, levelName: sport.levelId ? '초급' : null })),
      regions: (body.regions ?? []).map((region) => ({ ...region, name: '마포구' })),
    };
    return success({ status: 'in_progress', missing: [], canContinue: true });
  }),
  http.post('*/api/v1/onboarding/complete', () => {
    completeRequests += 1;
    auth = { ...auth, user: { ...auth.user, onboardingStatus: 'completed' } };
    return success({ status: 'completed', missing: [], next: { route: '/home', reason: 'onboarding_completed' } });
  }),
  http.post('*/api/v1/onboarding/defer', () => {
    auth = { ...auth, user: { ...auth.user, onboardingStatus: 'deferred' } };
    return success({ status: 'deferred', missing: ['sports', 'levels'], next: { route: '/home', reason: 'onboarding_deferred' } });
  }),
  http.get('*/api/v1/terms/current', () => success(terms(acceptedTerms))),
  http.post('*/api/v1/terms/consents', async ({ request }) => {
    expect(await request.json()).toEqual({ documentIds: [DOCUMENT] });
    acceptRequests += 1;
    acceptedTerms = true;
    auth = { ...auth, termsCompliance: terms(true).compliance! };
    return success(terms(true));
  }),
);

// 주소 변경만 Next.js 대신 맡고 가입·게이트·필수 단계·API 훅은 실제 consumer를 쓴다.
function LinkedJourney() {
  const [route, setRoute] = useState('/signup/social');
  useEffect(() => {
    const navigate = (path: string) => {
      window.history.replaceState({}, '', path);
      navigation.pathname = window.location.pathname;
      setRoute(path);
    };
    navigation.push.mockImplementation(navigate);
    navigation.replace.mockImplementation(navigate);
  }, []);
  const pathname = new URL(route, window.location.origin).pathname;
  const step = pathname.split('/')[2] as 'sport' | 'level' | 'region' | 'confirm';
  return <PendingSocialSignupGate>{pathname === '/signup/social' ? <SocialSignupClient />
    : pathname.startsWith('/onboarding/') ? <OnboardingClient key={pathname} step={step} />
      : pathname === '/terms' ? <TermsClient /> : <h1>{pathname}</h1>}</PendingSocialSignupGate>;
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/signup/social');
  navigation.pathname = '/signup/social';
  navigation.push.mockReset();
  navigation.replace.mockReset();
  auth = makeAuth('social_profile_required');
  onboarding = { status: 'in_progress', currentStep: 'sport', canResume: true, missing: ['sports', 'levels'], sports: [], regions: [], regionOptional: true };
  requiredRoute = '/onboarding/sport';
  acceptedTerms = false;
  linkRequests = completeRequests = acceptRequests = 0;
  savedSteps = [];
  saveStoredV1Session({ userId: 'pending-1', userEmail: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); server.resetHandlers(); });

async function linkAccount() {
  render(<QueryClientProvider client={client}><LinkedJourney /></QueryClientProvider>);
  const user = userEvent.setup();
  fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '인증하고 기존 계정에 연결' }));
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '확인' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '연결하고 로그인' }));
  await waitFor(() => expect(navigation.pathname).toBe(requiredRoute.split('?')[0]));
  expect(linkRequests).toBe(1);
  return user;
}
async function finishOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /풋살/ }));
  await user.click(screen.getByRole('button', { name: '실력 입력하기' }));
  await user.click(await screen.findByRole('button', { name: '초급' }));
  await user.click(screen.getByRole('button', { name: '지역 선택하기' }));
  await user.click(await screen.findByRole('button', { name: '서울' }));
  await user.click(screen.getByRole('button', { name: '마포구' }));
  await user.click(screen.getByRole('button', { name: '지역 선택 완료' }));
  const finish = await screen.findByRole('button', { name: '홈으로 시작하기' });
  expect(savedSteps).toEqual(['sport', 'level', 'region']);
  await user.click(finish);
}
async function finishRenewal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /전체 동의/ }));
  await user.click(await screen.findByRole('button', { name: '동의하고 계속하기' }));
}
async function expectDestination(path: string) {
  await screen.findByRole('heading', { name: path });
  expect(getSavedRedirectPath()).toBeNull();
  expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBeNull();
}

describe('연결된 계정의 필수 단계 완료 후 실제 복귀 계약', () => {
  it.each([
    ['social_profile_required', '/onboarding/sport'], ['social_profile_deferred', '/onboarding/sport'],
    ['social_profile_required', '/terms?mode=renewal'], ['social_profile_deferred', '/terms?mode=renewal'],
  ] as const)('%s 연결 후 %s를 마쳐 원래 목적지를 한 번 소비한다', async (status, next) => {
    auth = makeAuth(status);
    requiredRoute = next;
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    expect(getSavedRedirectPath()).toBe('/teams/new');
    expect(navigation.replace).not.toHaveBeenCalledWith('/teams/new');
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/teams/new');
    expect(completeRequests + acceptRequests).toBe(1);
  });

  it.each(['/onboarding/sport', '/terms?mode=renewal'] as const)('%s까지 전달된 외부 redirect는 마지막에도 차단한다', async (next) => {
    requiredRoute = next;
    window.history.replaceState({}, '', '/signup/social?redirect=%2F%5Coutside.invalid');
    const user = await linkAccount();
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/home');
    expect(navigation.replace).not.toHaveBeenCalledWith('/\\outside.invalid');
  });

  it.each(['/onboarding/sport', '/terms?mode=renewal'] as const)('%s의 안전한 URL 목적지가 저장 목적지보다 우선하며 마지막에 정리된다', async (next) => {
    requiredRoute = next;
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    act(() => navigation.replace(`${next}${next.includes('?') ? '&' : '?'}redirect=%2Fchat`));
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/chat');
  });

  it('이미 동의한 renewal의 zero-doc 성공도 저장 목적지를 소비한다', async () => {
    requiredRoute = '/terms?mode=renewal';
    acceptedTerms = true;
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    await user.click(await screen.findByRole('button', { name: '동의하고 계속하기' }));
    await expectDestination('/teams/new');
    expect(acceptRequests).toBe(0);
  });

  it('온보딩 완료 후 다시 진입해도 이미 소비한 복귀 목적지를 재사용하지 않는다', async () => {
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    await finishOnboarding(user);
    await expectDestination('/teams/new');
    act(() => navigation.replace('/onboarding/confirm'));
    await user.click(await screen.findByRole('button', { name: '홈으로 시작하기' }));
    await expectDestination('/home');
    expect(completeRequests).toBe(2);
  });

  it('서버가 허용한 온보딩 나중에 설정하기 성공도 복귀 목적지를 소비한다', async () => {
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    await user.click(await screen.findByRole('button', { name: '나중에 설정하기' }));
    await expectDestination('/teams/new');
  });
});
