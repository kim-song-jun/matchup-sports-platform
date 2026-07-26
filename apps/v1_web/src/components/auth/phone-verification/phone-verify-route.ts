/** 휴대폰 본인인증 화면 경로. 서버 403 의 next.route 와 같은 값이어야 한다. */
export const PHONE_VERIFY_PATH = '/my/phone-verify';

/**
 * 인증 화면으로 보내는 링크. 인증을 마치면 원래 있던 자리로 돌아오도록 redirect 를 싣는다.
 * 진입점이 홈 배너·마이페이지·차단 모달·대회 신청으로 흩어져 있어서, 쿼리 조립을 각자
 * 하면 어느 한 곳만 redirect 를 빠뜨려 인증 후 홈으로 튕기는 차이가 생긴다.
 */
export function buildPhoneVerifyHref(redirectTo?: string | null): string {
  if (!redirectTo || redirectTo === PHONE_VERIFY_PATH) return PHONE_VERIFY_PATH;
  return `${PHONE_VERIFY_PATH}?redirect=${encodeURIComponent(redirectTo)}`;
}
