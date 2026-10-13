import { StrictMode } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';
import { authUiServer, RECOVERY_EMAIL, resetWireScenario, wireCalls } from './mdqa133-auth-ui.fixtures';
import { renderRecovery, settleRequests } from './account-recovery-stale-phone.fixtures';
import {
  installDeferredEmailFlow, NEW_EMAIL_PASSWORD, OLD_RESET_ERROR, OTHER_EMAIL,
  startEmailVerification, submitCurrentEmailPassword, verifyCurrentEmail,
} from './account-recovery-stale-email.fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

let flow: ReturnType<typeof installDeferredEmailFlow>;
beforeAll(() => authUiServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => authUiServer.close());
beforeEach(() => {
  resetWireScenario();
  window.localStorage.clear();
  window.sessionStorage.clear();
  flow = installDeferredEmailFlow();
});
afterEach(() => { cleanup(); flow.releaseAll(); authUiServer.resetHandlers(); });

const renderEmailRecovery = () => renderRecovery(<StrictMode><AccountRecoveryClient initialMode="reset-password" /></StrictMode>);
const returnToEmailMode = () => {
  fireEvent.click(screen.getByRole('tab', { name: '아이디 찾기' }));
  fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
};
const expectUnverifiedEmail = () => {
  expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  expect(screen.queryByText('이메일 본인인증이 완료됐어요.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
  expect(wireCalls.emailReset).toHaveLength(0);
};

async function completeCurrentEmailReset(email = RECOVERY_EMAIL) {
  await verifyCurrentEmail(email);
  const index = await submitCurrentEmailPassword(flow);
  const confirmation = flow.confirmations.at(-1);
  expect(flow.resets[index].body).toEqual({ email: email.trim().toLowerCase(), proofToken: confirmation?.proofToken, newPassword: NEW_EMAIL_PASSWORD });
  await settleRequests(() => flow.releaseReset(index, 'success'));
  expect(screen.getByText('비밀번호를 바꿨어요')).toBeInTheDocument();
  expect(wireCalls.phoneReset).toBe(0);
}

describe('MD-QA #133 이메일 인증·저장의 이전 응답은 현재 복구 흐름과 분리된다', () => {
  it.each([OTHER_EMAIL, '  Owner@Example.TEST '])('이메일 A 확인 도중 %s로 바꾸면 이전 증명을 현재 주소의 인증으로 표시하지 않는다', async (currentEmail) => {
    flow = installDeferredEmailFlow({ holdFirstConfirmation: true });
    renderEmailRecovery();
    await startEmailVerification();
    await waitFor(() => expect(flow.confirmations).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: currentEmail } });
    await settleRequests(() => flow.releaseConfirmation(0));

    expectUnverifiedEmail();
    await completeCurrentEmailReset(currentEmail);
    expect(wireCalls.emailVerify).toEqual([{ email: RECOVERY_EMAIL, code: '123456' }, { email: currentEmail.trim().toLowerCase(), code: '123456' }]);
  });

  it('이메일 확인 도중 재설정→아이디→재설정으로 돌아와도 이전 증명이 새 흐름을 인증하지 않는다', async () => {
    flow = installDeferredEmailFlow({ holdFirstConfirmation: true });
    renderEmailRecovery();
    await startEmailVerification();
    await waitFor(() => expect(flow.confirmations).toHaveLength(1));
    returnToEmailMode();
    await settleRequests(() => flow.releaseConfirmation(0));

    expectUnverifiedEmail();
    await completeCurrentEmailReset();
  });

  it('이메일 확인 도중 A→B→A로 돌아와도 첫 A 증명을 재사용하지 않는다', async () => {
    flow = installDeferredEmailFlow({ holdFirstConfirmation: true });
    renderEmailRecovery();
    await startEmailVerification();
    await waitFor(() => expect(flow.confirmations).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: OTHER_EMAIL } });
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: RECOVERY_EMAIL } });
    await settleRequests(() => flow.releaseConfirmation(0));

    expectUnverifiedEmail();
    await completeCurrentEmailReset();
  });

  it('이메일 인증 뒤 같은 정규화 주소를 다시 입력해도 인증 카드를 다시 사용할 수 있다', async () => {
    renderEmailRecovery();
    await verifyCurrentEmail();
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'Owner@Example.TEST ' } });

    expectUnverifiedEmail();
    await completeCurrentEmailReset();
    expect(flow.confirmations).toHaveLength(2);
  });

  it('이메일 입력이 끝 공백을 제거해 실제 값이 바뀌지 않으면 현재 인증을 그대로 사용한다', async () => {
    renderEmailRecovery();
    await verifyCurrentEmail();
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: `${RECOVERY_EMAIL} ` } });

    expect(screen.getByLabelText('이메일')).toHaveValue(RECOVERY_EMAIL);
    expect(screen.getByText('이메일 본인인증이 완료됐어요.')).toBeInTheDocument();
    const index = await submitCurrentEmailPassword(flow);
    expect(flow.resets[index].body).toEqual({ email: RECOVERY_EMAIL, proofToken: flow.confirmations[0].proofToken, newPassword: NEW_EMAIL_PASSWORD });
    await settleRequests(() => flow.releaseReset(index, 'success'));
    expect(screen.getByText('비밀번호를 바꿨어요')).toBeInTheDocument();
    expect(flow.confirmations).toHaveLength(1);
  });

  it.each([
    { change: 'email', outcome: 'success' }, { change: 'email', outcome: 'social-only' }, { change: 'email', outcome: 'failure' },
    { change: 'mode', outcome: 'success' }, { change: 'mode', outcome: 'social-only' }, { change: 'mode', outcome: 'failure' },
    { change: 'normalized-email', outcome: 'success' },
  ] satisfies Array<{ change: 'email' | 'mode' | 'normalized-email'; outcome: 'success' | 'social-only' | 'failure' }>)('저장 대기 중 $change 전환 뒤 이전 $outcome 응답이 현재 인증·저장 화면을 바꾸지 않는다', async ({ change, outcome }) => {
    renderEmailRecovery();
    await verifyCurrentEmail();
    const oldReset = await submitCurrentEmailPassword(flow);
    if (change === 'mode') returnToEmailMode();
    const currentEmail = change === 'email' ? OTHER_EMAIL : change === 'normalized-email' ? 'Owner@Example.TEST ' : RECOVERY_EMAIL;
    await verifyCurrentEmail(currentEmail);
    await settleRequests(() => flow.releaseReset(oldReset, outcome));

    expect(screen.queryByText('비밀번호를 바꿨어요')).not.toBeInTheDocument();
    expect(screen.queryByText('비밀번호가 없는 계정이에요')).not.toBeInTheDocument();
    expect(screen.queryByText(OLD_RESET_ERROR)).not.toBeInTheDocument();
    expect(screen.getByLabelText('새 비밀번호')).toBeInTheDocument();
    const currentReset = await submitCurrentEmailPassword(flow);
    expect(flow.resets[currentReset].body).toEqual({ email: currentEmail.trim().toLowerCase(), proofToken: flow.confirmations.at(-1)?.proofToken, newPassword: NEW_EMAIL_PASSWORD });
    await settleRequests(() => flow.releaseReset(currentReset, 'success'));
    expect(screen.getByText('비밀번호를 바꿨어요')).toBeInTheDocument();
    expect(wireCalls.emailReset).toHaveLength(2);
  });

  it.each(['success', 'social-only', 'failure'] satisfies Array<'success' | 'social-only' | 'failure'>)('현재 이메일의 실제 $outcome 저장 결과는 숨기지 않는다', async (outcome) => {
    renderEmailRecovery();
    await verifyCurrentEmail();
    const index = await submitCurrentEmailPassword(flow);
    await settleRequests(() => flow.releaseReset(index, outcome));

    if (outcome === 'success') {
      expect(screen.getByText('비밀번호를 바꿨어요')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '로그인하러 가기' })).toHaveAttribute('href', '/login/email');
    } else if (outcome === 'social-only') {
      expect(screen.getByText('비밀번호가 없는 계정이에요')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '로그인 화면으로' })).toHaveAttribute('href', '/login');
      expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(OLD_RESET_ERROR)).toBeInTheDocument();
      expect(screen.getByLabelText('새 비밀번호')).toHaveValue(NEW_EMAIL_PASSWORD);
    }
    expect(flow.resets[index].body).toEqual({ email: RECOVERY_EMAIL, proofToken: flow.confirmations[0].proofToken, newPassword: NEW_EMAIL_PASSWORD });
    expect(wireCalls.emailReset).toHaveLength(1);
    expect(wireCalls.phoneReset).toBe(0);
  });
});
