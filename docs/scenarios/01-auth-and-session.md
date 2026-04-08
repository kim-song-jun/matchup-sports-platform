# Auth And Session Scenarios

## Scenario Checklist

- [x] AUTH-001 로그인 후 세션 유지와 새 탭 공유
- [x] AUTH-002 비로그인 사용자의 보호 액션 차단
- [x] AUTH-003 관리자 페이지 권한 가드

## AUTH-001 로그인 후 세션 유지와 새 탭 공유

### Preconditions

- [x] 비로그인 상태에서 시작한다.
- [x] `시나로E2E` 계정이 dev-login 또는 UI 로그인으로 진입 가능하다.

### Steps

- [x] `/login`에 진입한다.
- [x] `시나로E2E`로 로그인한다.
- [x] `/home` 진입을 확인한다.
- [x] 현재 탭을 새로고침한다.
- [x] 같은 컨텍스트에서 새 탭을 열고 `/profile`에 진입한다.

### Expected

- [x] 홈 진입 후 메인 콘텐츠가 렌더링된다.
- [x] 새로고침 후 로그인 상태가 유지된다.
- [x] 새 탭에서도 재로그인 없이 보호 페이지가 열린다.
- [x] 빈 화면, 무한 로딩, 로그인 루프가 없다.

### Multi-Context Check

- [x] 같은 사용자 새 탭에서 storage state가 공유된다.

### Persistence Check

- [x] 브라우저 새로고침 후 세션이 유지된다.

## AUTH-002 비로그인 사용자의 보호 액션 차단

### Coverage

- [x] 팀 상세 연락하기
- [x] 용병 지원
- [x] 채팅 진입
- [x] 알림 페이지
- [x] 프로필 페이지

### Steps

- [x] 비로그인 상태로 각 진입점을 연다.
- [x] 각 CTA 또는 링크를 누른다.

### Expected

- [x] 로그인 유도 또는 로그인 페이지 리다이렉트가 일관된다.
- [x] 판정 기준은 `redirect(/login)` 또는 canonical auth wall(`data-testid="auth-wall"`, `data-testid="auth-wall-login-link"`) 중 하나로 통일한다.
- [x] `alert()` 같은 임시 브라우저 피드백이 없다.
- [x] 보호 액션이 조용히 성공하지 않는다.

## AUTH-003 관리자 페이지 권한 가드

### Preconditions

- [x] `시나로E2E`와 `관리자E2E` 두 계정을 사용할 수 있다.

### Steps

- [x] 일반 사용자로 `/admin/dashboard` 진입을 시도한다.
- [x] 관리자 사용자로 `/admin/dashboard` 진입을 시도한다.
- [x] `/admin/users`, `/admin/payments`, `/admin/disputes`도 같은 방식으로 확인한다.

### Expected

- [x] 일반 사용자는 접근 거부 또는 안전한 리다이렉트를 받는다.
- [x] 관리자는 각 관리자 화면을 정상 렌더링한다.
- [x] UI 차단과 서버 권한 차단이 동시에 맞아야 한다.

## Notes

- 실제 자동화 시 `loginViaApi`, `injectTokens`, `setupAuthState`를 재사용한다.
- 2026-04-07: `e2e/tests/auth-session-matrix.spec.ts`가 `Desktop Chrome 7/7`, `Mobile Chrome 7/7`로 통과했다.
