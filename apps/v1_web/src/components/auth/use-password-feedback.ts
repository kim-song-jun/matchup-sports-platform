'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  COMMON_PASSWORD_ERROR_CODE,
  COMMON_PASSWORD_MESSAGE,
  accountPasswordIssue,
} from '@/lib/account-password-rules';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/** 입력이 이만큼 멈춘 뒤에야 비밀번호 안내가 나온다 — 타이핑 중에 문구가 번쩍이지 않게. */
export const PASSWORD_FEEDBACK_DELAY_MS = 400;

export const PASSWORD_TOO_SHORT_MESSAGE = '8자 이상 입력해 주세요.';
export const PASSWORD_USABLE_MESSAGE = '사용할 수 있는 비밀번호예요.';
/** 다음 버튼이 잠긴 이유로 보여 주는 문구(흔한 비밀번호, 서버가 거절한 비밀번호). */
export const PASSWORD_CHOOSE_ANOTHER_HINT = '다른 비밀번호를 정해 주세요.';
export const PASSWORD_TOO_SHORT_HINT = '비밀번호는 8자 이상이어야 해요.';

export type PasswordFeedback = { kind: 'error' | 'success'; message: string } | null;

/**
 * 새 비밀번호 칸(가입·이메일 로그인 연결·비밀번호 재설정)이 같은 판정으로 같은 말을 하게 하는 규칙 한 곳.
 *
 * - `usable`·`tooCommon` 은 지금 값의 즉시 판정이다 — 버튼을 잠그고 잠긴 이유를 알리는 데 쓴다.
 * - `feedback` 은 입력이 멈춘 뒤의 판정이다. 멈추기 전에는 값이 바뀌어도 새 말을 하지 않고, 지금 값과 어긋나는
 *   말(흔한 비밀번호에 "사용할 수 있어요")은 한 번도 하지 않는다.
 * - 화면의 판정과 서버의 판정이 어긋나 서버가 PASSWORD_TOO_COMMON 으로 거절하면 `rejectIfTooCommon` 이 그 문구를
 *   같은 칸 아래에 그대로 올린다. 거절된 값을 고치기 전까지 다음 버튼도 잠근다.
 */
export function usePasswordFeedback(password: string) {
  const [settled, setSettled] = useState(password);
  const [rejected, setRejected] = useState<{ password: string; message: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(password), PASSWORD_FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [password]);

  const issue = accountPasswordIssue(password);
  const rejectedNow = rejected !== null && rejected.password === password;
  const tooCommon = issue === 'too_common' || rejectedNow;
  const usable = issue === null && !rejectedNow;

  let feedback: PasswordFeedback = null;
  if (rejected !== null && rejectedNow) {
    feedback = { kind: 'error', message: rejected.message };
  } else if (password !== '' && settled !== '') {
    const settledIssue = accountPasswordIssue(settled);
    if (issue !== null && settledIssue !== null) {
      feedback = { kind: 'error', message: issue === 'too_common' ? COMMON_PASSWORD_MESSAGE : PASSWORD_TOO_SHORT_MESSAGE };
    } else if (issue === null && settledIssue === null) {
      feedback = { kind: 'success', message: PASSWORD_USABLE_MESSAGE };
    }
  }

  /** 서버 거절이 흔한 비밀번호 때문이면 문구를 이 칸에 올리고 true. 다른 사유면 false 라 호출부가 자기 오류로 다룬다. */
  const rejectIfTooCommon = useCallback((error: unknown): boolean => {
    if (extractErrorCode(error) !== COMMON_PASSWORD_ERROR_CODE) return false;
    setRejected({ password, message: extractErrorMessage(error, COMMON_PASSWORD_MESSAGE) });
    return true;
  }, [password]);

  /** 막힌 이유 한 줄 — `usable` 이 false 일 때 다음 버튼 아래에 보여 준다. */
  const blockedHint = tooCommon ? PASSWORD_CHOOSE_ANOTHER_HINT : PASSWORD_TOO_SHORT_HINT;

  return { usable, tooCommon, feedback, blockedHint, rejectIfTooCommon };
}
