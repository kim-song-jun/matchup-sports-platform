# 115 - V1 Member Removal Confirmation And History Retention

## Scope

- Frontend: `apps/v1_web`
- Backend regression coverage: `apps/v1_api`
- Docs: `docs/api/v1/domains/teams.md`

## Objective

Require an explicit typed confirmation before an owner or manager removes a user from `/teams/:teamId/members`, while retaining the inactive membership and team-owned user history.

## Acceptance Criteria

- [x] Selecting a member's `내보내기` action opens the removal confirmation modal.
- [x] The modal immediately shows an input requesting the exact phrase `확인했습니다`.
- [x] The final `내보내기` button is disabled for empty, incorrect, or whitespace-padded input.
- [x] The remove mutation runs only after the exact phrase is entered and the final button is clicked.
- [x] Other existing confirmation dialogs remain usable without a typed phrase.
- [x] Membership removal updates the existing row to `removed` with `leftAt` and `removedByUserId`; it does not hard-delete the history row.

## Out Of Scope

- Tournament roster CSV export confirmation.
- Adding a new self-service team-leave endpoint.
- Changing whole-team deletion or account-withdrawal retention policy.

## Progress Snapshot

- [x] Corrected the target from tournament CSV export to team member removal.
- [x] Added optional typed-phrase support to the shared confirmation modal.
- [x] Applied the phrase only to the team member removal action.
- [x] Added exact-match and backward-compatibility component tests.
- [x] Complete targeted tests, runtime visual QA, and diff verification.

## Validation Evidence

- PASS: `pnpm --filter v1_web exec vitest run src/components/v1-ui/confirm-modal.test.tsx` — 2/2.
- PASS: `pnpm --filter v1_api exec jest teams.service.spec.ts --runInBand` — 55/55.
- PASS: `pnpm --filter v1_web build`.
- PASS: Playwright on `/v1/teams/00000000-0000-4000-8000-000000000101/members` as `owner@teameet.v1`.
  - Desktop 1440x900, tablet 768x1024, mobile 390x844.
  - Input visible, incorrect phrase blocked, exact phrase enabled the final action.
  - Cancelled without mutation; remove request count 0 in all viewports.
  - Console errors 0, page errors 0.
- Screenshots: `output/playwright/visual-audit/task-115-member-removal-confirmation-{desktop,tablet,mobile}.png`.
- The originally reported team `555e94ec-bb5f-4eef-bbf3-8925a7b920e6` currently has only its owner in local data, so the existing multi-member seed team was used for the non-mutating removal-modal check.
