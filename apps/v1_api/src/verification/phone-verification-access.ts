/** 미인증 계정이 강제로 보내지는 인증 화면. 403 응답의 next.route 로 프론트에 전달된다. */
export const PHONE_VERIFICATION_ROUTE = '/my/phone-verify';

/**
 * 휴대폰 인증 강제 여부의 단일 판정.
 *
 * register 게이트(PhoneVerificationService.enabled), 프로필 번호 변경 게이트(ProfileService),
 * 전역 쓰기 게이트(V1AuthGuard)가 모두 같은 판정을 써야 한다 — 한쪽만 env 를 다시 읽으면
 * "가입은 막는데 번호 변경은 통과" 같은 반쪽 강제가 생기고, 그게 실제로 인증 우회 경로였다.
 *
 * 인증은 핵심 anti-abuse 통제이므로 **fail-closed** — 기본적으로 항상 필수다. SMS 시크릿 누락
 * 같은 설정 실수가 인증을 조용히 선택사항으로 만들지 못하도록, 비활성화는 명시적
 * 환경변수(V1_PHONE_VERIFICATION_DISABLED=true)로만 허용한다(비상용 opt-out).
 */
export function isPhoneVerificationEnforced(): boolean {
  return process.env.V1_PHONE_VERIFICATION_DISABLED !== 'true';
}

/** 조회는 미인증 계정에도 열어 둔다 — 차단 대상은 쓰기(신청·생성·참가·전송)뿐이다. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 미인증 계정에도 열어 두는 쓰기 경로.
 * - /verification : 본인인증 자체. 막으면 인증을 끝낼 방법이 사라져 계정이 영구히 잠긴다.
 * - /auth         : 로그인·로그아웃·소셜 가입 완료. 가입 도중 잠기지 않게 한다.
 * - /admin        : 운영 콘솔. 운영자 계정이 미인증이면 장애 대응 자체가 막힌다.
 * - /terms/consents : 약관 재동의. 앞선 약관 게이트와 서로를 막는 교착을 방지한다.
 * - /me/withdrawal-request : 탈퇴. 인증을 거부하는 사용자에게 남겨야 하는 이탈 경로.
 */
const ALLOWED_WRITE_PREFIXES = ['/verification', '/auth', '/admin'];
const ALLOWED_WRITE_PATHS = ['/terms/consents', '/me/withdrawal-request'];

/**
 * 이 요청이 휴대폰 미인증 상태에서도 허용되는가.
 * method 가 비어 있으면 안전한 조회로 단정하지 않고 쓰기로 취급한다(fail-closed).
 */
export function isPhoneVerificationRequestAllowed(
  method: string | undefined,
  requestUrl: string,
): boolean {
  if (method && SAFE_METHODS.has(method.toUpperCase())) return true;

  const path = normalizeRoutePath(requestUrl);
  if (ALLOWED_WRITE_PATHS.includes(path)) return true;
  return ALLOWED_WRITE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** `/api/v1/foo/?x=1` → `/foo`. 글로벌 프리픽스가 붙은 originalUrl 과 라우트 경로를 같은 축으로 맞춘다. */
function normalizeRoutePath(requestUrl: string): string {
  const pathname = requestUrl.split('?')[0] ?? '/';
  const withoutPrefix = pathname.replace(/^\/api\/v\d+/, '/');
  const trimmed = withoutPrefix.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
