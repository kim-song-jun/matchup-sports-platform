import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { V1ApiError } from '@/lib/api-client';

/** SignupClient 테스트가 함께 쓰는 값과 화면 조작. 모킹(vi.mock)은 각 테스트 파일이 자기 안에서 한다. */

export const TERMS_STORAGE_KEY = 'teameet.v1.signupTermsDocumentIds';
export const TERMS_DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
export const PHONE = '01012345678';
export const OTHER_PHONE = '01099998888';
export const ACCOUNT_PASSWORD = 'Sunny-ride-4';
export const PROOF_TTL_SECONDS = 600;

export function verifiedResponse(overrides: Record<string, unknown> = {}) {
  return {
    verified: true,
    proofToken: 'PROOF-TOKEN',
    proofExpiresInSeconds: PROOF_TTL_SECONDS,
    registered: false,
    withdrawalPendingUntil: null,
    ...overrides,
  };
}

export function registeredResponse(overrides: Record<string, unknown> = {}) {
  return verifiedResponse({ proofToken: 'TAKEN-PROOF', registered: true, ...overrides });
}

/** 호출 시점의 시계 기준으로 만든다 — 시계를 건너뛴 뒤 받는 코드가 이미 만료된 것으로 보이면 안 된다. */
export function issueResponse() {
  return { expiresAt: new Date(Date.now() + 300_000).toISOString() };
}

export function apiError(statusCode: number, code: string, message: string) {
  return new V1ApiError({ message, status: 'error', statusCode, code, timestamp: '2026-11-08T00:00:00.000Z' });
}

/** 하단 큰 버튼으로 인증번호를 받고, 6자리를 넣어 확인한다. */
export async function completePhoneVerification(): Promise<void> {
  const requestButton = await screen.findByRole('button', { name: '인증번호 받기' });
  await act(async () => { fireEvent.click(requestButton); });
  fireEvent.change(await screen.findByLabelText('인증번호 6자리'), { target: { value: '123456' } });
  const confirmButton = screen.getByRole('button', { name: '인증번호 확인' });
  // 확인 응답이 돌아와 상태가 바뀌는 데까지 act 안에서 기다린다.
  await act(async () => { fireEvent.click(confirmButton); });
}

/** 번호를 넣고 인증번호를 받아 6자리를 확인한다(인증 단계 화면에서 시작). */
export async function verifyPhone(phone = PHONE): Promise<void> {
  fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: phone } });
  await completePhoneVerification();
}

/** 계정 단계를 채우고 두 칸을 벗어나 중복 확인까지 마친다. 라벨은 필수 표시(*·(필수))가 붙어 부분 일치로 찾는다. */
export function fillAccountStep(): void {
  fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '테스트닉' } });
  fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'signup@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: ACCOUNT_PASSWORD } });
  fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: ACCOUNT_PASSWORD } });

  // 칸을 벗어나면 0.5초를 기다리지 않고 바로 중복을 확인한다.
  fireEvent.blur(screen.getByLabelText(/^닉네임/));
  fireEvent.blur(screen.getByLabelText(/^이메일/));
}

/** 번호 인증을 마치면 계정 단계로 자동 이동한다. 완료 표시를 잠깐 보여준 뒤(900ms) 넘어가므로 입력칸 등장으로 기다린다. */
export async function advanceToAccount(phone = PHONE): Promise<void> {
  await verifyPhone(phone);
  await screen.findByLabelText(/^닉네임/, {}, { timeout: 3000 });
}

/** 번호 인증 → 계정 단계 입력 → 다음 → 프로필 단계. */
export async function advanceToProfile(phone = PHONE): Promise<void> {
  await advanceToAccount(phone);
  fillAccountStep();
  const next = screen.getByRole('button', { name: '다음' });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
  await screen.findByLabelText(/^이름/);
}

/** 프로필 단계의 필수 항목(이름·생년월일·성별)을 채운다. */
export function fillProfileStep(): void {
  fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
  fireEvent.click(screen.getByRole('radio', { name: '남' }));
}

/** 이 탭과 기기에 저장된 모든 값을 한 문자열로 모은다 — 비밀번호가 어디에도 없음을 확인할 때 쓴다. */
export function storedText(): string {
  return [window.sessionStorage, window.localStorage]
    .flatMap((storage) => Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`))
    .join('\n');
}
