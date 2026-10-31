import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const RECOVERY_EMAIL = 'owner@example.test';
export const RECOVERY_PHONE = '01012345678';
export const RETURN_PATH = '/chat?room=team#latest';

type WireCalls = {
  logout: number; phoneReset: number;
  emailIssue: unknown[]; emailVerify: unknown[]; emailReset: unknown[];
  phoneVerify: unknown[]; findAccount: unknown[];
};
export const wireCalls: WireCalls = {
  logout: 0,
  phoneReset: 0,
  emailIssue: [],
  emailVerify: [],
  emailReset: [],
  phoneVerify: [],
  findAccount: [],
};
export const scenario = { provider: 'kakao', logoutFails: false };
export const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
export const failure = (code: string, message: string, statusCode = 409) =>
  HttpResponse.json({ status: 'error', statusCode, code, message }, { status: statusCode });
const issued = () => success({ sent: true, expiresAt: new Date(Date.now() + 300_000).toISOString(), devCode: '123456' });

export const authUiServer = setupServer(
  http.get('*/api/v1/auth/me', () => success({
    user: { id: 'pending-person', email: RECOVERY_EMAIL, phone: RECOVERY_PHONE, onboardingStatus: 'social_profile_required', authProvider: scenario.provider },
    profile: { nickname: '합성 신규 사용자' }, socialSignupPrefill: null,
  })),
  http.post('*/api/v1/logs/client-error', () => success({})),
  http.post('*/api/v1/verification/phone/request', () => failure('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.')),
  http.post('*/api/v1/auth/logout', () => {
    wireCalls.logout += 1;
    return scenario.logoutFails ? failure('INTERNAL_ERROR', '합성 로그아웃 오류', 503) : success({ ok: true });
  }),
  http.post('*/api/v1/auth/phone/issue', issued),
  http.post('*/api/v1/auth/phone/verify', async ({ request }) => {
    wireCalls.phoneVerify.push(await request.json());
    return success({ verified: true, proofToken: 'phone-proof' });
  }),
  http.post('*/api/v1/auth/recovery/find-account', async ({ request }) => {
    wireCalls.findAccount.push(await request.json());
    return success({ maskedEmail: 'ow***@example.test', providers: ['email'], hasPassword: true, withdrawalPendingUntil: null });
  }),
  http.post('*/api/v1/auth/recovery/reset-password', () => {
    wireCalls.phoneReset += 1;
    return failure('ACCOUNT_RECOVERY_REQUIRES_EMAIL', '가입한 이메일로 인증해 비밀번호를 다시 설정해 주세요.');
  }),
  http.post('*/api/v1/auth/recovery/email/request', async ({ request }) => {
    wireCalls.emailIssue.push(await request.json());
    return issued();
  }),
  http.post('*/api/v1/auth/recovery/email/confirm', async ({ request }) => {
    wireCalls.emailVerify.push(await request.json());
    return success({ verified: true, proofToken: 'email-proof' });
  }),
  http.post('*/api/v1/auth/recovery/email/reset-password', async ({ request }) => {
    wireCalls.emailReset.push(await request.json());
    return success({ ok: true });
  }),
);

export function resetWireScenario() {
  scenario.provider = 'kakao';
  scenario.logoutFails = false;
  wireCalls.logout = 0;
  wireCalls.phoneReset = 0;
  wireCalls.emailIssue = [];
  wireCalls.emailVerify = [];
  wireCalls.emailReset = [];
  wireCalls.phoneVerify = [];
  wireCalls.findAccount = [];
}

export function renderAuthUi(content: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
