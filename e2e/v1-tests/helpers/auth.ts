import type { Page } from '@playwright/test';

/**
 * v1 dev-auth: 개발 Web은 localStorage `teameet.v1.userEmail`(+옵션 userId)을 읽어
 * x-v1-user-email / x-v1-user-id 헤더로 전송한다. QA Web은 production build라 클라이언트가
 * dev header를 만들지 않으므로 Playwright context에도 같은 header를 직접 설정한다.
 * 백엔드 V1AuthGuard는 userId 우선, 없으면 email로 seed 유저를 resolve한다.
 *
 * addInitScript는 모든 네비게이션 직전에 실행되므로 페이지 로드 전에 인증이 보장된다.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({
    'x-v1-user-email': email,
  });
  await page.addInitScript((userEmail) => {
    try {
      window.localStorage.setItem('teameet.v1.userEmail', userEmail);
      window.localStorage.removeItem('teameet.v1.userId');
    } catch {
      /* storage 접근 불가 환경 무시 */
    }
  }, email);
}

/**
 * 로그아웃 상태(신규 방문자 플로우용) — v1 인증 키 제거.
 * addInitScript는 매 navigation 직전 실행되므로 가드 없이 제거하면
 * 가입 성공 후 앱이 저장한 세션을 다음 라우트에서 다시 지워 버린다(Copilot #1).
 * sessionStorage sentinel로 최초 1회만 제거 → 이후 앱이 세션을 저장하면 보존된다.
 */
export async function logout(page: Page): Promise<void> {
  await page.context().setExtraHTTPHeaders({});
  await page.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem('__e2e_logged_out__')) return;
      window.localStorage.removeItem('teameet.v1.userEmail');
      window.localStorage.removeItem('teameet.v1.userId');
      window.sessionStorage.removeItem('teameet.v1.signupTermsAccepted');
      window.sessionStorage.setItem('__e2e_logged_out__', '1');
    } catch {
      /* noop */
    }
  });
}
