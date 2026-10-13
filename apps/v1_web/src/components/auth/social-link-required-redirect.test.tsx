import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedRedirectPath, saveRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { SocialSignupClient } from './social-signup-client';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { OnboardingClient } from './onboarding-client';
import { TermsClient } from './terms-client';
import { createRedirectFixture, makeAuth, PENDING, requiredRoutes, signupJourneys, signupStatuses, stepForRoute } from './social-link-required-redirect-fixtures';

const navigation = vi.hoisted(() => ({ pathname: '/signup/social', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const { state, server, reset } = createRedirectFixture();
let client: QueryClient;

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
  reset();
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
  await waitFor(() => expect(navigation.pathname).toBe(state.renewalRequired ? '/terms' : state.requiredRoute.split('?')[0]));
  expect(state.linkRequests).toBe(1);
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
  expect(state.savedSteps).toEqual(['sport', 'level', 'region']);
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
async function linkWithRenewal(expectedTarget = '/teams/new') {
  state.renewalRequired = true;
  saveRedirectPath('/teams/new');
  const user = await linkAccount();
  await screen.findByRole('button', { name: /전체 동의/ });
  expect(new URLSearchParams(window.location.search).get('redirect')).toBe('/onboarding/sport');
  expect(getSavedRedirectPath()).toBe(expectedTarget);
  expect(state.savedSteps).toEqual([]);
  return user;
}

describe('연결된 계정의 필수 단계 완료 후 실제 복귀 계약', () => {
  it.each(signupJourneys)('%s 연결 후 %s를 마쳐 원래 목적지를 한 번 소비한다', async (status, next) => {
    state.auth = makeAuth(status);
    state.requiredRoute = next;
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    expect(getSavedRedirectPath()).toBe('/teams/new');
    expect(navigation.replace).not.toHaveBeenCalledWith('/teams/new');
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/teams/new');
    expect(state.completeRequests + state.acceptRequests).toBe(1);
  });

  it.each(requiredRoutes)('%s까지 전달된 외부 redirect는 마지막에도 차단한다', async (next) => {
    state.requiredRoute = next;
    window.history.replaceState({}, '', '/signup/social?redirect=%2F%5Coutside.invalid');
    const user = await linkAccount();
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/home');
    expect(navigation.replace).not.toHaveBeenCalledWith('/\\outside.invalid');
  });

  it.each(requiredRoutes)('%s의 안전한 URL 목적지가 저장 목적지보다 우선하며 마지막에 정리된다', async (next) => {
    state.requiredRoute = next;
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    act(() => navigation.replace(`${next}${next.includes('?') ? '&' : '?'}redirect=%2Fchat`));
    if (next.startsWith('/onboarding')) await finishOnboarding(user);
    else await finishRenewal(user);
    await expectDestination('/chat');
  });

  it('이미 동의한 renewal의 zero-doc 성공도 저장 목적지를 소비한다', async () => {
    state.requiredRoute = '/terms?mode=renewal';
    state.acceptedTerms = true;
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    await user.click(await screen.findByRole('button', { name: '동의하고 계속하기' }));
    await expectDestination('/teams/new');
    expect(state.acceptRequests).toBe(0);
  });

  it('온보딩 완료 후 다시 진입해도 이미 소비한 복귀 목적지를 재사용하지 않는다', async () => {
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    await finishOnboarding(user);
    await expectDestination('/teams/new');
    act(() => navigation.replace('/onboarding/confirm'));
    await user.click(await screen.findByRole('button', { name: '홈으로 시작하기' }));
    await expectDestination('/home');
    expect(state.completeRequests).toBe(2);
  });

  it('서버가 허용한 온보딩 나중에 설정하기 성공도 복귀 목적지를 소비한다', async () => {
    saveRedirectPath('/teams/new');
    const user = await linkAccount();
    await user.click(await screen.findByRole('button', { name: '나중에 설정하기' }));
    await expectDestination('/teams/new');
  });

  it.each(signupStatuses)('%s 연결의 연속 필수 약관·온보딩을 마칠 때까지 원 목적지를 보존한다', async (status) => {
    state.auth = makeAuth(status);
    const user = await linkWithRenewal();
    await finishRenewal(user);
    await screen.findByRole('button', { name: /풋살/ });
    expect(getSavedRedirectPath()).toBe('/teams/new');
    await finishOnboarding(user);
    await expectDestination('/teams/new');
    expect(state.acceptRequests).toBe(1);
    expect(state.completeRequests).toBe(1);
  });

  it('연속 필수 단계에서도 안전한 최초 URL 목적지를 저장값보다 우선하고 마지막에 소비한다', async () => {
    window.history.replaceState({}, '', '/signup/social?redirect=%2Fchat');
    const user = await linkWithRenewal('/chat');
    await finishRenewal(user);
    await screen.findByRole('button', { name: /풋살/ });
    expect(getSavedRedirectPath()).toBe('/chat');
    await finishOnboarding(user);
    await expectDestination('/chat');
  });

  it('연속 필수 단계의 외부 URL을 차단하고 안전한 저장 목적지를 마지막까지 보존한다', async () => {
    window.history.replaceState({}, '', '/signup/social?redirect=%2F%5Coutside.invalid');
    const user = await linkWithRenewal();
    await finishRenewal(user);
    await screen.findByRole('button', { name: /풋살/ });
    expect(getSavedRedirectPath()).toBe('/teams/new');
    await finishOnboarding(user);
    await expectDestination('/teams/new');
    expect(navigation.replace).not.toHaveBeenCalledWith('/\\outside.invalid');
  });

  it('연속 필수 단계의 부분 동의 응답은 새 문서를 보여주며 원 목적지를 소비하거나 덮어쓰지 않는다', async () => {
    state.consentResult = 'partial';
    const user = await linkWithRenewal();
    await finishRenewal(user);
    await screen.findByRole('button', { name: '추가 필수 약관 체크' });
    expect(navigation.pathname).toBe('/terms');
    expect(state.acceptRequests).toBe(1);
    expect(state.completeRequests).toBe(0);
    expect(getSavedRedirectPath()).toBe('/teams/new');
    expect(screen.queryByRole('button', { name: /풋살/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '추가 필수 약관 체크' }));
    await user.click(screen.getByRole('button', { name: '동의하고 계속하기' }));
    await screen.findByRole('button', { name: /풋살/ });
    expect(getSavedRedirectPath()).toBe('/teams/new');
    await finishOnboarding(user);
    await expectDestination('/teams/new');
    expect(state.acceptRequests).toBe(2);
  });

  it('연속 필수 단계의 실제 503 실패는 목적지를 남기고 재시도·온보딩 성공 뒤에만 정리한다', async () => {
    state.consentResult = 'failure';
    const user = await linkWithRenewal();
    await finishRenewal(user);
    await screen.findByText('약관 저장 응답이 지연됐어요.');
    expect(navigation.pathname).toBe('/terms');
    expect(getSavedRedirectPath()).toBe('/teams/new');
    expect(state.completeRequests).toBe(0);
    state.consentResult = 'accepted';
    await user.click(screen.getByRole('button', { name: '동의하고 계속하기' }));
    await screen.findByRole('button', { name: /풋살/ });
    expect(getSavedRedirectPath()).toBe('/teams/new');
    await finishOnboarding(user);
    await expectDestination('/teams/new');
    expect(state.acceptRequests).toBe(2);
  });
});
