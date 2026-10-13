import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AuthMe } from '@/types/api';
import { v1Keys } from '@/lib/query-keys';
import { saveStoredV1Session } from '@/lib/session-storage';
import { PendingSocialSignupGate } from './pending-social-signup-gate';
import { SocialSignupClient } from './social-signup-client';

const navigation = vi.hoisted(() => ({ pathname: '/signup/social', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const requiredAuth: V1AuthMe = {
  user: { id: 'pending-1', email: null, onboardingStatus: 'social_profile_required', authProvider: 'kakao' },
  profile: { displayName: '김러너', nickname: null },
  verification: { emailVerified: false, phoneVerified: false },
  socialSignupPrefill: { name: '김러너', phone: '01012345678', gender: 'female', birthDate: null },
  termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
};
let serverAuth = requiredAuth;
let authReads = 0;
let mutationRequests = 0;
let client: QueryClient;
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const server = setupServer(
  http.get('*/api/v1/auth/me', () => {
    authReads += 1;
    return success(serverAuth);
  }),
  http.post('*/api/v1/logs/client-error', () => success({})),
  http.get('*/api/v1/auth/check-nickname', () => success({ available: true })),
);

// Next.js가 맡는 주소 변경만 모사한다. 인증 훅과 가입 게이트는 실제 consumer를 쓴다.
function RoutedSignup() {
  const [route, setRoute] = useState('/signup/social');
  useEffect(() => {
    navigation.replace.mockImplementation((path: string) => {
      navigation.pathname = new URL(path, window.location.origin).pathname;
      window.history.replaceState({}, '', path);
      setRoute(path);
    });
  }, []);
  return (
    <PendingSocialSignupGate>
      {route.startsWith('/terms') ? <h1>필수 약관</h1> : <SocialSignupClient />}
    </PendingSocialSignupGate>
  );
}

function requireCurrentTerms() {
  mutationRequests += 1;
  serverAuth = {
    ...requiredAuth,
    user: { ...requiredAuth.user, onboardingStatus: 'social_terms_required' },
    termsCompliance: { compliant: false, pendingRequiredDocumentIds: ['terms-new'], nextRoute: '/terms?mode=social' },
  };
  return HttpResponse.json({ status: 'error', statusCode: 400, code: 'TERMS_REQUIRED', message: '필수 약관 동의가 필요해요.' }, { status: 400 });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  serverAuth = requiredAuth;
  authReads = 0;
  mutationRequests = 0;
  navigation.pathname = '/signup/social';
  navigation.replace.mockReset();
  window.history.replaceState({}, '', '/signup/social');
  window.localStorage.clear();
  window.sessionStorage.clear();
  saveStoredV1Session({ userId: 'pending-1', userEmail: null });
  // 인증 훅의 retry: undefined는 기본 3회 재시도를 사용한다. 횟수는 유지하고 대기만 줄인다.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime: 60_000 }, mutations: { retry: false } } });
  client.setQueryData(v1Keys.authMe(), requiredAuth);
});
afterEach(() => {
  cleanup();
  client.clear();
  server.resetHandlers();
});

async function openSignup() {
  render(<QueryClientProvider client={client}><RoutedSignup /></QueryClientProvider>);
  await screen.findByRole('button', { name: '나중에 입력할게요' });
  expect(client.getQueryState(v1Keys.authMe())?.isInvalidated).toBe(false);
  expect(authReads).toBe(0);
}

async function prepareProfile() {
  fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '카카오러너' } });
  fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
  await screen.findByText('사용 가능한 닉네임이에요.');
  fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '1995-01-15' } });
  const submit = await screen.findByRole('button', { name: '운동 설정으로 계속' });
  expect(submit).toBeEnabled();
  return submit;
}

