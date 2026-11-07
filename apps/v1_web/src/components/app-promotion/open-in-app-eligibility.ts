// 가입·인증 흐름과 운영 화면은 방해하지 않는다.
const EXCLUDED_PATH_PREFIXES = [
  '/admin',
  '/admin-content-preview',
  '/tournament-ops',
  '/callback',
  '/auth',
  '/login',
  '/signup',
  '/onboarding',
] as const;

export function isExcludedOpenInAppPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
