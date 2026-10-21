import type { V1EmailLoginResult, V1LoginStepUpChallenge, V1LoginStepUpResponse } from '@/types/api';
import { sanitizeRedirectPath } from './session-storage';

/**
 * 이메일 로그인 추가 인증(step-up) 챌린지를 로그인 화면에서 본인 확인 화면으로 넘기는 저장소.
 * 토큰은 주소(URL)에 싣지 않는다 — 히스토리·리퍼러·공유로 새면 인증번호만 맞히면 로그인된다.
 * sessionStorage 라 탭을 닫으면 사라진다.
 */
export const LOGIN_STEP_UP_STORAGE_KEY = 'teameet.v1.loginStepUp';

export const LOGIN_STEP_UP_VERIFY_PATH = '/login/email/verify';

export type StoredLoginStepUp = V1LoginStepUpChallenge & {
  /** 로그인 화면이 받은 `?redirect=`. 저장 시 sanitizeRedirectPath 를 통과한 값이다. */
  redirect: string | null;
};

export function isLoginStepUpResponse(result: V1EmailLoginResult): result is V1LoginStepUpResponse {
  return 'stepUp' in result;
}

function isStoredLoginStepUp(value: unknown): value is StoredLoginStepUp {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const text = (key: string) => typeof record[key] === 'string' && record[key] !== '';
  const time = (key: string) => text(key) && !Number.isNaN(Date.parse(record[key] as string));
  return text('challengeToken') && text('maskedEmail') && time('expiresAt') && time('resendAvailableAt')
    && (record.devCode === undefined || typeof record.devCode === 'string')
    && (record.redirect === null || typeof record.redirect === 'string');
}

/** 스토리지가 막힌 환경(프라이빗 모드 등)이면 false — 호출부가 화면 이동 대신 오류를 보여 줘야 한다. */
export function saveLoginStepUp(challenge: V1LoginStepUpChallenge, redirect: string | null | undefined): boolean {
  const stored: StoredLoginStepUp = { ...challenge, redirect: sanitizeRedirectPath(redirect) };
  try {
    window.sessionStorage.setItem(LOGIN_STEP_UP_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/** 없거나 깨졌으면 null. 깨진 값은 그 자리에서 지운다. */
export function readLoginStepUp(): StoredLoginStepUp | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(LOGIN_STEP_UP_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredLoginStepUp(parsed)) return { ...parsed, redirect: sanitizeRedirectPath(parsed.redirect) };
  } catch {
    // 아래에서 지운다.
  }
  clearLoginStepUp();
  return null;
}

/** 다시 받기 응답으로 만료·재발송 시각을 갱신한다. 저장된 챌린지가 없으면 아무것도 쓰지 않는다. */
export function updateLoginStepUpTimes(times: Pick<V1LoginStepUpChallenge, 'expiresAt' | 'resendAvailableAt' | 'devCode'>) {
  const current = readLoginStepUp();
  if (!current) return;
  const next: StoredLoginStepUp = { ...current, expiresAt: times.expiresAt, resendAvailableAt: times.resendAvailableAt };
  if (times.devCode === undefined) delete next.devCode;
  else next.devCode = times.devCode;
  try {
    window.sessionStorage.setItem(LOGIN_STEP_UP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 화면 상태는 메모리에도 있다. 저장만 실패하면 새로고침 때 이전 시각으로 돌아갈 뿐이다.
  }
}

export function clearLoginStepUp() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LOGIN_STEP_UP_STORAGE_KEY);
  } catch {
    // 지울 수 없는 환경이면 저장도 되지 않았다.
  }
}

/** 본인 확인 화면에서 "다른 계정으로 로그인"·만료 후 되돌아갈 이메일 로그인 경로. */
export function getEmailLoginPath(redirect: string | null | undefined): string {
  const safe = sanitizeRedirectPath(redirect);
  return safe ? `/login/email?redirect=${encodeURIComponent(safe)}` : '/login/email';
}
