import type { Page } from '@playwright/test';

/**
 * v1 dev-auth: 프론트 api-client가 localStorage `teameet.v1.userEmail`(+옵션 userId)을 읽어
 * x-v1-user-email / x-v1-user-id 헤더로 전송. 백엔드 V1AuthGuard가 userId 우선, 없으면 email로
 * 유저를 resolve(apps/v1_api/src/auth/v1-auth.guard.ts). email만 주입하면 해당 seed 유저로 로그인.
 *
 * addInitScript는 모든 네비게이션 직전에 실행되므로 페이지 로드 전에 인증이 보장된다.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.addInitScript((userEmail) => {
    try {
      window.localStorage.setItem('teameet.v1.userEmail', userEmail);
      window.localStorage.removeItem('teameet.v1.userId');
    } catch {
      /* storage 접근 불가 환경 무시 */
    }
  }, email);
}

/** 로그아웃 상태(신규 방문자 플로우용) — v1 인증 키 제거. */
export async function logout(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('teameet.v1.userEmail');
      window.localStorage.removeItem('teameet.v1.userId');
    } catch {
      /* noop */
    }
  });
}
