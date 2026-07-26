# Auth And Session Scenarios

## Scenario Checklist

- [x] AUTH-001 로그인 후 세션 유지와 새 탭 공유
- [x] AUTH-002 비로그인 사용자의 보호 액션 차단
- [x] AUTH-003 관리자 페이지 권한 가드
- [x] AUTH-004 이메일·소셜 신규 가입 필수 프로필 계약
- [x] AUTH-005 소셜 가입 필수 단계 온보딩 mutation 차단

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

## AUTH-004 이메일·소셜 신규 가입 필수 프로필 계약

### Contract

- [x] 이메일과 소셜 가입 모두 공백이 아닌 이름, 숫자 11자리 휴대폰, 실제 달력 날짜인 `YYYYMMDD` 생년월일, `male | female` 성별을 요구한다.
- [x] API는 이름을 trim한 뒤 `display_name`, 휴대폰을 `v1_users.phone`, 생년월일과 성별을 profile row에 정확히 저장한다.
- [x] 프로필 이미지는 선택이며 이메일 가입에서는 계정/session 생성 뒤 업로드 URL만 저장한다. local `data:` preview를 저장하지 않는다.
- [x] 기존 nullable row는 보존하고 신규 가입 경계만 강제하므로 이 계약 자체에는 migration/backfill이 없다.
- [x] Web은 문자 혼입 또는 overlength 휴대폰/생년월일을 잘라서 유효한 payload로 바꾸지 않고 invalid raw 입력을 그대로 차단한다.
- [x] 소셜 약관·프로필 완료는 API `next.route`를 따르며 hard-coded success fallback을 사용하지 않는다.

### Evidence

- [x] API DTO/AuthService 55/55, Web shared/email/social/terms 28/28, MSW register boundary 14/14 focused verification을 통과했다.
- [x] `/signup` required-field 화면은 390×844, 768×1024, 1440×900에서 overflow/CTA overlap 없이 확인했다.
- [x] overlength raw 입력 유지·차단은 email/social 각각 390×844과 768×1024에서 확인했다.
- [x] Lazyweb report: https://www.lazyweb.com/report/lazyweb/d886f37f-7131-46a9-8b29-899aa288c1a4/?source=create

## AUTH-005 소셜 가입 필수 단계 온보딩 mutation 차단

### Contract

- [x] `social_terms_required` 사용자의 preferences/complete/defer는 write/transaction 전에 `409 ONBOARDING_STEP_REQUIRED`와 `details.requiredRoute=/terms?mode=social`로 거절된다.
- [x] `social_profile_required` 사용자의 같은 세 mutation은 write/transaction 전에 `409 ONBOARDING_STEP_REQUIRED`와 `details.requiredRoute=/signup/social`로 거절된다.
- [x] 다른 onboarding status의 기존 mutation 동작은 유지된다.

### Evidence

- [x] 두 상태 × 세 mutation, no-write assertion, 일반 상태 회귀를 포함한 focused onboarding service 14/14가 통과했다.

## Notes

- 실제 자동화 시 `loginViaApi`, `injectTokens`, `setupAuthState`를 재사용한다.
- 2026-04-07: `e2e/tests/auth-session-matrix.spec.ts`가 `Desktop Chrome 7/7`, `Mobile Chrome 7/7`로 통과했다.
- 2026-07-14~15: AUTH-004/005는 현재 v1 API/Web focused tests와 live signup viewport evidence로 추가 검증했다. 전체 저장소 typecheck/test/build는 사용자 결정에 따라 최종 통합 게이트에서 한 번 실행한다.
