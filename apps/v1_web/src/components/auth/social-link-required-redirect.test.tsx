import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AuthMe, V1OnboardingDetail } from '@/types/api';
import { getSavedRedirectPath, saveRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { SocialSignupClient } from './social-signup-client';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { OnboardingClient } from './onboarding-client';
import { TermsClient } from './terms-client';
import {
  compliance, DISTRICT, DOCUMENT, HOLDER, isPreferencePayload, LEVEL, makeAuth, PENDING, REGION,
  requiredRoutes, signupJourneys, SPORT, stepForRoute, terms, type FixtureStatus, type RequiredRoute,
} from './social-link-required-redirect-fixtures';

const navigation = vi.hoisted(() => ({ pathname: '/signup/social', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
let auth: V1AuthMe;
let onboarding: V1OnboardingDetail;
let requiredRoute: RequiredRoute;
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
    auth = makeAuth(requiredRoute.startsWith('/onboarding') ? 'signup_done' : 'completed', HOLDER, true);
    if (requiredRoute.startsWith('/terms')) {
      auth.termsCompliance = compliance(false);
      onboarding = { ...onboarding, status: 'completed', currentStep: 'done', canResume: false, missing: [],
        sports: [{ sportId: SPORT, sportName: '풋살', levelId: LEVEL, levelName: '초급' }],
      };
    }
    const response = success({ ...auth, session: { userId: HOLDER, userEmail: null }, next: { route: requiredRoute } });
    // 다른 탭이 동의한 경우에도 연결 응답의 필수 경로는 거치고 최신 약관을 확인한다.
    if (acceptedTerms) auth = { ...auth, termsCompliance: compliance(true) };
    return response;
  }),
  http.get('*/api/v1/master/sports', () => success([{ id: SPORT, code: 'futsal', name: '풋살', levels: [{ id: LEVEL, name: '초급' }] }])),
  http.get('*/api/v1/master/regions', () => success([{ id: REGION, name: '서울', parentId: null, level: 1, children: [{ id: DISTRICT, name: '마포구', parentId: REGION, level: 2 }] }])),
  http.get('*/api/v1/onboarding', () => success(onboarding)),
  http.patch('*/api/v1/onboarding/preferences', async ({ request }) => {
    const body: unknown = await request.json();
    if (!isPreferencePayload(body)) return HttpResponse.json({ status: 'error', statusCode: 400, code: 'VALIDATION_FAILED', message: '온보딩 입력이 올바르지 않아요.' }, { status: 400 });
    savedSteps.push(body.currentStep);
    const sports = body.sports ?? [];
    const status: FixtureStatus = sports.length === 0 ? 'signup_done' : sports.some((sport) => !sport.levelId) ? 'sport_done'
      : body.currentStep === 'region' || body.currentStep === 'confirm' ? 'region_done' : 'level_done';
    onboarding = { ...onboarding, status, currentStep: body.currentStep,
      sports: body.sports?.map((sport) => ({ sportId: sport.sportId, sportName: '풋살', levelId: sport.levelId ?? null, levelName: sport.levelId ? '초급' : null })) ?? onboarding.sports,
      regions: body.regions?.map((region) => ({ ...region, name: '마포구' })) ?? onboarding.regions,
    };
    onboarding.missing = onboarding.sports.length === 0 ? ['sports'] : onboarding.sports.some((sport) => !sport.levelId) ? ['levels'] : [];
    auth = { ...auth, user: { ...auth.user, onboardingStatus: status } };
    return success({ status, currentStep: body.currentStep, missing: onboarding.missing, canContinue: onboarding.missing.length === 0,
      sports: sports.map((sport) => ({ sportId: sport.sportId, levelId: sport.levelId ?? null })), regions: body.regions ?? [],
    });
  }),
  http.post('*/api/v1/onboarding/complete', () => {
    completeRequests += 1;
    if (onboarding.missing.length > 0) return HttpResponse.json({ status: 'error', statusCode: 400, code: 'VALIDATION_FAILED', message: 'Onboarding completion requirements are not met', details: { missing: onboarding.missing } }, { status: 400 });
    auth = { ...auth, user: { ...auth.user, onboardingStatus: 'completed' } };
    onboarding = { ...onboarding, status: 'completed', currentStep: 'done', canResume: false, missing: [] };
    return success({ status: 'completed', missing: [], limited: false, next: { route: '/home', reason: 'onboarding_completed' } });
  }),
  http.post('*/api/v1/onboarding/defer', () => {
    auth = { ...auth, user: { ...auth.user, onboardingStatus: 'deferred' } };
    onboarding = { ...onboarding, status: 'deferred', currentStep: 'confirm' };
    return success({ status: 'deferred', missing: onboarding.missing, limited: true, next: { route: '/home', reason: 'onboarding_deferred' } });
  }),
  http.get('*/api/v1/terms/current', () => success(terms(acceptedTerms))),
  http.post('*/api/v1/terms/consents', async ({ request }) => {
    expect(await request.json()).toEqual({ documentIds: [DOCUMENT] });
    acceptRequests += 1;
    acceptedTerms = true;
    auth = { ...auth, termsCompliance: compliance(true) };
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
  const step = stepForRoute(pathname);
  return <PendingSocialSignupGate>{pathname === '/signup/social' ? <SocialSignupClient />
    : step ? <OnboardingClient key={pathname} step={step} />
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
  onboarding = { status: 'signup_done', currentStep: 'sport', canResume: true, missing: ['sports'], sports: [], regions: [], regionOptional: true };
  requiredRoute = '/onboarding/sport';
  acceptedTerms = false;
  linkRequests = completeRequests = acceptRequests = 0;
  savedSteps = [];
  saveStoredV1Session({ userId: PENDING, userEmail: null });
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
  it.each(signupJourneys)('%s 연결 후 %s를 마쳐 원래 목적지를 한 번 소비한다', async (status, next) => {
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

  it.each(requiredRoutes)('%s까지 전달된 외부 redirect는 마지막에도 차단한다', async (next) => {
    requiredRoute = next;
    window.history.replaceState({}, '', '/signup/social?redirect=%2F%5Coutside.invalid');
    const user = await linkAccount();
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/home');
    expect(navigation.replace).not.toHaveBeenCalledWith('/\\outside.invalid');
  });

  it.each(requiredRoutes)('%s의 안전한 URL 목적지가 저장 목적지보다 우선하며 마지막에 정리된다', async (next) => {
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
