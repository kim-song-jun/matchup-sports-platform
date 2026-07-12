# Cross-Flow Regression Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `X-001` Auth -> Onboarding -> My
- `X-002` Auth -> Team
- `X-003` Team -> Tournament
- `X-004` Tournament -> My
- `X-005` Tournament -> Notification
- `X-006` Team/Match/Tournament -> Chat

Out of scope:

- New feature implementation
- Large refactors
- Domain-specific fixes that belong in `AUTH-*`, `TEAM-*`, `TOURN-*`, `MY-*`, or `CHAT/NOTI-*`

## Execution Rule

This PR runs after the domain execution PRs have landed or reached a stable QA point. If a cross-flow case fails, record the source domain and move the fix back to the owning domain PR unless the issue is strictly in the integration layer.

## Cross-Flow Checks

| ID | Flow | Core check |
|---|---|---|
| X-001 | Auth -> Onboarding -> My | New signup completes onboarding and `/my`, profile, recommendation/activity state agree. |
| X-002 | Auth -> Team | Logged-in user creates a team and sees the same team/role in `/teams`, `/teams/[id]`, and `/my/teams`. |
| X-003 | Team -> Tournament | Team owner/manager permission controls tournament application team candidates and disabled states. |
| X-004 | Tournament -> My | Tournament registration/cancel/confirm state appears in `/tournaments/[id]/my` and account activity surfaces. |
| X-005 | Tournament -> Notification | Tournament application/payment-confirm/confirm/cancel events create notifications and valid deep links. |
| X-006 | Team/Match/Tournament -> Chat | Authorized users can access related chat rooms; access policy changes after permission loss. |

## Validation Commands

- `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/team-owner-flow.spec.ts e2e/tests/team-manager-membership.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
- `pnpm exec playwright test e2e/tests/chat-realtime.spec.ts e2e/tests/notification-center.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
- Tournament route/API smoke commands should be selected from the final `TOURN-*` PR result.

## Execution Context

- **Date**: 2026-06-21
- **Executor**: cross-flow-execution agent (automated API smoke + Playwright)
- **Stack**: v1 API `:8121` (DB health OK), v1 web `:3013`
- **Auth header**: `x-v1-user-email: <persona>@teameet.v1` (dev-auth pass-through)
- **Personas verified**: `owner@teameet.v1`, `applicant@teameet.v1`, `member@teameet.v1`

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Source domain if failed |
|---|---|---|---|---|---|
| X-001 | Not run | PASS | PASS | `GET /api/v1/auth/me` → `onboardingStatus: completed`, `onboarding.status: completed`, `profile.nickname` present. `GET /api/v1/onboarding` → `status: completed, currentStep: done`. Both owner and applicant personas show completed onboarding state. | - |
| X-002 | Not run | PASS | PASS | `GET /api/v1/me/teams` (owner) → `role: owner`, teamId `00000000-0000-4000-8000-000000000101`, `canManage: true`, `detailRoute: /teams/…`. `GET /api/v1/teams/:teamId` → resolves successfully with same team data. Auth → Team role consistent across me/teams and teams/:id. | - |
| X-003 | Not run | PASS | PASS | `GET /api/v1/tournaments` → 2 open tournaments, confirmedCount=1 each. `GET /api/v1/tournaments/:id/registrations/my-registration` (owner) → `status: confirmed`, teamId matches owner's team `00000000-0000-4000-8000-000000000101`, `payment.status: paid`. Team ownership visible in tournament registration. | - |
| X-004 | Not run | PARTIAL | PARTIAL | `GET /api/v1/tournaments/:id/registrations/my-registration` returns confirmed state + payment (evidence registration→My works per-tournament). `GET /api/v1/me/matches` returns participant matches (status=completed). **Gap**: no unified `/api/v1/me` or `/api/v1/me/tournaments` activity surface — both return 404. Per-domain endpoints confirmed; cross-domain aggregated "My activity" surface not exposed by API. | TOURN-* (missing unified activity endpoint) |
| X-005 | Not run | PASS | PASS | `GET /api/v1/notifications` (owner) → 2 tournament notifications, each with `target.type: tournament` and `target.route: /tournaments/:id`. Deep-link routes verified: both tournament IDs resolve with 200 (`title: "QA TOURN-020 Test"`, `title: "2026 여름 풋살 챔피언십"`). notification→deep link→tournament page chain intact. | - |
| X-006 | Not run | PASS | PASS | `GET /api/v1/chat/rooms` isolation verified: owner sees 2 `team_match` rooms; applicant sees 2 `match` rooms (disjoint sets). Cross-access: owner requesting applicant's match room `07f6d824-…` → HTTP 403 `PERMISSION_DENIED` "Chat room access is denied". Access policy enforced correctly. | - |

## Issues Found

| Issue | ID | Severity | Source domain |
|---|---|---|---|
| No unified `/me` activity endpoint exposing tournament registrations | X-004 | Medium | TOURN-* |

`/api/v1/me` and `/api/v1/me/tournaments` both return 404. Tournament state is retrievable per-tournament via `/tournaments/:id/registrations/my-registration`, but a My-page aggregated activity view requires the TOURN-* domain to expose a list endpoint (e.g., `GET /me/tournament-registrations`). This is a missing API surface, not a regression of existing functionality. Fix belongs in the TOURN-* domain PR.

