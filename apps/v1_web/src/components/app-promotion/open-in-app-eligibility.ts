// 가입·인증·계정 흐름과 운영 화면은 방해하지 않는다. 인증 프레임(.tm-auth-frame)은 뷰포트 높이로
// 고정돼 있어, 셸이 없는 화면에서 그 앞에 배너를 흘리면 하단 CTA 가 접힌 아래로 밀려난다.
const EXCLUDED_PATH_PREFIXES = [
  '/admin',
  '/admin-content-preview',
  '/tournament-ops',
  '/callback',
  '/auth',
  '/login',
  '/signup',
  '/onboarding',
  '/terms',
  '/account-deletion',
  '/my/settings/login-methods/email',
] as const;

export function isExcludedOpenInAppPath(pathname: string | null): boolean {
  if (!pathname) return false;
  // 루트는 로그인 상태를 확인하는 동안 인증 프레임을 그리는 진입 화면이다.
  if (pathname === '/') return true;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
