# Task 20261022: Player record empty-kind copy

Status: Review — canonical regression in progress; Git publication and alpha validation pending
**Owner**: delegated bug-fix session
**Created**: 2026-10-05 KST
**Issue**: https://github.com/kim-song-jun/matchup-sports-platform/issues/1436
**Branch**: fix/issue-1436-record-empty-kind-copy

## Context
PR #1465 already separated missing results from records hidden by public eligibility. Its per-kind explanation still says a goals/assists record exists when the public array is empty. Current V1 `LeagueMatchPublicService.playerRecords` exposes one aggregate hiddenByEligibility flag: private goals-only and assists-only inputs can produce identical public bodies. The client cannot infer which empty kind has a private record.

## Goal
Explain the existing public eligibility policy without asserting an unobservable record kind, while retaining public rows and actual no-result/loading/error behavior.

## Original Conditions (must all be satisfied)
- [x] Hidden records and real zero results retain different titles and descriptions.
- [x] No kind-specific private-record existence claim is derived from the aggregate flag.
- [x] Public consent, identity eligibility, official result and score contracts are unchanged.
- [ ] Actual alpha acceptance and original issue evidence are recorded after separately approved deployment; keep Refs #1436 and the issue open.

## User Scenarios
- Read actual league standings and awards when only public goals or only public assists exist and some private record is hidden.
- Read both-empty hidden, both-empty real zero, loading and failed/stale-data query states; invoke existing retry and schedule/navigation action.
- Preserve tournament combined-empty behavior and all public player rows.

## Test Scenarios
- Actual service/eligibility loader with synthetic Prisma boundary inputs: hidden goals-only/assists-only produce indistinguishable public bodies. No DB, HTTP or protected QA data writes.
- Canonical actual standings/awards tests use captured synthetic service bodies. Literal expected copy, public rows, existing awards link, combined section/schedule action and loading/error/retry boundaries are asserted.
- Existing helper and tournament shared sections regressions. No product helper is used as the expectation oracle.
- Changed dependency-graph typecheck and repository cheap aggregate/diff/debt checks once. Local tests do not replace exact committed-head CI or alpha visual acceptance.

## Parallel Work Breakdown
- Frontend implementation and tests are serial. Read-only helper investigates the unrelated schedule filter; it has no owned paths here.
- Owned: `apps/v1_web/src/lib/player-record-empty-copy.ts` and its test; `apps/v1_web/src/app/league-matches/[leagueId]/player-record-empty-kind.test.tsx` and synthetic `.fixtures.json`; this task; `.changeset/player-record-empty-kind-copy.md`.
- Forbidden: API/DTO/schema, eligibility/consent gates, player/team data, scores, QA179 and completed official QA results, global history code and other sessions' files.

## Acceptance Criteria
- [x] Canonical RED → GREEN on actual consumers is recorded.
- [x] Public goals/assists rows and no-hidden descriptions remain correct.
- [x] Combined-empty, loading/error/retry, awards link and tournament regressions pass.
- [x] Changed graph typecheck and diff scope checks pass.
- [ ] Exact pathspec commit/push, Ready/dev PR and exact-head CI are verified.
- [ ] Actual alpha before/after, mobile/tablet/desktop copy/wrapping, console/network and full flow verified.

## Tech Debt Resolved
Keep per-kind copy in the existing shared helper; document aggregate eligibility semantics rather than inventing fields or inferring hidden-kind information.

## Security Notes
No eligibility bypass, disclosure of private player rows, score/consent/permission mutation, live HTTP/DB call, secrets or .env reads. All new fixtures are synthetic. No merge, deployment or paid review request.

## Risks & Dependencies
- Independent worktree base is `56581dc7b9e08c95dbcf763bffa09434ba4cfd8b`. Current dev `f614096872ccb5953722a33dc326e3fb8af246c1` adds six disjoint PR #1607 paths; target helper/service/view source is unchanged. Branch synchronization remains pending.
- Selected execution policy makes `.git` read-only; the previous narrow commit escalation was rejected. No retry or bypass. Permitted source edits/tests continue.
- No actual one-kind alpha before or after is available. Existing original #1436 evidence and both-hidden observations do not prove one-kind visual acceptance. Actual after waits for separately approved deployment.
- Retry uses a query mock plus rerender; schedule scroll uses a DOM spy. These do not prove HTTP recovery, pixel scroll restoration or real browser navigation.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-05 KST | bug-fix session | Can aggregate hiddenByEligibility identify hidden goals vs assists? | No: actual service outputs for opposite private kinds are identical. Use neutral policy copy; preserve API/DTO and eligibility gates. |
| 2026-10-05 KST | bug-fix session | Does combined empty copy also assert an unknown kind? | It addresses both arrays and aggregate hidden records, so retain it unchanged. |

## Progress Snapshot
- Original PR #1465 is historical and merged; #1436 remains open. Original official QA results are read-only.
- Actual service read-only probe: 5 mixed cases and 2 both-empty cases passed; two opposite-private-kind response pairs are identical. Captured fixtures contain only public synthetic user rows.
- [x] Canonical test execution results, checks, artifacts and exact remaining blockers appended below.

### Canonical validation — 2026-10-05 00:21–00:28 KST
- Original actual consumers/helper RED: 9FAIL/13PASS across consumer 15 + helper 7. Failures expose unsupported per-kind existence claims in mixed standings, awards and exact neutral-copy assertions.
- Canonical GREEN with one worker: actual standings/awards 15PASS, helper 7PASS, existing shared tournament sections 8PASS =30PASS in one serial invocation. Covers public rows, opposite private-kind equivalent bodies, no-hidden, combined-empty, actual records placeholders, stale-data error/retry callback+rerender, awards link and schedule callback/history invariance.
- Changed-source dependency graph typecheck, both canonical frontend pattern checks, six static aggregate gates and exact-path Changeset checks PASS. Full app lint/build/DB integration/e2e/actual HTTP recovery were not run; committed-head CI remains pending.
- Independent read-only review: 6/6 owned candidates reviewed, no new Critical/P1/P2 or mandatory fix; no independent test rerun. Touched paths have no TODO/FIXME/HACK/XXX markers.
- Captured synthetic fixtures equal the read-only actual-service probe outputs. Original service consent/identity query gates and source are unchanged. Combined-empty explanation and titles remain unchanged.
- Git publication remains blocked by selected policy, not by missing user authorization. No denied Git write is retried or bypassed. Real one-kind alpha before/after and original issue acceptance remain pending; preserve Refs #1436.
