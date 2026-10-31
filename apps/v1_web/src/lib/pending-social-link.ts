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
  /**
   * 충돌한 계정이 탈퇴 유예 중일 때만 있다. 값은 유예가 끝나는 시각(ISO)이고, 서버가 모르면 null.
   * 없음(undefined)과 null 은 다르다 — 없으면 탈퇴 계정이 아니고, null 이면 탈퇴 계정인데 날짜만 모른다.
   */
  withdrawalPendingUntil?: string | null;
};

/** 읽은 결과: 아직 쓸 수 있는 토큰, 또는 기다리는 사이 만료됐다는 한 번뿐인 표식(토큰은 이미 지워졌다). */
export type PendingSocialLinkRead =
  | (PendingSocialLink & { expired: false })
  | (Pick<PendingSocialLink, 'provider' | 'withdrawalPendingUntil'> & { expired: true });

function parsePendingSocialLink(value: unknown): PendingSocialLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const { linkToken, provider, expiresAt } = record;
  if (typeof linkToken !== 'string' || linkToken === '') return null;
  if (provider !== 'kakao' && provider !== 'apple') return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  if (!('withdrawalPendingUntil' in record)) return { linkToken, provider, expiresAt };
  const { withdrawalPendingUntil } = record;
  if (withdrawalPendingUntil !== null && (typeof withdrawalPendingUntil !== 'string' || Number.isNaN(Date.parse(withdrawalPendingUntil)))) return null;
  return { linkToken, provider, expiresAt, withdrawalPendingUntil };
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
    ...(hint.withdrawalPendingUntil !== undefined ? { withdrawalPendingUntil: hint.withdrawalPendingUntil } : {}),
  });
}

function classify(stored: PendingSocialLink, nowMs: number): PendingSocialLinkRead {
  if (Date.parse(stored.expiresAt) <= nowMs) {
    return {
      provider: stored.provider,
      expired: true,
      ...(stored.withdrawalPendingUntil !== undefined ? { withdrawalPendingUntil: stored.withdrawalPendingUntil } : {}),
    };
  }
  return { ...stored, expired: false };
}

/**
 * 상태를 바꾸지 않고 본다. 없거나 깨졌으면 null, 만료됐으면 `{ provider, expired: true }` — 값은 지우지 않으므로
 * 배너·안내 화면처럼 여러 곳이 몇 번을 읽어도 같은 답이다.
 */
export function peekPendingSocialLink(nowMs: number = Date.now()): PendingSocialLinkRead | null {
  const stored = slot.peek();
  return stored ? classify(stored, nowMs) : null;
}

/**
 * 로그인 직후 연결을 시도하는 한 곳(리졸버)만 쓴다. `peek` 와 같은 답을 주되, 깨진 값은 지우고 만료된 값은 지운 뒤
 * `{ provider, expired: true }` 를 딱 한 번 돌려준다(다음 읽기는 null). 쓸 수 있는 토큰은 남겨 두므로,
 * 결과를 본 뒤 `clearPendingSocialLink` 로 지운다.
 */
export function takePendingSocialLink(nowMs: number = Date.now()): PendingSocialLinkRead | null {
  const stored = slot.read();
  if (!stored) return null;
  const read = classify(stored, nowMs);
  if (read.expired) slot.clear();
  return read;
}

export function clearPendingSocialLink() {
  slot.clear();
}
