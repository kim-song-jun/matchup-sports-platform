# TEAM Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `TEAM-001` 팀 목록 기본 렌더
- `TEAM-002` 팀 검색
- `TEAM-003` 팀 필터
- `TEAM-004` 팀 상세 guest/auth
- `TEAM-005` 팀 생성 happy path
- `TEAM-006` 팀 생성 validation
- `TEAM-007` 팀 수정 happy path
- `TEAM-008` 팀 수정 권한
- `TEAM-009` 가입 자격 조회
- `TEAM-010` 팀 가입 신청
- `TEAM-011` 가입 신청 철회
- `TEAM-012` 가입 신청 목록
- `TEAM-013` 가입 승인
- `TEAM-014` 가입 거절
- `TEAM-015` 멤버 목록
- `TEAM-016` 역할 변경
- `TEAM-017` 멤버 제거
- `TEAM-018` self leave
- `TEAM-019` 내 팀 role view
- `TEAM-020` 팀 기반 연결

Out of scope:

- `AUTH-*`
- `TOURN-*` administrator state transitions
- `MY-*` account settings and reviews
- `CHAT-*` room internals
- `NOTI-*`
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/teams/**`
- `apps/v1_web/src/app/my/teams/**`
- `apps/v1_web/src/components/teams/**`
- `apps/v1_web/src/components/my/my-member-card.tsx`
- `apps/v1_api/src/teams/**`

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [ ] Mobile `390x844` route/action check
- [ ] Desktop `1440x900` route/action check
- [ ] Permission and role-gated CTA check
- [ ] Happy path mutation check
- [ ] Negative path and duplicate action check
- [ ] Reload persistence check
- [ ] Result recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- teams.controller.spec.ts`
- `pnpm --filter v1_web test -- src/components/teams`
- `pnpm exec playwright test e2e/tests/team-owner-flow.spec.ts e2e/tests/team-manager-membership.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
- `pnpm exec playwright test e2e/tests/teams.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line`

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| TEAM-001 | Not run | Not run | Pending | - | - |
| TEAM-002 | Not run | Not run | Pending | - | - |
| TEAM-003 | Not run | Not run | Pending | - | - |
| TEAM-004 | Not run | Not run | Pending | - | - |
| TEAM-005 | Not run | Not run | Pending | - | - |
| TEAM-006 | Not run | Not run | Pending | - | - |
| TEAM-007 | Not run | Not run | Pending | - | - |
| TEAM-008 | Not run | Not run | Pending | - | - |
| TEAM-009 | Not run | Not run | Pending | - | - |
| TEAM-010 | Not run | Not run | Pending | - | - |
| TEAM-011 | Not run | Not run | Pending | - | - |
| TEAM-012 | Not run | Not run | Pending | - | - |
| TEAM-013 | Not run | Not run | Pending | - | - |
| TEAM-014 | Not run | Not run | Pending | - | - |
| TEAM-015 | Not run | Not run | Pending | - | - |
| TEAM-016 | Not run | Not run | Pending | - | - |
| TEAM-017 | Not run | Not run | Pending | - | - |
| TEAM-018 | Not run | Not run | Pending | - | - |
| TEAM-019 | Not run | Not run | Pending | - | - |
| TEAM-020 | Not run | Not run | Pending | - | - |

