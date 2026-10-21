import { V1ApiError } from '@/lib/api-client';
import { extractErrorCode } from '@/lib/error-message';

/** 서버 에러 코드(`docs/api` 인증 계약). 메시지 문자열이 아니라 코드로 가른다. */
export const STEP_UP_CODE_INVALID = 'STEP_UP_CODE_INVALID';
export const STEP_UP_EXPIRED = 'STEP_UP_EXPIRED';
export const STEP_UP_TOO_MANY_ATTEMPTS = 'STEP_UP_TOO_MANY_ATTEMPTS';
export const STEP_UP_RESEND_COOLDOWN = 'STEP_UP_RESEND_COOLDOWN';
/** 이메일 하나당 24시간 발송 상한. 로그인(챌린지 발급)과 다시 받기 둘 다에서 온다. */
export const STEP_UP_SEND_LIMIT = 'STEP_UP_SEND_LIMIT';
/** 서버에 메일 발송 수단이 없을 때 — 모든 추가 인증 요청이 같은 503 을 받는다. */
export const STEP_UP_UNAVAILABLE = 'STEP_UP_UNAVAILABLE';

/** 서버가 막은 "다시 받기" 대기 시간(30초). 응답에 남은 시간(details.retryAfterSeconds)이 없을 때만 쓴다. */
export const STEP_UP_RESEND_COOLDOWN_MS = 30 * 1000;

export const STEP_UP_SEND_LIMIT_MESSAGE =
  '이 메일로 보낼 수 있는 인증번호를 오늘 다 보냈어요. 비밀번호를 재설정하면 바로 다시 로그인할 수 있어요.';

export const STEP_UP_UNAVAILABLE_MESSAGE = '지금은 인증 메일을 보낼 수 없어 로그인할 수 없어요. 잠시 후 다시 시도해 주세요.';

export type StepUpFailure =
  /** 화면에 머물고 입력칸 아래에 알린다. */
  | {
    kind: 'inline';
    message: string;
    tone: 'error' | 'info';
    /** 비밀번호 재설정으로 가는 길을 함께 보여 준다. */
    recovery?: boolean;
    /** 이 시간(ms) 뒤에 다시 받을 수 있다. 0 이면 바로. */
    resendInMs?: number;
    /** 현재 인증번호로는 더 시도할 수 없다 — 새 인증번호를 받아야 풀린다. */
    codeExhausted?: boolean;
  }
  /** 이 챌린지로는 더 할 수 있는 게 없다 — 처음부터 다시 로그인해야 한다. */
  | { kind: 'dead' };

const RESTRICTED_MESSAGE = '로그인이 제한된 계정이에요. 고객센터에서 상태를 확인해 주세요.';

function isRateLimited(err: unknown) {
  return err instanceof V1ApiError && err.statusCode === 429;
}

function retryAfterMs(err: unknown): number {
  const details = err instanceof V1ApiError ? err.details : null;
  const seconds = typeof details === 'object' && details !== null ? (details as { retryAfterSeconds?: unknown }).retryAfterSeconds : null;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : STEP_UP_RESEND_COOLDOWN_MS;
}

export function describeVerifyFailure(err: unknown): StepUpFailure {
  const code = extractErrorCode(err);
  if (code === STEP_UP_EXPIRED) return { kind: 'dead' };
  if (code === STEP_UP_TOO_MANY_ATTEMPTS) {
    return {
      kind: 'inline',
      tone: 'error',
      codeExhausted: true,
      message: '인증번호를 너무 많이 틀렸어요. 인증번호를 다시 받아 주세요.',
    };
  }
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
  if (code === STEP_UP_EXPIRED) return { kind: 'dead' };
  if (code === STEP_UP_RESEND_COOLDOWN) {
    // 실패가 아니라 "조금 뒤에 다시" 안내다. 빨간 오류로 띄우면 인증이 틀어진 줄 안다.
    return { kind: 'inline', tone: 'info', resendInMs: retryAfterMs(err), message: '잠시 후에 다시 받을 수 있어요.' };
  }
  if (code === STEP_UP_SEND_LIMIT) {
    return { kind: 'inline', tone: 'error', recovery: true, message: STEP_UP_SEND_LIMIT_MESSAGE };
  }
  if (code === STEP_UP_UNAVAILABLE) {
    return { kind: 'inline', tone: 'error', message: STEP_UP_UNAVAILABLE_MESSAGE };
  }
  if (isRateLimited(err)) {
    return { kind: 'inline', tone: 'error', message: '요청이 많아요. 잠시 후 다시 시도해 주세요.' };
  }
  return { kind: 'inline', tone: 'error', message: '지금은 인증번호를 보낼 수 없어요. 잠시 후 다시 시도해 주세요.' };
}
