import { sanitizeRedirectPath } from '@/lib/session-storage';

/** 로그인한 사용자의 이메일 인증 화면 경로. */
export const EMAIL_VERIFY_PATH = '/my/email-verify';

/** 인증을 마치면 돌아갈 곳이 없을 때의 도착지. */
const DEFAULT_RETURN_PATH = '/my';

/** 인증 화면으로 보내는 링크. 마치면 돌아올 경로를 쿼리 `redirect` 로 싣는다. */
export function buildEmailVerifyHref(redirectTo?: string | null): string {
  if (!redirectTo || redirectTo === EMAIL_VERIFY_PATH) return EMAIL_VERIFY_PATH;
  return `${EMAIL_VERIFY_PATH}?redirect=${encodeURIComponent(redirectTo)}`;
}

/** 쿼리의 `redirect` 를 같은 origin 의 상대 경로일 때만 믿고, 아니면 마이 탭으로 돌린다. */
export function readEmailVerifyReturnPath(searchParams: { get(name: string): string | null }): string {
  return sanitizeRedirectPath(searchParams.get('redirect')) ?? DEFAULT_RETURN_PATH;
}
