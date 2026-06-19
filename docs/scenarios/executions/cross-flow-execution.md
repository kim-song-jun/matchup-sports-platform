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

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Source domain if failed |
|---|---|---|---|---|---|
| X-001 | Not run | Not run | Pending | - | - |
| X-002 | Not run | Not run | Pending | - | - |
| X-003 | Not run | Not run | Pending | - | - |
| X-004 | Not run | Not run | Pending | - | - |
| X-005 | Not run | Not run | Pending | - | - |
| X-006 | Not run | Not run | Pending | - | - |

