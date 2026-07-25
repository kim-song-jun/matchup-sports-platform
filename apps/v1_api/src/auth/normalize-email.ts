/**
 * 로그인 이메일의 표준형. 대소문자·앞뒤 공백만 정리한다.
 *
 * 계정 조회(auth.service)와 이메일 소유 증명(email-proof-token)이 반드시 같은 표준형을 써야
 * 한다 — 한쪽만 소문자로 접으면 `A@x.com` 으로 인증하고 `a@x.com` 계정을 못 찾거나, 반대로
 * 증명 토큰이 다른 표기의 이메일에 통하는 어긋남이 생긴다.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
