import { V1ApiError } from '@/lib/api-client';
import { extractErrorCode } from '@/lib/error-message';

/** 서버 에러 코드(`docs/api` 인증 계약). 메시지 문자열이 아니라 코드로 가른다. */
export const STEP_UP_CODE_INVALID = 'STEP_UP_CODE_INVALID';
export const STEP_UP_EXPIRED = 'STEP_UP_EXPIRED';
export const STEP_UP_TOO_MANY_ATTEMPTS = 'STEP_UP_TOO_MANY_ATTEMPTS';
export const STEP_UP_RESEND_COOLDOWN = 'STEP_UP_RESEND_COOLDOWN';

/** 서버가 막은 "다시 받기" 대기 시간(30초). RESEND_COOLDOWN 응답에는 남은 시간이 없어 같은 값으로 맞춘다. */
export const STEP_UP_RESEND_COOLDOWN_MS = 30 * 1000;

export type StepUpFailure =
  /** 화면에 머물고 입력칸 아래에 알린다. */
  | { kind: 'inline'; message: string; tone: 'error' | 'info'; restartCooldown?: boolean }
  /** 이 챌린지로는 더 할 수 있는 게 없다 — 처음부터 다시 로그인해야 한다. */
  | { kind: 'dead'; reason: 'expired' | 'locked' };

const RESTRICTED_MESSAGE = '로그인이 제한된 계정이에요. 고객센터에서 상태를 확인해 주세요.';

function isRateLimited(err: unknown) {
  return err instanceof V1ApiError && err.statusCode === 429;
}

export function describeVerifyFailure(err: unknown): StepUpFailure {
  const code = extractErrorCode(err);
  if (code === STEP_UP_EXPIRED) return { kind: 'dead', reason: 'expired' };
  if (code === STEP_UP_TOO_MANY_ATTEMPTS) return { kind: 'dead', reason: 'locked' };
  if (code === STEP_UP_CODE_INVALID) {
    return { kind: 'inline', tone: 'error', message: '인증번호가 맞지 않아요. 메일에 적힌 6자리 숫자를 다시 확인해 주세요.' };
  }
  if (code === 'PERMISSION_DENIED') return { kind: 'inline', tone: 'error', message: RESTRICTED_MESSAGE };
  if (isRateLimited(err)) {
    return { kind: 'inline', tone: 'error', message: '시도가 많아요. 잠시 후 다시 시도해 주세요.' };
  }
  return { kind: 'inline', tone: 'error', message: '지금은 인증할 수 없어요. 잠시 후 다시 시도해 주세요.' };
}

export function describeResendFailure(err: unknown): StepUpFailure {
  const code = extractErrorCode(err);
  if (code === STEP_UP_EXPIRED) return { kind: 'dead', reason: 'expired' };
  if (code === STEP_UP_TOO_MANY_ATTEMPTS) return { kind: 'dead', reason: 'locked' };
  if (code === STEP_UP_RESEND_COOLDOWN) {
    // 실패가 아니라 "조금 뒤에 다시" 안내다. 빨간 오류로 띄우면 인증이 틀어진 줄 안다.
    return { kind: 'inline', tone: 'info', restartCooldown: true, message: '잠시 후에 다시 받을 수 있어요.' };
  }
  if (isRateLimited(err)) {
    return { kind: 'inline', tone: 'error', message: '인증번호를 너무 많이 요청했어요. 시간을 두고 다시 시도해 주세요.' };
  }
  return { kind: 'inline', tone: 'error', message: '지금은 인증번호를 보낼 수 없어요. 잠시 후 다시 시도해 주세요.' };
}
