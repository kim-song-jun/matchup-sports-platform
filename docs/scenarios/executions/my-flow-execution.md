# MY Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `MY-001` 마이 홈
- `MY-002` 프로필 편집
- `MY-003` public profile
- `MY-004` 내 생성 매치
- `MY-005` 내 참가 매치
- `MY-006` 내 팀 목록
- `MY-007` 내 팀 상세
- `MY-008` 내 리뷰 작성
- `MY-009` 내가 쓴/받은 리뷰
- `MY-010` 설정 홈
- `MY-011` 종목 설정
- `MY-012` 지역 설정
- `MY-013` 알림 설정
- `MY-014` 법적/탈퇴

Out of scope:

- `AUTH-*` implementation
- `TEAM-*` membership service implementation
- `TOURN-*` registration service implementation
- `CHAT-*`
- `NOTI-*` producer implementation
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/my/**`
- `apps/v1_web/src/components/my/**`
- `apps/v1_web/src/components/reviews/**`
- `apps/v1_api/src/profile/**`
- `apps/v1_api/src/reviews/**`
- `apps/v1_api/src/notifications/**` only for preferences read/write checks

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [ ] Mobile `390x844` route/action check
- [ ] Desktop `1440x900` route/action check
- [ ] Auth wall and account ownership check
- [ ] Save/update mutation check
- [ ] Reflected state from team/match/tournament domains check
- [ ] Reload/session persistence check
- [ ] Result recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- profile.controller.spec.ts reviews.controller.spec.ts notifications.controller.spec.ts`
- `pnpm --filter v1_web test -- src/components/my src/components/reviews`
- `pnpm exec playwright test e2e/tests/admin-dashboard.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| MY-001 | Not run | Not run | Pending | - | - |
| MY-002 | Not run | Not run | Pending | - | - |
| MY-003 | Not run | Not run | Pending | - | - |
| MY-004 | Not run | Not run | Pending | - | - |
| MY-005 | Not run | Not run | Pending | - | - |
| MY-006 | Not run | Not run | Pending | - | - |
| MY-007 | Not run | Not run | Pending | - | - |
| MY-008 | Not run | Not run | Pending | - | - |
| MY-009 | Not run | Not run | Pending | - | - |
| MY-010 | Not run | Not run | Pending | - | - |
| MY-011 | Not run | Not run | Pending | - | - |
| MY-012 | Not run | Not run | Pending | - | - |
| MY-013 | Not run | Not run | Pending | - | - |
| MY-014 | Not run | Not run | Pending | - | - |

