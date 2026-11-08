import { V1ApiError } from './api-client';
import {
  LAST_LOGIN_METHOD_CODE,
  LOGIN_METHOD_NOT_FOUND_CODE,
  SOCIAL_LINK_ADMIN_FORBIDDEN_CODE,
} from './auth-error-codes';
import { RECENT_LOGIN_REQUIRED_CODE } from './auth-link-errors';
import type { V1UnlinkableProvider } from '@/types/api';

/**
 * 로그인 수단을 떼려던 시도의 결과. 이 화면 안에서만 쓰여 주소로 오가지 않는다(연결 결과 `LinkResult` 와 다르다).
 * unlinked 뗐음 · recent_login 다시 로그인해야 함 · last 마지막 남은 수단 · not_found 이미 떼어져 있음 ·
 * admin 운영자 계정이라 못 뗌 · failed 그 밖의 실패.
 */
export type UnlinkResult = 'unlinked' | 'recent_login' | 'last' | 'not_found' | 'admin' | 'failed';

export type UnlinkOutcome = { unlinkResult: UnlinkResult; provider: V1UnlinkableProvider };

/**
 * 상태 코드와 오류 코드가 둘 다 맞을 때만 가른다. 가입 이어가기(SIGNUP_INCOMPLETE)처럼 다른 길이 있는 오류는
 * 호출부가 먼저 처리하고, 남는 것이 failed 다.
 */
export function unlinkResultFromError(error: unknown): Exclude<UnlinkResult, 'unlinked'> {
  if (!(error instanceof V1ApiError)) return 'failed';
  if (error.statusCode === 403 && error.code === RECENT_LOGIN_REQUIRED_CODE) return 'recent_login';
  if (error.statusCode === 403 && error.code === SOCIAL_LINK_ADMIN_FORBIDDEN_CODE) return 'admin';
  if (error.statusCode === 409 && error.code === LAST_LOGIN_METHOD_CODE) return 'last';
  if (error.statusCode === 404 && error.code === LOGIN_METHOD_NOT_FOUND_CODE) return 'not_found';
  return 'failed';
}
