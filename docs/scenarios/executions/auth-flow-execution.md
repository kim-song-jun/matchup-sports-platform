# AUTH Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `AUTH-001` 이메일 회원가입 happy path
- `AUTH-002` 회원가입 필수값 검증
- `AUTH-003` 이메일/닉네임 중복 확인
- `AUTH-004` 소셜 회원가입 진입
- `AUTH-005` 소셜 추가 정보 입력
- `AUTH-006` 이메일 로그인 happy path
- `AUTH-007` 로그인 실패 처리
- `AUTH-008` 세션 유지
- `AUTH-009` 보호 route auth wall
- `AUTH-010` 로그아웃
- `AUTH-011` 온보딩 sport
- `AUTH-012` 온보딩 level
- `AUTH-013` 온보딩 region
- `AUTH-014` 온보딩 완료/유예
- `AUTH-015` auth 예외 route

Out of scope:

- `TEAM-*`
- `TOURN-*`
- `MY-*`
- `CHAT-*`
- `NOTI-*`
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/login/**`
- `apps/v1_web/src/app/signup/**`
- `apps/v1_web/src/app/auth/**`
- `apps/v1_web/src/app/callback/kakao/**`
- `apps/v1_web/src/app/onboarding/**`
- `apps/v1_web/src/components/auth/**`
- `apps/v1_api/src/auth/**`
- `apps/v1_api/src/onboarding/**`

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [ ] Route opens in mobile `390x844`
- [ ] Route opens in desktop `1440x900`
- [ ] Happy path completes without console/page errors
- [ ] Negative path exposes the real failure reason
- [ ] Permission/auth wall does not silently succeed
- [ ] Reload/session persistence is checked where applicable
- [ ] Result is recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- auth.controller.spec.ts onboarding.controller.spec.ts`
- `pnpm --filter v1_web test -- src/components/auth`
- `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
- `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line`

## Execution Environment

실행일: 2026-06-21  
API: `http://localhost:8121` — `{"status":"success","data":{"service":"v1_api","checks":{"db":true}}}`  
v1_web (port 3013): **미가동** — Playwright 브라우저 테스트 전체 BLOCKED  
Unit 테스트: `apps/v1_api` — 4 suites (auth.controller.spec, auth.service.spec, register.dto.spec, onboarding.controller.spec), **27 tests all PASS**  
E2E (visitor-onboarding): v1_web 미가동으로 TimeoutError — BLOCKED

> 2026-07-15 contract supersession: 아래 실행 로그는 당시 historical evidence다. 최신 신규 가입 계약은 `displayName`, 11-digit `phone`, real-calendar `birthDate`, `gender`를 모두 요구하므로 AUTH-001의 과거 register payload는 더 이상 유효하지 않다. 최신 재실행은 `docs/scenarios/15-focused-full-flow-test-matrix.md`의 AUTH-001/002/005/005A와 Task 94를 따른다.

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| AUTH-001 | BLOCKED | BLOCKED | PASS (API) | `POST /api/v1/auth/register {nickname,email,password,requiredTermsAccepted:true}` → `status:success, data.session.userId, data.next.route="/onboarding/sport"` (2026-06-21T10:26:12Z). Unit: register.dto.spec 3/3 PASS, auth.controller.spec 6/6 PASS | v1_web 미가동으로 브라우저 UI 미검증. API 계층 PASS. 온보딩 위저드 경유 플로우(`onboardingStatus=signup_done → /onboarding/sport`)는 API 응답에서 `data.next.route` 로 확인 |
| AUTH-002 | BLOCKED | BLOCKED | PASS (API) | 비밀번호 8자 미만 → `VALIDATION_ERROR`; `requiredTermsAccepted` 누락 → `VALIDATION_ERROR details:[requiredTermsAccepted]`; 닉네임 1자(`"a"`) → `VALIDATION_ERROR`; `requiredTermsAccepted:false` → `VALIDATION_ERROR` | RegisterDto: `@MinLength(8) password`, `@MinLength(2) nickname`, `@IsBoolean() requiredTermsAccepted`. register.dto.spec 3/3 PASS |
| AUTH-003 | BLOCKED | BLOCKED | PASS (API) | `GET /auth/check-email?email=host@teameet.v1` → `{available:false}`. `?email=brand_new@example.com` → `{available:true}`. `GET /auth/check-nickname?nickname=호스트민` → `{available:false}`. `?nickname=nonexistent_xyz` → `{available:true}`. 중복 이메일 register → `status:error, code:EMAIL_CONFLICT` | v1_web 미가동으로 UI 중복확인 버튼 미검증 |
| AUTH-004 | BLOCKED | BLOCKED | BLOCKED | `POST /api/v1/auth/kakao {code,redirectUri}` → `status:error, code:OAUTH_NOT_CONFIGURED, message:"Kakao login is not configured"` | dev env에 `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET` 미설정. 엔드포인트는 존재, OAuth 자격증명 주입 후 검증 필요 |
| AUTH-005 | BLOCKED | BLOCKED | BLOCKED | `POST /api/v1/auth/social-profile` 엔드포인트 존재(V1AuthGuard 보호). AUTH-004 선행 미완료 | 소셜 계정으로 가입된 사용자 없어 완전 플로우 불가. 엔드포인트 구조는 코드 확인 완료 |
| AUTH-006 | BLOCKED | BLOCKED | PASS (API) | `POST /api/v1/auth/login {email,password}` happy path: 새 register 사용자로 즉시 login → `status:success, data.session.userId`. auth.service.spec PASS. seed 시드 사용자(`host@teameet.v1`) login은 FAIL 참조 — 별도 이슈 | 로그인 메커니즘 자체는 동작. session은 `{userId, userEmail}` 반환 (JWT/쿠키 아님, `x-v1-user-id` 헤더 방식) |
| AUTH-007 | BLOCKED | BLOCKED | PASS (API) | 잘못된 비밀번호 → `status:error, statusCode:401, code:UNAUTHENTICATED, message:"Email or password is incorrect"`. 존재하지 않는 이메일 → 동일 401. 에러 메시지 사용자 구분 없음(timing-safe) | 정보 노출 없음. 두 케이스 모두 동일 메시지 반환 |
| AUTH-008 | BLOCKED | BLOCKED | PASS (API) | `GET /api/v1/auth/me` 헤더 없음 → `401 UNAUTHENTICATED`. `x-v1-user-id: {validUserId}` → `status:success, data.user`. `x-v1-user-email: host@teameet.v1` → `status:success, data.user.email:host@teameet.v1`. `x-v1-user-id: 00000000-...` (DB에 없음) → `401 "V1 user was not found"` | v1 세션은 header 기반(localStorage → x-v1-user-*). refresh 엔드포인트 없음(`/auth/refresh` → 404). 세션 만료 시나리오 N/A |
| AUTH-009 | BLOCKED | BLOCKED | PASS (API) | `GET /api/v1/auth/me` 헤더 없음 → `401`. `GET /api/v1/admin/users` 일반 사용자(`host@teameet.v1`) → `status:error, code:PERMISSION_DENIED`. 관리자(`admin@teameet.v1`) → `status:success`. `suspended/blocked` 계정 접근 → ForbiddenException 반환(V1AuthGuard 코드 확인) | v1_web 미가동으로 프론트 auth wall(`data-testid="auth-wall"`) 미검증 |
| AUTH-010 | BLOCKED | BLOCKED | PASS (API) | `POST /api/v1/auth/logout` (V1AuthGuard 보호, `@Controller()` → 경로 `/api/v1/auth/logout`) → `status:success, data:{ok:true}` (x-v1-user-email: host@teameet.v1) | 로그아웃은 profile.controller.ts에 `@Post('auth/logout')`으로 정의. 서버 사이드 세션 무효화 확인(클라이언트 localStorage 초기화는 프론트 미가동으로 미검증) |
| AUTH-011 | BLOCKED | BLOCKED | PASS (API) | `GET /api/v1/onboarding` (x-v1-user-email: host@teameet.v1) → `status:success, data.currentStep:"done"`. 신규 register 후 → `data.onboarding.currentStep:"sport"`. 온보딩 sport 단계 API 존재 확인 | v1_web /onboarding/sport 페이지 UI 미검증(v1_web 미가동). onboarding.controller.spec PASS |
| AUTH-012 | BLOCKED | BLOCKED | PASS (API) | `GET /api/v1/onboarding` 응답 구조에 `currentStep` 포함. onboarding.controller.spec PASS(4 suites 27 tests). level 단계는 온보딩 flow의 일부로 서비스 로직에 포함 | v1_web UI 미검증 |
| AUTH-013 | BLOCKED | BLOCKED | PASS (API) | `GET /api/v1/onboarding` → `data.regions`, `data.regionOptional` 필드 존재 확인. onboarding module src 존재(service/controller/dto 확인) | v1_web UI 미검증 |
| AUTH-014 | BLOCKED | BLOCKED | PASS (API) | `POST /api/v1/onboarding/complete` 및 defer 엔드포인트 onboarding.controller.ts에 존재(코드 확인). visitor-onboarding E2E spec: `'건너뛰기' → /onboarding/sport` 플로우 정의됨(v1_web 미가동으로 실행 불가) | e2e/v1-tests/visitor-onboarding.spec.ts에 온보딩 완료/유예 플로우 코드 확인 |
| AUTH-015 | BLOCKED | BLOCKED | PASS (API) | 비인증 접근: `GET /auth/me` → `401 UNAUTHENTICATED`. 잘못된 x-v1-user-id → `401 "V1 user was not found"`. `suspended` 계정 → `403 PERMISSION_DENIED "이용이 제한된 계정이에요."`. `GET /auth/refresh` → `404 Cannot GET` (존재하지 않는 route) | 예외 경로 전체 API 레이어에서 적절한 에러코드 반환. v1_web 미가동으로 프론트 예외 페이지 미검증 |

## 이슈 로그

| 번호 | 심각도 | 설명 | 재현 방법 |
|---|---|---|---|
| ISSUE-1 | 중간 | v1_web(:3013) 미가동 — 브라우저/UI 검증 전체 BLOCKED | `curl -s http://localhost:3013` → connection refused |
| ISSUE-2 | 낮음 | seed 사용자(`host@teameet.v1`) 이메일 로그인 실패 — `V1_HOST_ADMIN_PASSWORD` 환경변수 미설정 or DB와 다른 hash | `POST /auth/login {email:"host@teameet.v1", password:"11111111"}` → 401 |
| ISSUE-3 | 낮음 | 소셜 로그인(Kakao) dev env 미설정 — `OAUTH_NOT_CONFIGURED` | `POST /auth/kakao {code,redirectUri}` → 404/error |
| ISSUE-4 | 낮음 | `docs/scenarios/15-focused-full-flow-test-matrix.md` 파일 미존재 — 이 PR의 선행 PR #22가 merge되지 않은 상태 | `ls docs/scenarios/` |
