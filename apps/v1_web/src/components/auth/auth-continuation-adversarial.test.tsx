import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedRedirectPath, saveRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { RECORD_CONSENT_POLICY_HASH } from '@/lib/record-consent';
import { RequireAuth } from './require-auth';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { SocialSignupClient } from './social-signup-client';
import { OnboardingClient } from './onboarding-client';
import { TermsClient } from './terms-client';
import { KakaoLoginButton } from './kakao-login-button';
import { KakaoCallbackClient } from './kakao-callback-client';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';
import { authSession, compliance, createRedirectFixture, makeAuth, PENDING, stepForRoute } from './social-link-required-redirect-fixtures';

const navigation = vi.hoisted(() => ({ pathname: '/', replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const sdk = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock('@/lib/navigation-history', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/navigation-history')>(), replaceDocument: navigation.replace,
}));
vi.mock('@/lib/kakao-js-sdk', () => ({ getInitializedKakaoJsSdk: async () => ({ Auth: { authorize: sdk.authorize } }) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize?client_id=fixture&redirect_uri=https%3A%2F%2Fteameet.test%2Fcallback%2Fkakao';
const { state, server, reset } = createRedirectFixture();
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
let client: QueryClient;
let profileRequests = 0;

// 외부 SDK·문서 이동·Next 주소 변경만 대신하며, 인증 게이트·consumer·API 훅은 실제다.
function Journey({ initialRoute }: { initialRoute: string }) {
  const [route, setRoute] = useState(initialRoute);
  const navigate = (path: string) => {
    window.history.replaceState({}, '', path);
    navigation.pathname = window.location.pathname;
    setRoute(path);
  };
  navigation.replace.mockImplementation(navigate);
  navigation.push.mockImplementation(navigate);
  const pathname = new URL(route, window.location.origin).pathname;
  const step = stepForRoute(pathname);
  return <PendingSocialSignupGate>{pathname === '/login' ? <KakaoLoginButton href={AUTHORIZE_URL} label="카카오로 로그인" />
    : pathname === '/callback/kakao' ? <KakaoCallbackClient />
      : pathname === '/signup/social' ? <SocialSignupClient />
        : pathname === '/terms' ? <TermsClient />
          : step ? <RequireAuth key={pathname}><OnboardingClient key={pathname} step={step} /></RequireAuth>
            : <h1>{route}</h1>}</PendingSocialSignupGate>;
}
function openJourney(path: string) {
  window.history.replaceState({}, '', path);
  navigation.pathname = window.location.pathname;
  render(<QueryClientProvider client={client}><Journey initialRoute={path} /></QueryClientProvider>);
  return userEvent.setup();
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  reset();
  profileRequests = 0;
  navigation.replace.mockReset();
  navigation.push.mockReset();
  sdk.authorize.mockReset();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY', 'fixture-js-key');
  vi.stubEnv('NEXT_PUBLIC_KAKAO_REDIRECT_URI', 'https://teameet.test/callback/kakao');
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); server.resetHandlers(); vi.unstubAllEnvs(); });

const newSignupPrefill = { name: '김러너', phone: '01087654321', gender: 'female', birthDate: '20000229' } as const;
async function completeSignup(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(await screen.findByLabelText('닉네임'), { target: { value: '카카오러너' } });
  await user.click(screen.getByRole('button', { name: '중복 확인' }));
  const submit = await screen.findByRole('button', { name: '운동 설정으로 계속' });
  await waitFor(() => expect(submit).toBeEnabled());
  await user.click(submit);
  await screen.findByRole('button', { name: /풋살/ });
  expect(state.profileRequests).toBe(1);
  expect(state.phoneOnlyRequests).toBe(0);
}
async function finishOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /풋살/ }));
  await user.click(screen.getByRole('button', { name: '실력 입력하기' }));
  await user.click(await screen.findByRole('button', { name: '초급' }));
  await user.click(screen.getByRole('button', { name: '지역 선택하기' }));
  await user.click(await screen.findByRole('button', { name: '서울' }));
  await user.click(screen.getByRole('button', { name: '마포구' }));
  await user.click(screen.getByRole('button', { name: '지역 선택 완료' }));
  await user.click(await screen.findByRole('button', { name: '홈으로 시작하기' }));
  expect(state.savedSteps).toEqual(['sport', 'level', 'region']);
  expect(state.completeRequests).toBe(1);
}
async function expectDestination(path: string) {
  await screen.findByRole('heading', { name: path });
  expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(path);
  expect(getSavedRedirectPath()).toBeNull();
  expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBeNull();
}

