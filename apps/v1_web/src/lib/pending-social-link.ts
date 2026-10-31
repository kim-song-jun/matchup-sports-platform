import type { V1LinkableProvider, V1SignInThenLinkDetails } from '@/types/api';
import { createSessionJsonSlot } from './session-json-slot';

/**
 * 카카오·애플 로그인이 기존 계정과 충돌한 뒤, 사용자가 원래 계정으로 로그인하는 동안 연결 토큰을 들고 있는 칸.
 * 로그인 직후 값이 있으면 `POST /auth/link/pending` 으로 자동 연결하고, 결과를 본 뒤 `clearPendingSocialLink` 한다.
 */
export const PENDING_SOCIAL_LINK_STORAGE_KEY = 'teameet.v1.pending_social_link';

/** 저장되는 모양. */
export type PendingSocialLink = {
  linkToken: string;
  provider: V1LinkableProvider;
  /** 이 시각(ISO)부터 토큰은 서버가 받지 않는다. */
  expiresAt: string;
};

/** 읽은 결과: 아직 쓸 수 있는 토큰, 또는 기다리는 사이 만료됐다는 한 번뿐인 표식(토큰은 이미 지워졌다). */
export type PendingSocialLinkRead =
  | (PendingSocialLink & { expired: false })
  | { provider: V1LinkableProvider; expired: true };

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

/**
 * 없거나 깨졌으면 null(깨진 값은 그 자리에서 지운다). 만료됐으면 값을 지우고 `{ provider, expired: true }` 를
 * 딱 한 번 돌려준다 — 화면이 "연결 시간이 지났어요"를 알릴 수 있게 하고, 다음 읽기는 null 이다.
 */
export function readPendingSocialLink(nowMs: number = Date.now()): PendingSocialLinkRead | null {
  const stored = slot.read();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) <= nowMs) {
    slot.clear();
    return { provider: stored.provider, expired: true };
  }
  return { ...stored, expired: false };
}

export function clearPendingSocialLink() {
  slot.clear();
}
