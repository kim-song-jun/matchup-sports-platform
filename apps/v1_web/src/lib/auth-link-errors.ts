import { V1ApiError } from './api-client';
import { sanitizeRedirectPath } from './session-storage';
import type {
  V1LinkableProvider,
  V1RecentLoginRequiredDetails,
  V1SignInThenLinkDetails,
  V1SocialLoginProvider,
  V1WithdrawalPendingDetails,
} from '@/types/api';

export const RECENT_LOGIN_REQUIRED_CODE = 'RECENT_LOGIN_REQUIRED';
export const SIGNUP_INCOMPLETE_CODE = 'SIGNUP_INCOMPLETE';
export const SOCIAL_LINK_TOKEN_INVALID_CODE = 'SOCIAL_LINK_TOKEN_INVALID';
export const ACCOUNT_WITHDRAWAL_PENDING_CODE = 'ACCOUNT_WITHDRAWAL_PENDING';
export const PASSWORD_LOGIN_UNAVAILABLE_CODE = 'PASSWORD_LOGIN_UNAVAILABLE';

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
 * 연결 토큰은 토큰과 유효 시간이 둘 다 온전할 때만 싣는다 — 유효 시간을 모르는 토큰은 만료를 가릴 수 없어 쓰지 않는다.
 */
export function getSignInThenLinkHint(error: unknown): V1SignInThenLinkDetails | null {
  if (!(error instanceof V1ApiError) || error.statusCode !== 409) return null;
  const details = asRecord(error.details);
  if (details?.next !== 'sign_in_then_link' || !isLinkableProvider(details.provider)) return null;
  const hint: V1SignInThenLinkDetails = { next: 'sign_in_then_link', provider: details.provider };
  const { linkToken, linkTokenExpiresInSeconds } = details;
  if (typeof linkToken === 'string' && linkToken !== '' && isPositiveNumber(linkTokenExpiresInSeconds)) {
    return { ...hint, linkToken, linkTokenExpiresInSeconds };
  }
  return hint;
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

/**
 * 가입이 덜 끝난 계정이 연결을 시도해 403 을 받았을 때, 가입을 이어 갈 화면 경로.
 * 경로는 서버가 정하지만 이동 전에 같은 origin 의 상대 경로인지 한 번 더 거른다.
 */
export function getSignupIncompleteRoute(error: unknown): string | null {
  if (!(error instanceof V1ApiError) || error.statusCode !== 403 || error.code !== SIGNUP_INCOMPLETE_CODE) return null;
  const route = asRecord(asRecord(error.details)?.next)?.route;
  return typeof route === 'string' ? sanitizeRedirectPath(route) : null;
}

const SOCIAL_LOGIN_PROVIDERS: readonly string[] = ['kakao', 'apple', 'naver'];

/**
 * 비밀번호가 없는 계정의 재설정이 거절됐을 때, 그 계정이 실제로 가진 소셜 로그인 수단(중복 없이, 서버 순서대로).
 * 이 오류가 아니거나 알아볼 수 있는 수단이 없으면 빈 배열이다 — 화면은 수단을 특정하지 않는 안내를 쓴다.
 */
export function getPasswordLoginUnavailableProviders(error: unknown): V1SocialLoginProvider[] {
  if (!(error instanceof V1ApiError) || error.statusCode !== 400 || error.code !== PASSWORD_LOGIN_UNAVAILABLE_CODE) return [];
  const providers = asRecord(error.details)?.providers;
  if (!Array.isArray(providers)) return [];
  const known = providers.filter((provider): provider is V1SocialLoginProvider => (
    typeof provider === 'string' && SOCIAL_LOGIN_PROVIDERS.includes(provider)
  ));
  return [...new Set(known)];
}
