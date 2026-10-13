import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AuthMe } from '@/types/api';
import { getSavedRedirectPath, saveRedirectPath } from '@/lib/session-storage';
import { SocialSignupClient } from './social-signup-client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const providers = ['kakao', 'apple'] as const;
let provider: 'kakao' | 'apple' = 'kakao';
let signupStatus: 'social_profile_required' | 'social_profile_deferred' = 'social_profile_required';
let logoutStatus = 200;
let phoneStatus = 409;
// Request counters prove the real consumer never sends account-link requests after a phone conflict.
const calls = { logout: 0, phoneOnly: 0 };
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const failure = (code: string, message: string, status: number) =>
  HttpResponse.json({ status: 'error', statusCode: status, code, message }, { status });
const auth = (): V1AuthMe => ({
  user: { id: '99999999-9999-4999-8999-999999999999', email: null, phone: null,
    accountStatus: 'active', onboardingStatus: signupStatus, authProvider: provider },
  profile: { displayName: null, nickname: '가입중회원' },
  verification: { emailVerified: false, phoneVerified: false }, socialSignupPrefill: null,
});
const server = setupServer(
  http.get('*/api/v1/auth/me', () => success(auth())),
  http.post('*/api/v1/logs/client-error', () => success({})),
  http.post('*/api/v1/verification/phone/request', () => phoneStatus === 409
    ? failure('PHONE_CONFLICT', '이미 사용 중인 번호예요.', 409)
    : failure('VERIFICATION_RESEND_COOLDOWN', '조금 뒤에 다시 요청해 주세요.', 429)),
  http.post('*/api/v1/auth/logout', () => {
    calls.logout += 1;
    return logoutStatus === 200 ? success({ ok: true }) : failure('INTERNAL_ERROR', '로그아웃 실패', logoutStatus);
  }),
  ...['phone/issue', 'phone/verify', 'social-link/preview', 'social-link'].map((path) =>
    http.post(`*/api/v1/auth/${path}`, () => {
      calls.phoneOnly += 1;
      return failure('SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF', '기존 계정으로 로그인해 주세요.', 409);
    })),
);
const hardReplace = vi.fn();
const originalLocation = window.location;
let client: QueryClient;
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => { server.close(); Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }); });
beforeEach(() => {
  provider = 'kakao'; signupStatus = 'social_profile_required'; logoutStatus = 200; phoneStatus = 409;
  calls.logout = 0; calls.phoneOnly = 0; hardReplace.mockReset();
  window.localStorage.clear(); window.sessionStorage.clear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, search: '', replace: hardReplace } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); server.resetHandlers(); });
async function requestConflict() {
  render(<QueryClientProvider client={client}><SocialSignupClient /></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  await userEvent.setup().click(await screen.findByRole('button', { name: '인증번호 받기' }));
}
describe('소셜 가입의 현재 번호 소유와 기존 계정 소유를 구분하는 실제 계약', () => {
  it.each(providers.flatMap((nextProvider) => (['social_profile_required', 'social_profile_deferred'] as const).map((status) => [nextProvider, status] as const)))('%s %s 번호 충돌은 기존 로그인과 복구를 안내하고 번호만으로 연결하지 않는다', async (nextProvider, status) => {
    provider = nextProvider; signupStatus = status;
    await requestConflict();
    expect(await screen.findByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '계정 찾기' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '인증하고 기존 계정에 연결' })).not.toBeInTheDocument();
    expect(screen.queryByText(/번호를 인증하면/)).not.toBeInTheDocument();
    expect(calls.phoneOnly).toBe(0);
  });
  it.each(providers)('%s 기존 로그인 출구는 실제 로그아웃 성공 후 로그인으로 이동한다', async (nextProvider) => {
    provider = nextProvider;
    await requestConflict();
    await userEvent.setup().click(await screen.findByRole('button', { name: '기존 계정으로 로그인' }));
    await waitFor(() => expect(hardReplace).toHaveBeenCalledWith('/login'));
    expect(calls.logout).toBe(1); expect(calls.phoneOnly).toBe(0);
  });
  it.each(providers)('%s 복구 출구는 실제 로그아웃 성공 후 계정 찾기로 이동한다', async (nextProvider) => {
    provider = nextProvider;
    await requestConflict();
    await userEvent.setup().click(await screen.findByRole('button', { name: '계정 찾기' }));
    await waitFor(() => expect(hardReplace).toHaveBeenCalledWith('/auth/find-account'));
    expect(calls.logout).toBe(1); expect(calls.phoneOnly).toBe(0);
  });
  it.each(providers.flatMap((nextProvider) => (['/login', '/auth/find-account'] as const).map((path) => [nextProvider, path] as const)))('%s deferred 충돌의 %s 출구는 nested URL을 보존한다', async (nextProvider, path) => {
    provider = nextProvider; signupStatus = 'social_profile_deferred';
    const nested = '/onboarding/confirm?redirect=%2Fchat%3Froom%3Dteam%23latest';
    window.location.search = '?redirect=' + encodeURIComponent(nested);
    saveRedirectPath('/teams/new');
    await requestConflict();
    await userEvent.setup().click(await screen.findByRole('button', { name: path === '/login' ? '기존 계정으로 로그인' : '계정 찾기' }));
    await waitFor(() => expect(hardReplace).toHaveBeenCalledWith(path + '?redirect=' + encodeURIComponent(nested)));
    expect(getSavedRedirectPath()).toBe('/teams/new');
    expect(calls.logout).toBe(1); expect(calls.phoneOnly).toBe(0);
  });
  it.each(['/login', '/auth/find-account'])('required 충돌의 %s 출구는 안전한 저장 목적지를 전달한다', async (path) => {
    const destination = '/chat?room=team#latest';
    saveRedirectPath(destination);
    await requestConflict();
    await userEvent.setup().click(await screen.findByRole('button', { name: path === '/login' ? '기존 계정으로 로그인' : '계정 찾기' }));
    await waitFor(() => expect(hardReplace).toHaveBeenCalledWith(path + '?redirect=' + encodeURIComponent(destination)));
    expect(getSavedRedirectPath()).toBe(destination);
    expect(calls.logout).toBe(1); expect(calls.phoneOnly).toBe(0);
  });
  it('로그아웃 실패는 복구로 이동하거나 번호만으로 연결하지 않고 실제 오류를 보여준다', async () => {
    logoutStatus = 503;
    await requestConflict();
    await userEvent.setup().click(await screen.findByRole('button', { name: '계정 찾기' }));
    expect(await screen.findByText('가입 취소를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(hardReplace).not.toHaveBeenCalled(); expect(calls.logout).toBe(1); expect(calls.phoneOnly).toBe(0);
  });
  it('충돌과 다른 429 실패는 원인을 유지하고 로그인 충돌 안내로 바꾸지 않는다', async () => {
    phoneStatus = 429;
    await requestConflict();
    expect(await screen.findByText('조금 뒤에 다시 요청해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 계정으로 로그인' })).not.toBeInTheDocument();
    expect(calls.logout).toBe(0); expect(calls.phoneOnly).toBe(0);
  });
});
