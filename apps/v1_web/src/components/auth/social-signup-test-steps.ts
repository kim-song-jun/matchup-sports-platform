import { screen } from '@testing-library/react';
import { expect } from 'vitest';

/** 번호 단계가 가입의 첫 화면이다 — 그 화면이 뜰 때까지 기다리고, 뒤 단계 입력 칸이 앞서 그려지지 않았는지 확인한다. */
export async function advanceSocialSignupToPhone() {
  await screen.findByRole('heading', { name: /^휴대폰 번호를 (확인|입력)해 주세요$/ });
  expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
  await screen.findByLabelText(/^휴대폰 번호/);
}
