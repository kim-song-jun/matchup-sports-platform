export const OPEN_IN_APP_DISMISSED_KEY = 'teameet:v1:open-in-app:dismissed';
export const OPEN_IN_APP_DELAY_MS = 1500;

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

// iPadOS 는 데스크톱 UA 를 보내므로 iPad 는 자연스레 제외된다.
export function isIosMobileUserAgent(userAgent: string): boolean {
  return /iPhone|iPod/.test(userAgent);
}

export function isExcludedOpenInAppPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
