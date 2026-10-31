import type { V1LinkableProvider, V1SignInThenLinkDetails } from '@/types/api';
import { createSessionJsonSlot } from './session-json-slot';

/**
 * 카카오·애플 로그인이 기존 계정과 충돌한 뒤, 사용자가 원래 계정으로 로그인하는 동안 연결 토큰을 들고 있는 칸.
 * 로그인 직후 값이 있으면 `POST /auth/link/pending` 으로 자동 연결하고, 결과를 본 뒤 `clearPendingSocialLink` 한다.
 */
export const PENDING_SOCIAL_LINK_STORAGE_KEY = 'teameet.v1.pending_social_link';

export type PendingSocialLink = {
  linkToken: string;
  provider: V1LinkableProvider;
  /** 이 시각(ISO)부터 토큰은 서버가 받지 않는다. */
  expiresAt: string;
};

function parsePendingSocialLink(value: unknown): PendingSocialLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const { linkToken, provider, expiresAt } = value as Record<string, unknown>;
  if (typeof linkToken !== 'string' || linkToken === '') return null;
  if (provider !== 'kakao' && provider !== 'apple') return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  return { linkToken, provider, expiresAt };
}

const slot = createSessionJsonSlot(PENDING_SOCIAL_LINK_STORAGE_KEY, parsePendingSocialLink);

/**
 * 충돌 409 의 안내(`getSignInThenLinkHint`)에서 연결 토큰을 저장한다. 저장했으면 true.
 * 토큰이 없는 안내거나 스토리지가 막혀 있으면 false. 토큰이 없는 안내를 받으면 이전에 남은 값도 지운다 —
 * 다른 제공자를 시도한 뒤에 옛 토큰이 로그인 직후 엉뚱하게 연결되면 안 된다.
 */
export function savePendingSocialLink(hint: V1SignInThenLinkDetails, nowMs: number = Date.now()): boolean {
  const { linkToken, linkTokenExpiresInSeconds } = hint;
  if (linkToken === undefined || linkTokenExpiresInSeconds === undefined) {
    slot.clear();
    return false;
  }
  return slot.save({
    linkToken,
    provider: hint.provider,
    expiresAt: new Date(nowMs + linkTokenExpiresInSeconds * 1000).toISOString(),
  });
}

/** 없거나 깨졌거나 만료됐으면 null 이고, 그 값은 그 자리에서 지운다. */
export function readPendingSocialLink(nowMs: number = Date.now()): PendingSocialLink | null {
  const stored = slot.read();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) <= nowMs) {
    slot.clear();
    return null;
  }
  return stored;
}

export function clearPendingSocialLink() {
  slot.clear();
}
