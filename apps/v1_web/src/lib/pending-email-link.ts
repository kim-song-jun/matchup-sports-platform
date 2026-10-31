import { createSessionJsonSlot } from './session-json-slot';

/**
 * 이메일 가입 중 "이 번호는 이미 가입돼 있어요" 안내에서 소셜 로그인 쪽으로 나간 사람이 입력해 둔 이메일을 들고 있는 칸.
 * 원래 계정으로 로그인한 직후 이 이메일로 로그인 방법 추가 화면을 열어 주려고 둔다. 비밀번호는 저장하지 않는다.
 */
export const PENDING_EMAIL_LINK_STORAGE_KEY = 'teameet.v1.pending_email_link';

/** 입력한 이메일을 들고 있는 시간. 서버 연결 토큰(30분)과 같은 길이로 맞춘다. */
export const PENDING_EMAIL_LINK_TTL_MS = 30 * 60 * 1000;

/** 서버 DTO 의 주소 길이 상한과 같다. */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PendingEmailLink = {
  email: string;
  /** 이 시각(ISO)부터는 없는 것으로 본다. */
  expiresAt: string;
};

function isStorableEmail(email: string) {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

function parsePendingEmailLink(value: unknown): PendingEmailLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const { email, expiresAt } = value as Record<string, unknown>;
  if (typeof email !== 'string' || !isStorableEmail(email)) return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  return { email, expiresAt };
}

const slot = createSessionJsonSlot(PENDING_EMAIL_LINK_STORAGE_KEY, parsePendingEmailLink);

/**
 * 소문자·공백 제거로 정리한 이메일을 저장한다. 저장했으면 true.
 * 이메일 모양이 아니거나 스토리지가 막혀 있으면 false 이고, 그때 이전 값도 지운다 — 옛 값이 새 값 대신 읽히면 안 된다.
 */
export function savePendingEmailLink(rawEmail: string, nowMs: number = Date.now()): boolean {
  const email = rawEmail.trim().toLowerCase();
  if (!isStorableEmail(email)) {
    slot.clear();
    return false;
  }
  return slot.save({ email, expiresAt: new Date(nowMs + PENDING_EMAIL_LINK_TTL_MS).toISOString() });
}

/** 상태를 바꾸지 않고 읽는다. 없거나 깨졌거나 만료됐으면 null 이고, 알아볼 수 없는 값과 만료된 값은 그 자리에서 지운다. */
export function readPendingEmailLink(nowMs: number = Date.now()): string | null {
  const stored = slot.read();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) <= nowMs) {
    slot.clear();
    return null;
  }
  return stored.email;
}

export function clearPendingEmailLink() {
  slot.clear();
}
