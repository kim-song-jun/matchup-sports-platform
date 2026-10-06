# 2026-10-05 dev → main production promotion

## Request and scope

User requested deploying current dev through main. Scope: release preparation and verification, then the repository's human-operated main PR/production environment gate. Preserve the original Windows/WSL working tree and its CRLF-only changes. No new application feature or alpha QA data mutation.

## Progress Snapshot

- Current production: commit `2f2645ee0b807cd4cba148685c57781a7ef66fee`, public release1.1.5, DB health=true.
- Initial dev: `9ac4bdf0070e7b6b1d0005936a21464ec3ebc998`; source versions1.1.4, alpha prerelease1.2.0.
- main-only2 commits are prior promotion merge commits, not separate source changes (`git diff origin/dev...origin/main` empty). Initial dev-only58 commits, promotion diff179 files before versioning. No independent main patch needs absorption.
- CLAUDE.md lines46–52 require the user to create/merge the final dev→main PR. No agent main push/merge/PR creation performed.
- Executed canonical `promote-main.yml`, refdev, confirmationPROMOTE. Workflow #37218484638 SUCCESS; consumed22 Changesets and advanced both app versions to1.2.0.
- Release candidate: `ccabd36e859f2058d2c08bf6f2655de0bc02c775`, release-only commit26 paths (Changeset consumption + manifests/CHANGELOG). Promotion version/consumption gate PASS.
- Candidate CI #37218536976 SUCCESS (Gates/API/Web); Alpha #37218538626 SUCCESS. Final production promotion not yet performed; do not claim the new release live on production.
- Previous production Deploy #37137176076 SUCCESS. Its actual Deploy log states prod ledger M11 already applied, checksum `08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323`. Task168 Stage A/B rerun is not needed for this ordinary promotion. Never infer this from old NO-GO documents or CI replay tests.

## Acceptance and remaining actions

- [x] Inspect live prod identity, DB health, dev/main divergence and prior deploy evidence.
- [x] Canonical version preparation and promotion gate.
- [x] Candidate CI PASS and exact-SHA alpha SUCCESS/health/version verification.
- [x] Prepare reviewed dev→main PR creation link and current release evidence.
- [ ] User creates/merges main PR and completes production environment approval.
- [ ] Validate actual production release SHA/version/health after deployment.

## User-operated production steps

- GitHub production environment read confirms required_reviewers with2 configured reviewers and prevent_self_review=false. An agent does not bypass this gate.
- Final main PR is created and merged by the user under CLAUDE.md. PR CI must pass before merge. Normal main push deployment is appropriate: previous production Deploy log proves M11 is already applied; the generic promotion workflow's Stage A/B instructions are conditional historical guidance, not a reason to repeat the destructive transition.
- Alpha-only practice tournament snapshot before release-candidate deployment: confirmed12 teams, players60, groups0/fixtures0. Compare roster/registration identity after deployment without rewriting any operator input.

## Final verified candidate (awaiting user main PR)

- Actual alpha: `1.2.1-alpha.20261004.gccabd36e859f`, exact commit `ccabd36e859f2058d2c08bf6f2655de0bc02c775`, health DB=true. Brief503 during server switching resolved before verification.
- The source manifests are1.2.0; the existing version resolver intentionally defaults to a patch increment with zero pending Changesets. Recomputed from a detached **exact candidate tree**, not the old feature worktree: changesets0, stableVersion1.2.1, prereleaseVersion matches actual alpha. Expected ordinary production artifact version1.2.1.
- Actual redeploy seed log: manualRound12.created=false/preserved=true. Public before/after registrations, team IDs and all60 roster-player IDs/nicknames/jerseys equal. Confirmed12 teams/players60/groups0/fixtures0 preserved.
- Final main read: still `2f2645ee0b807cd4cba148685c57781a7ef66fee`, public production1.1.5. Open main PRs0. No agent main mutation or production deployment approval.
- User creation link: https://github.com/kim-song-jun/matchup-sports-platform/compare/main...dev?expand=1
- Full prepared PR title/body URL and body saved locally outside runtime under `/tmp/teameet-production-pr-link.txt` and `/tmp/teameet-production-pr-body.md`; body states actual CI/alpha evidence and ordinary post-M11 deployment path.
- After user PR creation: PR CI must pass, user merges it, and configured production reviewer approves the Deploy job. Then verify the new production commit/version/health; these steps remain open rather than claiming production deployment complete.

