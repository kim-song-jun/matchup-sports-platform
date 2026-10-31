import { getSignInThenLinkHint, getWithdrawalCancelOffer } from '@/lib/auth-link-errors';
import { savePendingSocialLink } from '@/lib/pending-social-link';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import { saveWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';
import type { V1LinkableProvider } from '@/types/api';

export const ACCOUNT_CONFLICT_PATH = '/auth/account-conflict';
export const WITHDRAWAL_CANCEL_PATH = '/auth/withdrawal-cancel';

const WITHDRAWAL_STORAGE_FAILED_MESSAGE =
  '탈퇴 철회 화면으로 이동하지 못했어요. 브라우저의 저장 공간 설정을 확인한 뒤 다시 시도해 주세요.';

/** 로그인 실패 뒤 사용자를 보낼 곳. 토큰을 넘길 저장 칸이 막히면 이동하지 않고 이유만 돌려준다. */
export type LoginRecoveryRoute =
  | { type: 'navigate'; path: string }
  | { type: 'storage-failed'; message: string };

export function buildAccountConflictPath(provider: V1LinkableProvider, redirect?: string | null): string {
  const params = new URLSearchParams({ provider });
  const safeRedirect = sanitizeRedirectPath(redirect);
  if (safeRedirect) params.set('redirect', safeRedirect);
  return `${ACCOUNT_CONFLICT_PATH}?${params.toString()}`;
}

/**
 * 카카오·Apple 로그인이 "이미 팀밋 계정이 있어요" 409 로 막혔을 때: 연결 토큰을 보관하고 안내 화면 경로를 돌려준다.
 * 토큰이 없는 응답이거나 저장 칸이 막혀 있으면 자동 연결만 빠지고 안내는 그대로 간다 — 안내 화면이 보관 여부를 다시 읽는다.
 */
export function routeToAccountConflict(error: unknown, redirect?: string | null): LoginRecoveryRoute | null {
  const hint = getSignInThenLinkHint(error);
  if (!hint) return null;
  savePendingSocialLink(hint);
  return { type: 'navigate', path: buildAccountConflictPath(hint.provider, redirect) };
}

/** 자격이 맞은 탈퇴 신청 계정의 로그인 403: 철회 토큰을 보관하고 철회 화면 경로를 돌려준다. 토큰은 주소에 싣지 않는다. */
export function routeToWithdrawalCancel(error: unknown, returnTo?: string | null): LoginRecoveryRoute | null {
  const offer = getWithdrawalCancelOffer(error);
  if (!offer) return null;
  return saveWithdrawalCancel(offer, returnTo)
    ? { type: 'navigate', path: WITHDRAWAL_CANCEL_PATH }
    : { type: 'storage-failed', message: WITHDRAWAL_STORAGE_FAILED_MESSAGE };
}

/** 소셜 로그인(웹 콜백·네이티브 버튼) 공통: 충돌 안내와 탈퇴 철회 중 해당하는 쪽의 경로. */
export function routeSocialLoginRecovery(error: unknown, redirect?: string | null): LoginRecoveryRoute | null {
  return routeToAccountConflict(error, redirect) ?? routeToWithdrawalCancel(error, redirect);
}
