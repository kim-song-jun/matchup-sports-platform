import { V1ApiError } from './api-client';
import type {
  V1LinkableProvider,
  V1RecentLoginRequiredDetails,
  V1SignInThenLinkDetails,
  V1WithdrawalPendingDetails,
} from '@/types/api';

export const RECENT_LOGIN_REQUIRED_CODE = 'RECENT_LOGIN_REQUIRED';
export const ACCOUNT_WITHDRAWAL_PENDING_CODE = 'ACCOUNT_WITHDRAWAL_PENDING';

/** 탈퇴 철회를 권하는 403 에서 꺼낸 값. `token` 은 `POST /auth/withdrawal/cancel` 본문에 그대로 넣는다. */
export type WithdrawalCancelOffer = {
  token: V1WithdrawalPendingDetails['withdrawalCancelToken'];
  expiresInSeconds: V1WithdrawalPendingDetails['expiresInSeconds'];
};

// `details` 는 서버가 채운 JSON 이라 모양을 믿지 않는다. 모양이 맞지 않으면 안내가 없는 것으로 본다.
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isLinkableProvider(value: unknown): value is V1LinkableProvider {
  return value === 'kakao' || value === 'apple';
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * 로그인·가입 충돌 409 가 "원래 방법으로 로그인한 뒤 설정에서 연결"을 안내하는지 확인한다.
 * 같은 409 라도 `details` 가 이 모양이 아니면 null 이다(코드로 분기하지 않는다 — 안내는 `details` 가 정한다).
 */
export function getSignInThenLinkHint(error: unknown): V1SignInThenLinkDetails | null {
  if (!(error instanceof V1ApiError) || error.statusCode !== 409) return null;
  const details = asRecord(error.details);
  if (details?.next !== 'sign_in_then_link' || !isLinkableProvider(details.provider)) return null;
  return { next: 'sign_in_then_link', provider: details.provider };
}

/** 자격이 맞은 탈퇴 신청 계정의 로그인 403 에서 철회 토큰을 꺼낸다. 토큰이 없으면(자격 불일치 등) null. */
export function getWithdrawalCancelOffer(error: unknown): WithdrawalCancelOffer | null {
  if (!(error instanceof V1ApiError) || error.statusCode !== 403 || error.code !== ACCOUNT_WITHDRAWAL_PENDING_CODE) {
    return null;
  }
  const details = asRecord(error.details);
  const token = details?.withdrawalCancelToken;
  const expiresInSeconds = details?.expiresInSeconds;
  if (typeof token !== 'string' || token === '' || !isPositiveNumber(expiresInSeconds)) return null;
  return { token, expiresInSeconds };
}

/** 소셜 연결이 "최근에 로그인해야 한다"며 403 으로 거절됐는지 확인하고, 허용 시간(초)을 꺼낸다. */
export function getRecentLoginRequired(error: unknown): V1RecentLoginRequiredDetails | null {
  if (!(error instanceof V1ApiError) || error.statusCode !== 403 || error.code !== RECENT_LOGIN_REQUIRED_CODE) {
    return null;
  }
  const maxAgeSeconds = asRecord(error.details)?.maxAgeSeconds;
  return isPositiveNumber(maxAgeSeconds) ? { maxAgeSeconds } : null;
}
