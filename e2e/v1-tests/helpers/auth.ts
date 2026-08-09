import type { Page } from '@playwright/test';

/**
 * v1 dev-auth: 개발 Web은 localStorage `teameet.v1.userEmail`(+옵션 userId)을 읽어
 * x-v1-user-email / x-v1-user-id 헤더로 전송한다. QA Web은 production build라 클라이언트가
 * dev header를 만들지 않으므로 Playwright context에도 같은 header를 직접 설정한다.
 * 백엔드 V1AuthGuard는 userId 우선, 없으면 email로 seed 유저를 resolve한다.
 *
 * addInitScript는 모든 네비게이션 직전에 실행되므로 페이지 로드 전에 인증이 보장된다.
 *
 * 헤더 dev-auth는 REST 호출에는 충분하지만(프론트가 매 요청마다 axios 인터셉터로 헤더를 다시
 * 실어 보냄), `/game-operations` Socket.IO 핸드셰이크를 하네스가 직접 열 때는 이 헤더를
 * 프론트가 대신 실어주지 않는다 — 그래서 아래에서 실제 서명된 세션 쿠키도 함께 심는다.
 * `POST /auth/dev-session`(apps/v1_api/src/auth/auth.controller.ts)은 이미 헤더로 인증된
 * 호출자를 `login()`과 동일한 `V1SessionCookieInterceptor` 경로로 통과시켜 real
 * `teameet_v1_session` 쿠키를 발급한다 — 새 신뢰 경계가 아니라 기존 `V1AuthGuard` 신뢰를
 * 쿠키로 "업그레이드"할 뿐이며, 프로덕션에서는 그 guard 자체가 헤더 신원을 거부하므로
 * 이 라우트도 프로덕션에서 아무 권한도 추가로 열어주지 않는다.
 *
 * `page.request`는 페이지의 BrowserContext와 쿠키 저장소를 공유하므로, 이 POST 응답의
 * Set-Cookie가 별도 조작 없이 바로 context 쿠키로 심긴다. 네트워크 문제 등으로 실패해도
 * best-effort로 무시한다 — 이 쿠키를 쓰지 않는 기존 REST 전용 스펙은 헤더 dev-auth만으로
 * 계속 동작해야 하므로(다른 스펙 100개가 의존), 이 호출의 실패가 그 스펙들을 깨서는 안 된다.
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

  try {
    await page.request.post('/api/v1/auth/dev-session', {
      headers: { 'x-v1-user-email': email },
    });
  } catch {
    /* WS takeover 검증이 필요 없는 스펙에서는 이 실패가 무해하다 — 헤더 dev-auth로 계속 진행 */
  }
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
