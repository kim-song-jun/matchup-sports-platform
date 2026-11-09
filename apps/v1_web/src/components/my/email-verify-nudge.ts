import type { V1AuthMe } from '@/types/api';

/** 닫으면 이 기간 동안 숨긴다. */
export const EMAIL_VERIFY_NUDGE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
/** 처음 보인 뒤 다시 보여 주는 최대 횟수. 이 횟수를 다 쓴 뒤 닫으면 다시는 보이지 않는다. */
export const EMAIL_VERIFY_NUDGE_MAX_RESHOWS = 3;

// 가입 필수 단계를 마친 상태. `deferred` 는 가입을 마치고 관심 설정만 미룬 계정이다. 목록에 없는 값(진행 중·소셜 가입 미룸·새로 생길 값)은 권유하지 않는 쪽이 안전하다.
const SIGNUP_COMPLETE_STATUSES: readonly string[] = ['signup_done', 'sport_done', 'level_done', 'region_done', 'completed', 'deferred'];

/**
 * 이 계정에 이메일 인증 권유를 띄울 수 있는지 서버가 준 사실만으로 판정한다.
 * 닫음 기억은 여기서 보지 않는다(기기마다 다르다) — 대상이면 사용자 id 를 돌려준다.
 */
export function emailVerifyNudgeTarget(me: V1AuthMe | undefined): { userId: string } | null {
  if (me?.verification?.emailVerified !== false) return null;
  const { user } = me;
  if (user.accountStatus !== 'active') return null;
  if (!SIGNUP_COMPLETE_STATUSES.includes(user.onboardingStatus)) return null;
  if (!user.authProviders?.includes('email') || user.hasPassword !== true) return null;
  return { userId: user.id };
}

type NudgeMemory = { closedAt: number; closeCount: number };

const storageKey = (userId: string) => `teameet:v1:email-verify-nudge:${userId}`;

// localStorage 를 못 쓰는 환경(사파리 개인 모드 등)에서는 같은 페이지 수명 동안만 기억한다.
const memoryFallback = new Map<string, NudgeMemory>();

function isNudgeMemory(value: unknown): value is NudgeMemory {
  if (typeof value !== 'object' || value === null) return false;
  const { closedAt, closeCount } = value as Record<string, unknown>;
  return typeof closedAt === 'number' && Number.isFinite(closedAt) && Number.isInteger(closeCount) && (closeCount as number) > 0;
}

function readMemory(userId: string): NudgeMemory | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw === null) return memoryFallback.get(userId) ?? null;
    const parsed: unknown = JSON.parse(raw);
    return isNudgeMemory(parsed) ? parsed : null;
  } catch {
    return memoryFallback.get(userId) ?? null;
  }
}

function writeMemory(userId: string, memory: NudgeMemory): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(memory));
  } catch {
    memoryFallback.set(userId, memory);
  }
}

/** 지금 배너를 보여 줘도 되는지. 닫은 적이 없거나, 숨긴 기간이 지났고 남은 재노출 횟수가 있으면 true. */
export function isEmailVerifyNudgeDue(userId: string, now = Date.now()): boolean {
  const memory = readMemory(userId);
  if (!memory) return true;
  if (memory.closeCount > EMAIL_VERIFY_NUDGE_MAX_RESHOWS) return false;
  // 기기 시계가 크게 어긋나 숨김 기간보다 먼 미래에 닫힌 것으로 적혔으면 믿지 않는다 — 배너가 영영 안 뜨게 된다.
  if (memory.closedAt - now > EMAIL_VERIFY_NUDGE_SNOOZE_MS) return true;
  return now - memory.closedAt >= EMAIL_VERIFY_NUDGE_SNOOZE_MS;
}

/** 닫음을 기억하고, 숨긴 기간이 지나면 다시 보여 줄 것인지(남은 재노출이 있는지)를 돌려준다. */
export function recordEmailVerifyNudgeClosed(userId: string, now = Date.now()): { willReturn: boolean } {
  const closeCount = (readMemory(userId)?.closeCount ?? 0) + 1;
  writeMemory(userId, { closedAt: now, closeCount });
  return { willReturn: closeCount <= EMAIL_VERIFY_NUDGE_MAX_RESHOWS };
}
