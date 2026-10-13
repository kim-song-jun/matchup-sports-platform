import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { expect } from 'vitest';
import { authUiServer, failure, RECOVERY_EMAIL, success, wireCalls } from './mdqa133-auth-ui.fixtures';

export const OTHER_EMAIL = 'other-owner@example.test';
export const NEW_EMAIL_PASSWORD = 'synthetic-email-new-password';
export const OLD_RESET_ERROR = '이전 이메일의 합성 비밀번호 저장 오류예요.';
export type ResetOutcome = 'success' | 'social-only' | 'failure';

function deferredResponse() {
  let accept: ((response: Response) => void) | undefined;
  const response = new Promise<Response>((resolve) => { accept = resolve; });
  return { response, resolve: (value: Response) => {
    if (!accept) throw new Error('합성 이메일 응답 대기가 초기화되지 않았어요.');
    accept(value);
  } };
}

export function installDeferredEmailFlow({ holdFirstConfirmation = false } = {}) {
  const issuedEmails = new Set<string>();
  const proofs = new Map<string, string>();
  const confirmations: Array<{ email: string; proofToken: string; gate: ReturnType<typeof deferredResponse> }> = [];
  const resets: Array<{ body: { email: string; proofToken: string; newPassword: string }; gate: ReturnType<typeof deferredResponse> }> = [];
  authUiServer.use(
    http.post<never, { email: string }>('*/api/v1/auth/recovery/email/request', async ({ request }) => {
      const body = await request.json();
      wireCalls.emailIssue.push(body);
      issuedEmails.add(body.email);
      return success({ sent: true, expiresAt: new Date(Date.now() + 300_000).toISOString(), devCode: '123456' });
    }),
    http.post<never, { email: string; code: string }>('*/api/v1/auth/recovery/email/confirm', async ({ request }) => {
      const body = await request.json();
      wireCalls.emailVerify.push(body);
      if (!issuedEmails.has(body.email) || body.code !== '123456') {
        return failure('VERIFICATION_CODE_MISMATCH', '합성 이메일 인증번호가 맞지 않아요.', 400);
      }
      const proofToken = `email-proof:${body.email}:${confirmations.length + 1}`;
      proofs.set(proofToken, body.email);
      const gate = deferredResponse();
      confirmations.push({ email: body.email, proofToken, gate });
      if (!holdFirstConfirmation || confirmations.length !== 1) gate.resolve(success({ verified: true, proofToken }));
      return gate.response;
    }),
    http.post<never, { email: string; proofToken: string; newPassword: string }>('*/api/v1/auth/recovery/email/reset-password', async ({ request }) => {
      const body = await request.json();
      wireCalls.emailReset.push(body);
      if (proofs.get(body.proofToken) !== body.email || body.newPassword.length < 8) {
        return failure('EMAIL_NOT_VERIFIED', '합성 이메일 증명이 현재 주소와 맞지 않아요.', 400);
      }
      const gate = deferredResponse();
      resets.push({ body, gate });
      return gate.response;
    }),
  );
  return {
    confirmations,
    resets,
    releaseConfirmation: (index: number) => {
      const entry = confirmations[index];
      entry.gate.resolve(success({ verified: true, proofToken: entry.proofToken }));
    },
    releaseReset: (index: number, outcome: ResetOutcome) => resets[index].gate.resolve(outcome === 'success'
      ? success({ ok: true }) : outcome === 'social-only'
        ? failure('PASSWORD_LOGIN_UNAVAILABLE', '비밀번호가 없는 계정이에요.')
        : failure('RECOVERY_UNAVAILABLE', OLD_RESET_ERROR, 503)),
    releaseAll: () => {
      confirmations.forEach(({ gate }) => gate.resolve(success({ verified: false })));
      resets.forEach(({ gate }) => gate.resolve(failure('RECOVERY_UNAVAILABLE', OLD_RESET_ERROR, 503)));
    },
  };
}

export async function startEmailVerification(email = RECOVERY_EMAIL) {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '확인' }));
}

export async function verifyCurrentEmail(email = RECOVERY_EMAIL) {
  await startEmailVerification(email);
  await screen.findByLabelText('새 비밀번호');
}

export async function submitCurrentEmailPassword(flow: ReturnType<typeof installDeferredEmailFlow>) {
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: NEW_EMAIL_PASSWORD } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: NEW_EMAIL_PASSWORD } });
  const count = flow.resets.length + 1;
  await userEvent.setup().click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  await waitFor(() => expect(flow.resets).toHaveLength(count));
  return count - 1;
}
