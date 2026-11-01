import { V1ApiError } from './api-client';
import { RECENT_LOGIN_REQUIRED_CODE } from './auth-link-errors';
import { sanitizeRedirectPath } from './session-storage';
import type { V1LinkableProvider, V1LinkSocialResult } from '@/types/api';

/** 로그인 방법 화면. 연결 결과는 `?linkResult=&provider=` 로 이 화면에 전달된다. */
export const LOGIN_METHODS_PATH = '/my/settings/login-methods';

/** 소셜 계정에 이메일·비밀번호 로그인을 더하는 단계 화면. */
export const EMAIL_LINK_PATH = `${LOGIN_METHODS_PATH}/email`;

/** 연결을 마치거나 미루고 돌아갈 곳. 같은 origin 경로여야 하고, 이 화면 자신이면 돌아갈 곳이 아니다. */
export function parseEmailLinkReturnTo(value: string | null | undefined): string | null {
  const path = sanitizeRedirectPath(value);
  if (!path) return null;
  const { pathname } = new URL(path, 'https://teameet.internal');
  return pathname === EMAIL_LINK_PATH || pathname.startsWith(`${EMAIL_LINK_PATH}/`) ? null : path;
}

/** 이메일 연결 화면 경로. 돌아갈 곳이 있으면 `?redirect=` 로 싣는다(이메일 같은 값은 주소에 싣지 않는다). */
export function emailLinkPath(returnTo?: string | null): string {
  const target = parseEmailLinkReturnTo(returnTo);
  return target ? `${EMAIL_LINK_PATH}?redirect=${encodeURIComponent(target)}` : EMAIL_LINK_PATH;
}

const LINK_RESULT_QUERY = 'linkResult';
const LINK_PROVIDER_QUERY = 'provider';

/**
 * 연결 시도의 결과. 화면 사이를 주소로 넘기므로 값 집합이 곧 계약이다.
 * linked 새로 연결 · merged 만들다 만 가입 계정을 정리하고 옮김 · already 이미 연결돼 있었음 ·
 * in_use 다른 팀밋 계정이 쓰는 중 · exists 이 계정에 같은 제공자의 다른 계정이 있음 ·
 * recent_login 다시 로그인해야 함 · mismatch 안내받은 계정과 다른 계정으로 로그인함 ·
 * expired 로그인하기 전에 연결 시간이 지남(서버 응답이 아니라 보관해 둔 토큰의 만료로 정해진다) · failed 그 밖의 실패.
 */
export const LINK_RESULTS = ['linked', 'merged', 'already', 'in_use', 'exists', 'recent_login', 'mismatch', 'expired', 'failed'] as const;
export type LinkResult = (typeof LINK_RESULTS)[number];

export type LinkOutcome = { linkResult: LinkResult; provider: V1LinkableProvider };

export function linkResultFromSuccess(result: Pick<V1LinkSocialResult, 'alreadyLinked' | 'mergedPendingAccount'>): LinkResult {
  if (result.alreadyLinked) return 'already';
  return result.mergedPendingAccount ? 'merged' : 'linked';
}

/** 오류 코드로만 가른다. 가입 이어가기(SIGNUP_INCOMPLETE)처럼 다른 길이 있는 오류는 호출부가 먼저 처리하고, 남는 것이 failed 다. */
export function linkResultFromError(error: unknown): LinkResult {
  if (!(error instanceof V1ApiError)) return 'failed';
  if (error.statusCode === 409 && error.code === 'SOCIAL_LINK_PROVIDER_IN_USE') return 'in_use';
  if (error.statusCode === 409 && error.code === 'SOCIAL_LINK_PROVIDER_EXISTS') return 'exists';
  if (error.statusCode === 409 && error.code === 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH') return 'mismatch';
  if (error.statusCode === 403 && error.code === RECENT_LOGIN_REQUIRED_CODE) return 'recent_login';
  return 'failed';
}

/**
 * 결과를 붙인 이동 경로. `returnTo` 가 같은 origin 경로가 아니면 로그인 방법 화면으로 간다.
 * `returnTo` 에 이미 있는 다른 쿼리와 해시는 그대로 두고, 이전 결과 쿼리는 새 값으로 바꾼다.
 */
export function buildLinkResultPath(outcome: LinkOutcome, returnTo?: string | null): string {
  const base = sanitizeRedirectPath(returnTo) ?? LOGIN_METHODS_PATH;
  const url = new URL(base, 'https://teameet.internal');
  url.searchParams.set(LINK_RESULT_QUERY, outcome.linkResult);
  url.searchParams.set(LINK_PROVIDER_QUERY, outcome.provider);
  return `${url.pathname}${url.search}${url.hash}`;
}

function isLinkResult(value: string | null): value is LinkResult {
  return LINK_RESULTS.some((result) => result === value);
}

/** 주소에서 결과를 읽는다. 둘 중 하나라도 계약 밖의 값이면 null — 결과 안내를 보여 주지 않는다. */
export function readLinkResultQuery(params: { get(name: string): string | null }): LinkOutcome | null {
  const linkResult = params.get(LINK_RESULT_QUERY);
  const provider = params.get(LINK_PROVIDER_QUERY);
  if (!isLinkResult(linkResult)) return null;
  if (provider !== 'kakao' && provider !== 'apple') return null;
  return { linkResult, provider };
}

/** 결과 안내를 보여 준 뒤 주소에서 결과 쿼리만 지운 경로(다른 쿼리는 남긴다). */
export function withoutLinkResultQuery(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  rest.delete(LINK_RESULT_QUERY);
  rest.delete(LINK_PROVIDER_QUERY);
  const search = rest.toString();
  return search ? `${pathname}?${search}` : pathname;
}