describe('필수 약관이 변경된 소셜 가입의 실제 인증 캐시 복구', () => {
  it('나중에 입력 요청이 TERMS_REQUIRED이면 인증을 재조회하고 약관 화면에 머문다', async () => {
    // Given: 60초 동안 fresh인 required 캐시가 있고 요청 중 서버의 필수 약관이 변경된다.
    server.use(http.post('*/api/v1/auth/social-profile/defer', requireCurrentTerms));
    await openSignup();

    // When
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));

    // Then: 실제 게이트가 오래된 가입 상태로 되돌리지 않는다.
    await screen.findByRole('heading', { name: '필수 약관' });
    await waitFor(() => expect(client.getQueryData<V1AuthMe>(v1Keys.authMe())?.user.onboardingStatus).toBe('social_terms_required'));
    expect(authReads).toBe(1);
    expect(mutationRequests).toBe(1);
    expect(navigation.pathname).toBe('/terms');
    expect(screen.queryByRole('button', { name: '나중에 입력할게요' })).not.toBeInTheDocument();
  });

  it('프로필 완료 요청이 TERMS_REQUIRED이면 인증을 재조회하고 약관 화면에 머문다', async () => {
    // Given: 실제 폼과 닉네임 확인을 완료한 fresh required 캐시다.
    server.use(http.post('*/api/v1/auth/social-profile', requireCurrentTerms));
    await openSignup();
    const submit = await prepareProfile();

    // When
    fireEvent.click(submit);

    // Then
    await screen.findByRole('heading', { name: '필수 약관' });
    await waitFor(() => expect(client.getQueryData<V1AuthMe>(v1Keys.authMe())?.user.onboardingStatus).toBe('social_terms_required'));
    expect(authReads).toBe(1);
    expect(mutationRequests).toBe(1);
    expect(navigation.pathname).toBe('/terms');
  });

  it.each(['defer', 'complete'] as const)('%s의 약관 오류 이후 인증 재조회가 실패하면 실제 오류를 표시하고 이동하지 않는다', async (action) => {
    // Given: 약관은 변경됐지만 최신 인증 상태 조회는 실제 503으로 실패한다.
    server.use(
      http.post(action === 'defer' ? '*/api/v1/auth/social-profile/defer' : '*/api/v1/auth/social-profile', requireCurrentTerms),
      http.get('*/api/v1/auth/me', () => {
        authReads += 1;
        return HttpResponse.json({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: '인증 상태를 확인하지 못했어요.' }, { status: 503 });
      }),
    );
    await openSignup();
    const trigger = action === 'defer' ? screen.getByRole('button', { name: '나중에 입력할게요' }) : await prepareProfile();

    // When
    fireEvent.click(trigger);

    // Then: 초기 요청과 3회 재시도가 모두 실패한 최종 상태를 기다린다.
    await waitFor(() => expect(client.getQueryState(v1Keys.authMe())).toMatchObject({
      status: 'error', fetchStatus: 'idle', fetchFailureCount: 4,
    }));
    await screen.findByText('인증 상태를 확인하지 못했어요.');
    expect(authReads).toBe(4);
    expect(mutationRequests).toBe(1);
    expect(client.getQueryData<V1AuthMe>(v1Keys.authMe())?.user.onboardingStatus).toBe('social_profile_required');
    expect(navigation.pathname).toBe('/signup/social');
    expect(navigation.replace).not.toHaveBeenCalledWith('/terms?mode=social');
  });

  it.each([
    ['defer', 'success'], ['complete', 'success'],
    ['defer', '503'], ['complete', '503'],
  ] as const)('%s의 약관 복구 중 가입 액션을 잠그고 %s 응답 후 회복한다', async (action, result) => {
    // Given: 실제 가입 오류는 끝났지만 서버의 인증 응답은 아직 도착하지 않았다.
    let releaseAuth!: () => void;
    const authResponse = new Promise<void>((resolve) => { releaseAuth = resolve; });
    server.use(
      http.post('*/api/v1/auth/social-profile/defer', requireCurrentTerms),
      http.post('*/api/v1/auth/social-profile', requireCurrentTerms),
      http.get('*/api/v1/auth/me', async () => {
        authReads += 1;
        await authResponse;
        return result === 'success' ? success(serverAuth) : HttpResponse.json({
          status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: '인증 상태를 확인하지 못했어요.',
        }, { status: 503 });
      }),
    );
    await openSignup();
    const completeButton = await prepareProfile();
    const deferButton = screen.getByRole('button', { name: '나중에 입력할게요' });
    const trigger = action === 'defer' ? deferButton : completeButton;
    const signupForm = screen.getByLabelText(/^닉네임/).closest('form')!;

    try {
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(authReads).toBe(1);
        expect(client.isMutating()).toBe(0);
        expect(client.getQueryState(v1Keys.authMe())?.fetchStatus).toBe('fetching');
      });

      // Then: mutation의 종료와 별개로 복구 중 표시와 두 가입 액션의 잠금을 유지한다.
      expect(trigger).toHaveAttribute('aria-busy', 'true');
      expect(completeButton).toBeDisabled();
      expect(deferButton).toBeDisabled();
      fireEvent.click(trigger);
      fireEvent.click(deferButton);
      fireEvent.submit(signupForm);

      releaseAuth();
      if (result === 'success') {
        await screen.findByRole('heading', { name: '필수 약관' });
        expect(authReads).toBe(1);
        expect(navigation.pathname).toBe('/terms');
      } else {
        await screen.findByText('인증 상태를 확인하지 못했어요.');
        expect(authReads).toBe(4);
        expect(completeButton).toBeEnabled();
        expect(deferButton).toBeEnabled();
        expect(trigger).not.toHaveAttribute('aria-busy', 'true');
        expect(navigation.pathname).toBe('/signup/social');
      }
      expect(mutationRequests).toBe(1);
    } finally {
      // RED도 실제 보류 응답을 끝낸 뒤 정리하여 다음 사례에 요청을 남기지 않는다.
      releaseAuth();
      await waitFor(() => expect(client.getQueryState(v1Keys.authMe())?.fetchStatus).toBe('idle'));
    }
  });
});
