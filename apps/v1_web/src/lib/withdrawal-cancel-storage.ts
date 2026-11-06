import type { WithdrawalCancelOffer } from './auth-link-errors';
import { createSessionJsonSlot } from './session-json-slot';
import { sanitizeRedirectPath } from './session-storage';

/**
 * 탈퇴 신청 계정의 로그인 403 이 준 철회 토큰을 로그인 화면에서 철회 화면(`/auth/withdrawal-cancel`)으로 넘기는 칸.
 * 토큰은 주소에 싣지 않는다 — 새면 로그인 자격 없이 철회 세션을 받는다.
 */
export const WITHDRAWAL_CANCEL_STORAGE_KEY = 'teameet.v1.withdrawal_cancel';

export type StoredWithdrawalCancel = {
  token: string;
  /** 이 시각(ISO)부터 토큰은 서버가 받지 않는다. */
  expiresAt: string;
  /** 철회가 끝난 뒤 돌아갈 같은 origin 경로. 저장하고 읽을 때 모두 `sanitizeRedirectPath` 를 통과한 값이다. */
  returnTo: string | null;
};

function parseWithdrawalCancel(value: unknown): StoredWithdrawalCancel | null {
  if (typeof value !== 'object' || value === null) return null;
  const { token, expiresAt, returnTo } = value as Record<string, unknown>;
  if (typeof token !== 'string' || token === '') return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  if (returnTo !== null && typeof returnTo !== 'string') return null;
  return { token, expiresAt, returnTo: sanitizeRedirectPath(returnTo) };
}

const slot = createSessionJsonSlot(WITHDRAWAL_CANCEL_STORAGE_KEY, parseWithdrawalCancel);

/** 스토리지가 막힌 환경이면 false — 호출부가 철회 화면으로 보내는 대신 오류를 보여 줘야 한다. */
export function saveWithdrawalCancel(
  offer: WithdrawalCancelOffer,
  returnTo: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return slot.save({
    token: offer.token,
    expiresAt: new Date(nowMs + offer.expiresInSeconds * 1000).toISOString(),
    returnTo: sanitizeRedirectPath(returnTo),
  });
}

/** 없거나 깨졌거나 만료됐으면 null 이고, 그 값은 그 자리에서 지운다. */
export function readWithdrawalCancel(nowMs: number = Date.now()): StoredWithdrawalCancel | null {
  const stored = slot.read();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) <= nowMs) {
    slot.clear();
    return null;
  }
  return stored;
}

export function clearWithdrawalCancel() {
  slot.clear();
}
