# Task 20261018: dev CI source binding and chat entitlement regressions

Status: Review
Owner: Codex bugfix session
Created: 2026-10-03
Tracking issue: #1594

## Context

[dev CI 37139330249](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37139330249/job/111251236429) on 63781330e39bef1076db791ee0108716c5dcf999 failed with 2 suites / 5 cases: one stale game-schema source pin and four platform-chat fixture setup failures. PR #1593 changes only six web paths and does not cause either API failure. After author 238cf0bacbc3a5d63825391d9304da866871fdf7 corrected the required fixture fields, [CI 37139789944](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37139789944/job/111252975214) on fe957840053be5a24adfb1599384220d407395bf passed the platform-chat integration; only the source pin remained (1 failed suite/test, 119 passed suites / 832 passed tests / 3 skipped).

Author 24f66e5b44a4028e4da40faaea95b46ec488864e subsequently corrected that same source pin. This branch preserves both authors' fixes. A registered chat unit also fails on the unchanged current helper because it still expects status/approvedApplicantTeamId directly under teamMatch.is, while the actual query has separate normal/platform OR branches. Integration failure previously prevents CI from reaching the later API unit step.

## Goal

Restore the chat unit to the actual normal/platform query contracts and add DB-free source-integrity regression coverage. Preserve strict verification and current runtime permissions; do not duplicate existing fixes.

## Original Conditions (must all be satisfied)

- [x] Read actual CI failures, current v1 code and ancestry; separate image/chat causes from PR #1593.
- [x] Preserve fixture correction 238cf0bac and pin correction 24f66e5b4; no duplicate open repair PR found.
- [x] Reproduce the actual registered chat unit (1 FAIL / 7 PASS) and validate the corrected queries (10/10 PASS).
- [x] Source binding RED 3 FAIL / 2 PASS before the pin correction; GREEN 5/5 including strict tampering and repeated CRLF coverage.
- [x] Scoped typecheck, API surface, six aggregate guardrails, changeset policy and read-only peer review pass.
- [ ] Explicit three-path commit, Ready base-dev PR and exact-head CI terminal result.
- [x] No actual DB/server/migration/merge/deploy or shared-client modifications. Parent tracks dev CI and alpha.

## User Scenarios

CI must reject unreviewed schema or historical migration bytes. Equivalent CRLF copies must pass. Ordinary team-match chat remains limited to confirmed teams in matched/completed; platform recruitment can open earlier with current creator-admin or assigned-team-manager entitlement.

## Test Scenarios

- Source verifier uses the real manifest and copied committed schema/migration, not mocked digests. Mutated schema and migration fail with their exact source kinds; CRLF normalization does not hide mutations.
- The real currentChatEntitlementWhere query retains exactly two normal/platform branches, common deletedAt=null, normal non-null team IDs and active owner/manager membership.
- Platform list and recipient queries require an active, non-revoked owner/ops creator with an active user account, or active assigned-team owner/manager. A null HOME ID is excluded from recipient team IDs.
- Existing personal match, team, contact and unknown-target units remain intact. Original PostgreSQL integration tests remain unchanged; local SQL permission or notification delivery is not claimed.

## Parallel Work Breakdown

Root owns exactly:

- apps/v1_api/src/chat/chat-entitlement.spec.ts
- apps/v1_api/src/games/game-schema-source-snapshot.spec.ts
- .github/tasks/20261018-game-schema-source-binding.md

Read-only peer reviewed these 3/3 paths and the related helper; actionable findings 0, independent executions/edits/DB/remote writes 0. The initial source-test CRLF materialization finding was corrected before final review. Forbidden paths/actions include fixture edits already fixed by others, schema/migrations, runtime services/DTO/permissions, release exception 2cd74043a, historical release pins, other worktrees and actual data.

## Acceptance Criteria

- General query still requires both assigned teams, matched/completed and active owner/manager. Platform query supports recruiting/closed/matched/completed with current creator-admin or assigned-team-manager entitlement.
- Schema difference from correctly pinned 8ec820cbb37f6d438cf1d8ca354cc9ad44675e8d is exactly nullable V1TeamMatch.listImageUrl, backed by commit 55171ad3c3784291a994b44a7dcbf85fec7ca22f and migration 20261003001000_v1_team_match_list_image. Removing that one line makes schema bytes identical; V1Game and its bound migration are unchanged.
- Current normalized schema SHA256 is 614e05114ddd39e059fc778b078c70a4d71d160c0af4b1a31c18df76d1cdc733; historical migration remains 6bd7fae42e9ee7debff71d26f7252d220ad2c12ae6f14745d103fc7fa61e8f64. The pin itself is supplied by author 24f66e5b4 and is not changed in this PR.
- No weakened CHECK, source verifier, skipped tests or runtime authorization/leave-policy changes. Exact PR head Gates/API/Web CI is recorded separately.

## Tech Debt Resolved

Move source-byte contract coverage into a DB-free registered unit, while retaining integration coverage. Repair the stale chat assertion and verify both normal and platform gates explicitly instead of treating all team matches as the old normal branch.

## Security Notes

No .env reads, credential output, real data or DB/server access. Temporary source copies and a current-schema --no-engine Prisma client are task-owned. The shared generated client and QA179/completed results remain unchanged.

## Risks & Dependencies

The borrowed root Prisma client is stale and blocks default local lint with unrelated missing-model/field errors. An isolated Prisma6.19.2 client, temporary tsconfig and real-Jest-unit adapter allow full API typecheck and actual focused unit execution without changing product/test sources or shared dependencies. This is an environment adapter, not a passing default-local-lint claim. CI generates its own current client. Local source/query units do not prove PostgreSQL catalog, migration replay, SQL authorization, notification delivery or alpha deployment.

2cd74043acd3ab5c57ddf2a939629c776d685810 expands a migration release-policy exception; it is a distinct runtime/release-policy change and is neither modified nor approved here. The historical-creator leave P2 below needs parent policy judgment.

## Ambiguity Log

| Date | Question | Resolution |
|---|---|---|
| 2026-10-03 | Does PR #1593 cause the API failures? | No: image schema 55171ad3c and chat spec c5cadcbcd are independent causes. |
| 2026-10-03 | Should platform-chat CHECK be weakened? | No: author 238cf0bac supplies required placeName/startAt/legacy regionId without changing the hostless contract. |
| 2026-10-03 | Another author fixed the source pin during validation? | Own duplicate pin edit removed before FF to 24f66e5b4; add DB-free regression coverage only. |
| 2026-10-03 | Must a historical creator without current admin authority stay when independently entitled as assigned-team manager? | Unresolved policy: leave403 checks creator ID, while list/recipients allow the independent team-manager entitlement. No runtime relaxation here; report to parent. |

## Progress Snapshot

Worktree /tmp/teameet-ci-source-binding-20261003, branch fix/ci-v1-source-and-chat-regressions, base 24f66e5b44a4028e4da40faaea95b46ec488864e. Actual registered units 15/15 PASS (chat10 + source5), final-schema binder7/7, isolated current-schema full API tsc PASS, API surface601files PASS, six aggregate guardrails PASS and changeset policy PASS. Peer static review3/3 finds no actionable issue; SQL/leave-policy/alpha execution0. Only the three owned paths will be committed. CI and remote PR verification remain pending.
