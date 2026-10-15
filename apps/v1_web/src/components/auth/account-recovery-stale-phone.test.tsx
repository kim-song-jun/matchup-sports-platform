import { StrictMode } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';
import { authUiServer, RECOVERY_EMAIL, RECOVERY_PHONE, resetWireScenario, wireCalls } from './mdqa133-auth-ui.fixtures';
import {
  EMAIL_ACCOUNT, installDeferredPhoneFlow, OLD_PHONE_ERROR, OTHER_PHONE, renderRecovery,
  resetIndependentEmailPassword, settleRequests, SOCIAL_ACCOUNT, verifyIndependentEmail, verifyPhone,
} from './account-recovery-stale-phone.fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

let flow: ReturnType<typeof installDeferredPhoneFlow>;
beforeAll(() => authUiServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => authUiServer.close());
beforeEach(() => {
  resetWireScenario();
  window.localStorage.clear();
  window.sessionStorage.clear();
  flow = installDeferredPhoneFlow();
});
afterEach(() => { cleanup(); flow.releaseAll(); authUiServer.resetHandlers(); });

async function startPhoneLookup(phone = RECOVERY_PHONE) {
  const nextCount = flow.finds.length + 1;
  await verifyPhone(phone);
  await waitFor(() => expect(flow.finds).toHaveLength(nextCount));
  expect(flow.issuedPhones).toContain(phone);
  expect(wireCalls.phoneVerify.at(-1)).toEqual({ phone, code: '123456', purpose: 'password_reset' });
  expect(flow.finds.at(-1)?.body).toEqual({ phone, proofToken: `phone-proof:${phone}` });
}

describe('MD-QA #133 이전 휴대폰 조회는 현재 복구 흐름을 덮어쓰지 않는다', () => {
  it('이메일 인증 후 늦은 카카오 전용 조회가 이메일 비밀번호 입력과 저장을 막지 않는다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    await verifyIndependentEmail();
    await settleRequests(() => flow.releaseFind(0, SOCIAL_ACCOUNT));

    expect(screen.queryByText('비밀번호가 없는 계정이에요')).not.toBeInTheDocument();
    expect(screen.getByLabelText('새 비밀번호')).toBeInTheDocument();
    expect(wireCalls.emailVerify).toEqual([{ email: RECOVERY_EMAIL, code: '123456' }]);
    await resetIndependentEmailPassword();
    expect(wireCalls.findAccount).toHaveLength(1);
  });

  it('이메일 인증 후 늦은 이전 번호 오류가 이메일 복구에 노출되지 않는다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    await verifyIndependentEmail();
    await settleRequests(() => flow.releaseFind(0, null));

    expect(screen.queryByText(OLD_PHONE_ERROR)).not.toBeInTheDocument();
    expect(screen.getByLabelText('새 비밀번호')).toBeInTheDocument();
    await resetIndependentEmailPassword();
  });

  it('번호를 바꾼 뒤 이전 성공을 버리고 새 번호를 인증한 조회만 표시한다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: OTHER_PHONE } });
    await settleRequests(() => flow.releaseFind(0, SOCIAL_ACCOUNT));
    expect(screen.queryByText(SOCIAL_ACCOUNT.maskedEmail)).not.toBeInTheDocument();

    await startPhoneLookup(OTHER_PHONE);
    await settleRequests(() => flow.releaseFind(1, EMAIL_ACCOUNT));
    expect(screen.getByText(EMAIL_ACCOUNT.maskedEmail)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인하러 가기' })).toHaveAttribute('href', '/login/email');
    expect(wireCalls.findAccount).toHaveLength(2);
  });

  it('새 번호 조회가 끝난 뒤 이전 번호 실패가 현재 결과를 지우지 않는다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    await startPhoneLookup(OTHER_PHONE);
    flow.releaseFind(1, EMAIL_ACCOUNT);
    await screen.findByText(EMAIL_ACCOUNT.maskedEmail);
    await settleRequests(() => flow.releaseFind(0, null));

    expect(screen.getByText(EMAIL_ACCOUNT.maskedEmail)).toBeInTheDocument();
    expect(screen.queryByText(OLD_PHONE_ERROR)).not.toBeInTheDocument();
    expect(wireCalls.emailReset).toHaveLength(0);
  });

  it('번호 A→B→A로 돌아와도 첫 A의 늦은 결과는 새 인증으로 취급하지 않는다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: OTHER_PHONE } });
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: RECOVERY_PHONE } });
    await settleRequests(() => flow.releaseFind(0, SOCIAL_ACCOUNT));

    expect(screen.queryByText(SOCIAL_ACCOUNT.maskedEmail)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
    expect(wireCalls.findAccount).toHaveLength(1);
  });

  it('아이디→이메일→아이디로 돌아와도 이전 모드의 늦은 결과를 표시하지 않는다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    fireEvent.click(screen.getByRole('tab', { name: '아이디 찾기' }));
    await settleRequests(() => flow.releaseFind(0, SOCIAL_ACCOUNT));

    expect(screen.queryByText(SOCIAL_ACCOUNT.maskedEmail)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
  });

  it('현재 번호의 실제 조회 실패는 숨기지 않고 원인을 표시한다', async () => {
    renderRecovery(<AccountRecoveryClient />);
    await startPhoneLookup();
    await settleRequests(() => flow.releaseFind(0, null));

    expect(screen.getByText(OLD_PHONE_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(EMAIL_ACCOUNT.maskedEmail)).not.toBeInTheDocument();
    expect(wireCalls.emailReset).toHaveLength(0);
  });

  it('휴대폰 인증 대조 중 화면을 떠나면 늦은 인증이 계정 조회를 새로 시작하지 않는다', async () => {
    flow = installDeferredPhoneFlow({ holdVerification: true, autoReleaseFind: true });
    const view = renderRecovery(<AccountRecoveryClient />);
    await verifyPhone();
    await waitFor(() => expect(flow.verifications).toHaveLength(1));
    view.unmountRecovery();
    await settleRequests(() => flow.releaseVerification());

    expect(wireCalls.findAccount).toHaveLength(0);
    expect(wireCalls.emailReset).toHaveLength(0);
  });

  it.each([OTHER_PHONE, RECOVERY_PHONE])('인증 대조 중 %s로 입력을 갱신하면 늦은 이전 인증이 현재 카드를 완료로 만들지 않는다', async (currentPhone) => {
    flow = installDeferredPhoneFlow({ holdVerification: true });
    renderRecovery(<StrictMode><AccountRecoveryClient /></StrictMode>);
    await verifyPhone();
    await waitFor(() => expect(flow.verifications).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: currentPhone } });
    await settleRequests(() => flow.releaseVerification());

    expect(screen.queryByText('휴대폰 본인인증이 완료됐어요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
    expect(wireCalls.findAccount).toHaveLength(0);
    await verifyPhone(currentPhone);
    await waitFor(() => expect(flow.verifications).toHaveLength(2));
    flow.releaseVerification(1, currentPhone);
    await waitFor(() => expect(flow.finds).toHaveLength(1));
    expect(flow.finds[0].body).toEqual({ phone: currentPhone, proofToken: `phone-proof:${currentPhone}` });
    await settleRequests(() => flow.releaseFind(0, EMAIL_ACCOUNT));
    expect(screen.getByText(EMAIL_ACCOUNT.maskedEmail)).toBeInTheDocument();
    expect(wireCalls.findAccount).toHaveLength(1);
  });
});
