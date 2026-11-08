import { isPlausibleEmail } from '@/components/auth/signup-profile-validation';
import { createSessionJsonSlot } from './session-json-slot';
import { sanitizeRedirectPath } from './session-storage';

/**
 * 이메일 가입 중 "이 번호는 이미 가입돼 있어요" 안내에서 "로그인하고 이 이메일 연결하기"를 고른 사람의 뜻을 들고 있는 칸.
 * 원래 계정으로 로그인한 직후 로그인 방법 추가 화면을 열어 주려고 둔다. 번호 인증이 가입의 첫 단계라 이메일을 아직
 * 적기 전일 수 있어서 이메일은 없을 수 있다(null). 비밀번호는 저장하지 않는다.
 */
export const PENDING_EMAIL_LINK_STORAGE_KEY = 'teameet.v1.pending_email_link';

/**
 * 입력한 이메일이 탭에 남아 있어도 되는 시간. 공용 기기에서 앞사람이 쓰다 만 이메일이 다음 사람에게 제안되는 일을
 * 막는 상한이라, 로그인에 걸리는 시간이 아니라 노출 허용 시간으로 정한다 — 소셜 연결 토큰의 유효 시간(30분)과 무관하다.
 */
export const SHARED_TAB_EMAIL_EXPOSURE_MS = 10 * 60 * 1000;

/** 서버 DTO 의 주소 길이 상한과 같다. */
const MAX_EMAIL_LENGTH = 254;

export type PendingEmailLink = {
  /** 연결할 이메일. 아직 적기 전에 뜻만 받은 기록이면 null — 연결 화면이 빈 칸으로 시작한다. */
  email: string | null;
  /** 로그인이 끝난 뒤 돌아갈 같은 origin 경로. 저장하고 읽을 때 모두 `sanitizeRedirectPath` 를 통과한 값이다. */
  returnTo: string | null;
};

type StoredPendingEmailLink = PendingEmailLink & {
  /** 이 시각(ISO)부터는 없는 것으로 본다. */
  expiresAt: string;
};

function isStorableEmail(email: string) {
  return email.length <= MAX_EMAIL_LENGTH && isPlausibleEmail(email);
}

function parsePendingEmailLink(value: unknown): StoredPendingEmailLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const { email, returnTo, expiresAt } = value as Record<string, unknown>;
  if (email !== null && (typeof email !== 'string' || !isStorableEmail(email))) return null;
  if (returnTo !== null && typeof returnTo !== 'string') return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  return { email, returnTo: sanitizeRedirectPath(returnTo), expiresAt };
}

const slot = createSessionJsonSlot(PENDING_EMAIL_LINK_STORAGE_KEY, parsePendingEmailLink);

/**
 * 소문자·공백 제거로 정리한 이메일과 로그인 뒤 돌아갈 경로를 저장한다. 이메일이 null 이면 뜻만 저장한다. 저장했으면 true.
 * 이메일 모양이 아니거나 스토리지가 막혀 있으면 false 이고, 그때 이전 값도 지운다 — 옛 값이 새 값 대신 읽히면 안 된다.
 */
export function savePendingEmailLink(
  offer: { email: string | null; returnTo?: string | null },
  nowMs: number = Date.now(),
): boolean {
  const email = offer.email === null ? null : offer.email.trim().toLowerCase();
  if (email !== null && !isStorableEmail(email)) {
    slot.clear();
    return false;
  }
  return slot.save({
    email,
    returnTo: sanitizeRedirectPath(offer.returnTo),
    expiresAt: new Date(nowMs + SHARED_TAB_EMAIL_EXPOSURE_MS).toISOString(),
  });
}

/** `readPendingEmailLink` 에 사라지는 시각(ISO)을 더해, 남은 시간을 화면에 알리는 쪽이 쓴다. */
export function readPendingEmailLinkWithExpiry(nowMs: number = Date.now()): (PendingEmailLink & { expiresAt: string }) | null {
  const stored = slot.read();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) <= nowMs) {
    slot.clear();
    return null;
  }
  return { email: stored.email, returnTo: stored.returnTo, expiresAt: stored.expiresAt };
}

/** 상태를 바꾸지 않고 읽는다. 없거나 깨졌거나 만료됐으면 null 이고, 알아볼 수 없는 값과 만료된 값은 그 자리에서 지운다. */
export function readPendingEmailLink(nowMs: number = Date.now()): PendingEmailLink | null {
  const stored = readPendingEmailLinkWithExpiry(nowMs);
  return stored ? { email: stored.email, returnTo: stored.returnTo } : null;
}

export function clearPendingEmailLink() {
  slot.clear();
}
