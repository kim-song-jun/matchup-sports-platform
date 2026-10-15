import type { ReactNode } from 'react';
import { expect } from 'vitest';
import { QueryClient, QueryClientProvider, useIsMutating } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import type { V1FoundAccount } from '@/types/api';
import { authUiServer, failure, RECOVERY_EMAIL, RECOVERY_PHONE, success, wireCalls } from './mdqa133-auth-ui.fixtures';

export const OTHER_PHONE = '01098765432';
export const OLD_PHONE_ERROR = '이전 번호의 합성 계정 조회 오류예요.';
export const SOCIAL_ACCOUNT = { maskedEmail: 'ka***@example.test', providers: ['kakao'], hasPassword: false } satisfies V1FoundAccount;
export const EMAIL_ACCOUNT = { maskedEmail: 'ow***@example.test', providers: ['email'], hasPassword: true } satisfies V1FoundAccount;

function deferredResponse() {
  let accept: ((response: Response) => void) | undefined;
  const response = new Promise<Response>((resolve) => { accept = resolve; });
  return {
    response,
    resolve: (value: Response) => {
      if (!accept) throw new Error('합성 응답 대기가 초기화되지 않았어요.');
      accept(value);
    },
  };
}

export function installDeferredPhoneFlow({ holdVerification = false, autoReleaseFind = false } = {}) {
  const issuedPhones: string[] = [];
  const finds: Array<{ body: unknown; gate: ReturnType<typeof deferredResponse> }> = [];
  const verifications: Array<ReturnType<typeof deferredResponse>> = [];
  authUiServer.use(
    http.post<never, { phone: string }>('*/api/v1/auth/phone/issue', async ({ request }) => {
      const body = await request.json();
      issuedPhones.push(body.phone);
      return success({ expiresAt: new Date(Date.now() + 300_000).toISOString(), devCode: '123456' });
    }),
    http.post<never, { phone: string; code: string; purpose: string }>('*/api/v1/auth/phone/verify', async ({ request }) => {
      const body = await request.json();
      wireCalls.phoneVerify.push(body);
      if (!issuedPhones.includes(body.phone) || body.code !== '123456' || body.purpose !== 'password_reset') {
        return failure('PHONE_NOT_VERIFIED', '합성 휴대폰 인증 계약이 맞지 않아요.', 400);
      }
      if (!holdVerification) return success({ verified: true, proofToken: `phone-proof:${body.phone}` });
      const gate = deferredResponse();
      verifications.push(gate);
      return gate.response;
    }),
    http.post<never, { phone: string; proofToken: string }>('*/api/v1/auth/recovery/find-account', async ({ request }) => {
      const body = await request.json();
      wireCalls.findAccount.push(body);
      if (body.proofToken !== `phone-proof:${body.phone}`) {
        return failure('PHONE_NOT_VERIFIED', '합성 휴대폰 증명이 맞지 않아요.', 400);
      }
      const gate = deferredResponse();
      finds.push({ body, gate });
      if (autoReleaseFind) gate.resolve(success(EMAIL_ACCOUNT));
      return gate.response;
    }),
  );
  return {
    finds,
    verifications,
    issuedPhones,
    releaseFind: (index: number, account: V1FoundAccount | null) => finds[index].gate.resolve(account
      ? success(account) : failure('ACCOUNT_NOT_FOUND', OLD_PHONE_ERROR, 404)),
    releaseVerification: (index = 0, phone = RECOVERY_PHONE) => verifications[index].resolve(success({ verified: true, proofToken: `phone-proof:${phone}` })),
    releaseAll: () => {
      finds.forEach(({ gate }) => gate.resolve(success(EMAIL_ACCOUNT)));
      verifications.forEach((gate) => gate.resolve(success({ verified: false })));
    },
  };
}

function MutationProgress() {
  return <output data-testid="pending-recovery-requests">{useIsMutating()}</output>;
}

export function renderRecovery(content: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const view = render(<>{content}<MutationProgress /></>, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { ...view, unmountRecovery: () => view.rerender(<MutationProgress />) };
}

export async function verifyPhone(phone = RECOVERY_PHONE) {
  fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: phone } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '확인' }));
}

export async function verifyIndependentEmail() {
  fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: RECOVERY_EMAIL } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '확인' }));
  await screen.findByLabelText('새 비밀번호');
}

export async function settleRequests(release: () => void) {
  await waitFor(() => expect(Number(screen.getByTestId('pending-recovery-requests').textContent)).toBeGreaterThan(0));
  await act(async () => { release(); });
  await waitFor(() => expect(screen.getByTestId('pending-recovery-requests')).toHaveTextContent(/^0$/));
}

export async function resetIndependentEmailPassword() {
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'synthetic-new-password' } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'synthetic-new-password' } });
  await userEvent.setup().click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument();
  expect(wireCalls.emailReset).toEqual([{ email: RECOVERY_EMAIL, proofToken: 'email-proof', newPassword: 'synthetic-new-password' }]);
  expect(wireCalls.phoneReset).toBe(0);
}
