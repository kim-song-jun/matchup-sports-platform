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

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| AUTH-001 | Not run | Not run | Pending | - | - |
| AUTH-002 | Not run | Not run | Pending | - | - |
| AUTH-003 | Not run | Not run | Pending | - | - |
| AUTH-004 | Not run | Not run | Pending | - | - |
| AUTH-005 | Not run | Not run | Pending | - | - |
| AUTH-006 | Not run | Not run | Pending | - | - |
| AUTH-007 | Not run | Not run | Pending | - | - |
| AUTH-008 | Not run | Not run | Pending | - | - |
| AUTH-009 | Not run | Not run | Pending | - | - |
| AUTH-010 | Not run | Not run | Pending | - | - |
| AUTH-011 | Not run | Not run | Pending | - | - |
| AUTH-012 | Not run | Not run | Pending | - | - |
| AUTH-013 | Not run | Not run | Pending | - | - |
| AUTH-014 | Not run | Not run | Pending | - | - |
| AUTH-015 | Not run | Not run | Pending | - | - |

