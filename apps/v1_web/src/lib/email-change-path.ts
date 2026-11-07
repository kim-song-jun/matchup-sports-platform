import { sanitizeRedirectPath } from './session-storage';

/** 프로필 수정 화면. 이메일 변경은 여기서 시작해서 여기로 돌아온다. */
export const PROFILE_EDIT_PATH = '/my/profile/edit';

/** 새 이메일을 인증하고 바꾸는 단계 화면. */
export const EMAIL_CHANGE_PATH = `${PROFILE_EDIT_PATH}/email`;

/**
 * 이메일 변경을 마치거나 그만두고 돌아갈 곳. 같은 origin 의 프로필 수정 경로(그 화면의 `?from=` 같은 쿼리 포함)만 허용하고,
 * 그 밖의 값은 기본 프로필 수정 화면이다 — 이 화면의 "프로필로 돌아가기"가 다른 곳으로 가지 않는다.
 */
export function parseEmailChangeReturnTo(value: string | null | undefined): string {
  const path = sanitizeRedirectPath(value);
  if (!path) return PROFILE_EDIT_PATH;
  const { pathname } = new URL(path, 'https://teameet.internal');
  return pathname === PROFILE_EDIT_PATH ? path : PROFILE_EDIT_PATH;
}

/** 이메일 변경 화면 경로. 돌아갈 프로필 수정 화면이 기본이 아니면 `?redirect=` 로 싣는다(새 이메일 같은 값은 주소에 싣지 않는다). */
export function emailChangePath(returnTo?: string | null): string {
  const target = parseEmailChangeReturnTo(returnTo);
  return target === PROFILE_EDIT_PATH ? EMAIL_CHANGE_PATH : `${EMAIL_CHANGE_PATH}?redirect=${encodeURIComponent(target)}`;
}