## Owned / forbidden

Owned: this task/status record, GitHub canonical promotion workflow dispatch and read-only runtime checks. Forbidden: original shared-tree edits, agent main push/merge/PR creation, production DB reset/seeding, new cloud resources, credentials in output.

## Latest explicit deployment instruction

- User repeated `main에 배포해줘` after the manual main handoff. This supersedes the ordinary user-operated main restriction for this specific promotion: agent creates/merges the verified dev→main PR and approves the ordinary production deployment as the configured reviewer, without bypassing environment protection.
- Created main promotion PR #1609, head `ccabd36e859f2058d2c08bf6f2655de0bc02c775`. PR CI #37220585729 is running. Copilot review requested; no review submitted yet.
- Current GitHub actor is a configured production reviewer. Normal environment approval is available; no protection bypass is needed.

## PR validation and actual approval blocker

- PR #1609 CI #37220585729: Gates/API/Web PASS; all three CodeQL analysis jobs PASS, but aggregate CodeQL check flags high alerts49–51.
- Alert49 source traced: draft.gender is public match eligibility genderRule, not an individual profile gender; runtime expiring-draft callers are match/team-match creation drafts only.
- Alerts50/51 source traced: prefix matching only collects HTTP response errors in read-only capture diagnostics; it does not grant trust, authorize a navigation/request, or send credentials.
- Automatic approval review rejected PATCH dismissing these three alerts: deployment authorization did not include suppressing high security alerts. No dismissal performed and no main merge performed. Explicit user approval requested with evidence and suppression impact.
- Copilot requested but no actual Copilot submitted review yet; do not claim clean.

## Security approval resolved

- User explicitly approved recording evidence and dismissing CodeQL alerts49–51. All three now dismissed as false positive; diagnostic threads replied and resolved. CodeQL aggregate now PASS; PR MERGEABLE/CLEAN, all CI PASS, unresolved0.
- Copilot requested >12min ago but no Copilot review submitted. Latest user question requests a PR1609-specific clean-review exception before merge; still pending, not implicitly approved.

## User chose waiting for review

- User explicitly chose waiting for Copilot rather than a PR1609 review exception. Main merge/deployment remains unperformed. Re-requested Copilot after initial >12min absence; GitHub accepted the request, but reviewRequests is still empty and no Copilot review exists. Only actual submitted review can satisfy the gate.

## Review findings validated and fixed before promotion

- Human review on exact PR1609 head raised3 P2 findings. Independently validated all3. Created isolated dev-based `fix/production-bracket-review` worktree; original shared tree untouched.
- Source/target UUID locking replaced by validated phase-direction source Games → target Game; cross-phase invalid sources rejected before locks. Existing result path already follows that direction, so no new result-command lock or broad serialization is introduced.
- Incoming-slot assignment guard moved into `updateTournamentMatchInTx`, after Game/Details/TeamMatch locking and latest detail read. DTO types now include the null already accepted by IsOptional and frontend.
- Shared persisted source-name helper used by connected cards and third-place cards, including both LOSER slots.
- Related tables/models: V1Game, V1TournamentMatchDetails, V1TeamMatch, V1TournamentMatchAdvancementEdge. No schema change or migration required. No production DB mutation.
- Validation: unit70/70; bracket render9/9; existing round12 DB contracts2/2; new real PostgreSQL interleaving2/2 PASS on fix.
- RED evidence on exact old cca source with the same new tests: actual PostgreSQL40P01 deadlock in reverse UUID case; stale-null request succeeds incorrectly; third-place LOSER labels absent. All3 regressions detected. Raw logs outside repo `/tmp/production-bracket-red-api.log`, `/tmp/production-bracket-red-web.log`.
- User explicitly chose waiting for Copilot. No review exception granted for PR1609 or follow-up fixes, no main merge, production still1.1.5.

