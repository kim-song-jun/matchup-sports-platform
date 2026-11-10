import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const RECOVERY_EMAIL = 'owner@example.test';
export const RECOVERY_PHONE = '01012345678';
export const RETURN_PATH = '/chat?room=team#latest';

type WireCalls = {
  logout: number;
  emailIssue: unknown[]; emailVerify: unknown[]; emailReset: unknown[];
  phoneVerify: unknown[]; findAccount: unknown[]; emailFind: unknown[];
};
export const wireCalls: WireCalls = {
  logout: 0,
  emailIssue: [],
  emailVerify: [],
  emailReset: [],
  phoneVerify: [],
  findAccount: [],
  emailFind: [],
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
    return success({ verified: true, proofToken: 'phone-proof', proofExpiresInSeconds: 600, registered: false, withdrawalPendingUntil: null });
  }),
  http.post('*/api/v1/auth/recovery/find-account', async ({ request }) => {
    wireCalls.findAccount.push(await request.json());
    return success({ maskedEmail: null, emailProofAvailable: true, providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null });
  }),
  http.post('*/api/v1/auth/recovery/email/request', async ({ request }) => {
    wireCalls.emailIssue.push(await request.json());
    return issued();
  }),
  http.post('*/api/v1/auth/recovery/email/confirm', async ({ request }) => {
    wireCalls.emailVerify.push(await request.json());
    return success({ verified: true, proofToken: 'email-proof' });
  }),
  // 비밀번호 재설정은 메일함 증명 뒤에 계정이 탈퇴 대기인지 먼저 확인한다. 기본은 활성 계정이다.
  http.post('*/api/v1/auth/recovery/email/find-account', async ({ request }) => {
    wireCalls.emailFind.push(await request.json());
    return success({ maskedEmail: 'ow***@example.test', emailProofAvailable: true, providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null });
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
  wireCalls.emailIssue = [];
  wireCalls.emailVerify = [];
  wireCalls.emailReset = [];
  wireCalls.phoneVerify = [];
  wireCalls.findAccount = [];
  wireCalls.emailFind = [];
}

export function renderAuthUi(content: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