describe('적대적 인증 continuation의 실제 consumer 계약', () => {
  it('RequireAuth→OAuth에 저장한 nested 원 목적지는 가입 완료와 온보딩 네 단계를 마친 뒤 복귀한다', async () => {
    state.auth.socialSignupPrefill = newSignupPrefill;
    let oauthRequests = 0;
    server.use(http.post('*/api/v1/auth/kakao', async ({ request }) => {
      expect(await request.json()).toEqual({ code: 'fixture-code', redirectUri: 'https://teameet.test/callback/kakao' });
      oauthRequests += 1;
      return success(authSession(state.auth, '/signup/social'));
    }));
    const nested = '/onboarding/confirm?redirect=%2Fteams%2Fnew';
    const user = openJourney(nested);
    await screen.findByRole('link', { name: '카카오로 로그인' });
    expect(new URLSearchParams(window.location.search).get('redirect')).toBe(nested);
    expect(getSavedRedirectPath()).toBeNull();
    await user.click(screen.getByRole('link', { name: '카카오로 로그인' }));
    await waitFor(() => expect(sdk.authorize).toHaveBeenCalledTimes(1));
    expect(getSavedRedirectPath()).toBe(nested);
    const oauthState = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
    if (!oauthState) throw new Error('OAuth state가 실제 버튼에서 저장되지 않았어요.');
    act(() => navigation.replace(`/callback/kakao?code=fixture-code&state=${encodeURIComponent(oauthState)}`));
    await screen.findByRole('button', { name: '나중에 입력할게요' });
    expect(oauthRequests).toBe(1);
    expect(window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY)).toBeNull();
    await completeSignup(user);
    await finishOnboarding(user);
    await expectDestination('/teams/new');
  });

  it('URL-only nested의 안전한 최종 query/hash 목적지는 저장값보다 우선해 네 온보딩 단계 후 복귀한다', async () => {
    state.auth.socialSignupPrefill = newSignupPrefill;
    saveStoredV1Session({ userId: PENDING });
    saveRedirectPath('/teams/new');
    const nested = `/onboarding/confirm?redirect=${encodeURIComponent('/chat?room=team#latest')}`;
    const user = openJourney(`/signup/social?redirect=${encodeURIComponent(nested)}`);
    await completeSignup(user);
    await finishOnboarding(user);
    await expectDestination('/chat?room=team#latest');
  });

  it.each(['defer', 'activity'])('%s 성공 응답의 필수 renewal next를 먼저 따르고 query/hash 목적지는 동의 후 소비한다', async (mode) => {
    const destination = '/chat?room=team#latest';
    state.auth = makeAuth(mode === 'defer' ? 'social_profile_required' : 'social_profile_deferred', PENDING, true);
    state.auth.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    saveStoredV1Session({ userId: PENDING });
    saveRedirectPath(destination);
    const endpoint = mode === 'defer' ? '/auth/social-profile/defer' : '/auth/social-profile';
    server.use(http.post(`*/api/v1${endpoint}`, async ({ request }) => {
      if (mode === 'activity') expect(await request.json()).toEqual({ nickname: '카카오러너', displayName: '김러너', phone: '01012345678',
        birthDate: '20000229', gender: 'female', recordConsent: { granted: true, policyHash: RECORD_CONSENT_POLICY_HASH } });
      profileRequests += 1;
      state.auth = { ...state.auth, user: { ...state.auth.user, onboardingStatus: mode === 'defer' ? 'social_profile_deferred' : 'deferred' },
        termsCompliance: compliance(false) };
      return success(authSession(state.auth, '/terms?mode=renewal'));
    }));
    const user = openJourney('/signup/social');
    const submit = await screen.findByRole('button', { name: mode === 'defer' ? '나중에 입력할게요' : '입력 완료하고 계속하기' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await screen.findByRole('button', { name: /전체 동의/ });
    expect(profileRequests).toBe(1);
    expect(navigation.replace).toHaveBeenCalledWith('/terms?mode=renewal');
    expect(navigation.replace).not.toHaveBeenCalledWith(destination);
    expect(getSavedRedirectPath()).toBe(destination);
    await user.click(screen.getByRole('button', { name: /전체 동의/ }));
    await user.click(screen.getByRole('button', { name: '동의하고 계속하기' }));
    await expectDestination(destination);
    expect(state.acceptRequests).toBe(1);
  });
});