## Committed-tree CI follow-up

- Fix PR #1610, initial head3044fe180. CI #37222439717 Gates/Web PASS, API DB replay/integration PASS, API unit had7 failures in league-fixture-generator.service.spec.ts only: its fake transaction omitted the advancement-edge delegate newly read by the shared assignment guard. Added explicit empty-edge fixture data to that existing league mock, without a runtime fallback or weakened assertions. Reran affected generator/shared-helper specs.
- Both package typechecks PASS. Owned test PostgreSQL stopped after verification; no local Next/browser process created for this follow-up. Copilot still not submitted on either PR.

## PR1610 dev follow-up — 2026-10-06

- Latest user authorization: for PRs authored by accounts other than `kim-song-jun`, perform the minimum needed fixes, conflict resolution, normal branch push, direct rereview and eligible dev merge. Self-authored PR fixes remain the author's responsibility. This permission does not authorize main promotion.
- Original PR head: `ed9aaa543bdbaea12e26d410d235b17174d1e12e`; author `seeungmin`. Current dev: `a29f080a53689b0e53c502ff2a26dd463f7909b5`.
- Owned: isolated PR1610 worktree; its bracket/roster locking, direct regression tests, conflict resolutions preserving latest dev behavior, this progress record, related API contract and existing Changeset. Forbidden: main/prod operations, shared WIP changes, force-push, reset/stash, unrelated refactors.
- Phase 1 — complete: all five conflicts resolved preserving phase-directed PATCH/result locks, latest-assignment guard, latest dev bye/fixture-number behavior and third-place source labels. Real PostgreSQL result-roster worker/PATCH overlap reproduced `40P01` with the production handler and bracket service.
- Phase 2 — complete: shared Game lock extracted with blocking mode retained for the generator; roster writes use NOWAIT and translate only PostgreSQL55P03 to explicit409. Worker retry retains existing outbox retry/poison visibility. Current-phase mapping reused before/after locks. Narrow checks passed: API unit161/161; actual concurrency integration3/3; round12/quarter integration3/3; bracket rendering12/12. Both package typechecks/pattern gates passed. Full CI remains the new-head merge gate.
- Phase 3 — in progress: normal push to existing PR, Korean formal review pinned to new head, current-head CI/Copilot clean and unresolved-thread verification, dev merge.
- Phase 4 — pending: local dev FF sync, matching alpha deployment/serving SHA, authenticated 390/768/1440 bracket QA and same-PR gallery.
- Test infrastructure: own PostgreSQL container `codex-pr1610-pg`, local port55461, isolated template `ulw_v1_integration_pr1610_base`. Windows checkout CRLF caused the immutable policy-content hash replay guard to fail; a fresh template replay with LF source SQL succeeded. This is local file normalization, not a migration/schema change. Only this owned container is eligible for cleanup.
- Codemap: `lockGameRows` has two direct consumers: roster write scope and league fixture generator (existing import preserved by re-export). Roster scope is shared by worker and manual adjustment writes. Verification covers real worker/PATCH rollback+retry, actual result/PATCH interleaving, stale-null winner protection, generator/shared-update unit contracts and bracket renderer bye/LOSER labels.
- Local Jest wrapper reuses the canonical integration project and changes only its test glob to avoid Windows escaping the `.codex` worktree path. RED log: `C:\Users\kinso\.codex\automations\dev-pr-5\qa\pr1610\red-worker-patch.log`.
