# 2026-10-05 dev → main production promotion

Status: Review

## Current preparation refresh — 2026-10-19

This snapshot supersedes the 2026-10-18 approval and release-baseline notes below.

- User requested refreshing main/dev, confirmed preparation PR #1979, then explicitly instructed proceeding with latest-dev conflict resolution and main-to-dev integration.
- Baselines: dev `1f708958c67bb59442215f1aae3137304fd314ed`; main `782e5aa5a8274d34e56c80fd11f47f20314a7fed`; original PR head `b6f4ec03248fadb9bd5fbd22ea434066a3bf45a1`.
- Owned isolated worktree `_worktrees/pr1979-refresh`, branch `fix/pr1979-refresh`; update existing remote `chore/release-version-20261018` by normal fast-forward push. Shared worktrees, main mutation and production approval are excluded.
- Phase 1 complete: merge preparation ancestry into latest dev, restore release inputs from dev 1.9.10 to avoid double versioning, then absorb main ancestry. Twelve main conflicts reviewed: team metadata/tests retain actual local emblems, tournament detail retains current league capacity/navigation, schema bindings retain current schema plus historical hashes, API docs retain current contracts, SEO task retains deployed main evidence already recorded on dev.
- Exact index comparison proves application, deployment, release scripts, API docs and SEO task are byte-identical to latest dev after integration. No new runtime or DB change is introduced by this refresh.
- Phase 2 complete: official Changesets CLI 2.30.0 via prepare-only regenerated both apps from 1.9.10 to 1.10.0, consuming all 28 pending Changesets; production release history preserved. The explicit alpha baseline was origin/dev (runtime-identical to the integration tree). Release promotion gate and diff whitespace PASS.
- Phase 3 in progress: publish the reviewed release-only diff to existing PR #1979; current-head CI/review pending. New dev CI/Alpha must pass after any eventual merge.
- Baseline evidence: current dev Alpha deployment SUCCESS, public HTTP 200, exact commit 1f708958c and DB=true. Source 1.10.0 with zero pending Changesets resolves to a 1.10.1 artifact under the existing resolver.
- Validation scope: final runtime/DB/API documentation trees identical to dev; only release metadata and this task differ. No new UI screenshots or duplicate local full test suites; exact committed-head CI owns tests/typecheck/build. Temporary official jq 1.7.1 binary checksum verified; no global install.
- Final dev-to-main PR creation/merge and production environment approval remain user-operated under CLAUDE.md. No production promotion is performed by this preparation.

## Current preparation — 2026-10-18

The user requests a main-promotion PR. This snapshot supersedes historical release coordinates below.

Update: the user additionally requested inclusion of PR #1978. It passed Gates/API/Web and same-head manual review with no blocking issue/threads, then merged into dev as 3309e7ed80792401bb6968e80a88dc82c38b96f5. This preparation branch includes that exact dev merge. Official Changesets CLI regenerated 1.10.0 from latest dev source 1.9.9 plus all 26 Changesets, including admin-player-realname; it did not double-bump the prepared version. Runtime/API docs match latest dev byte-for-byte. New dev CI 39137871091 and Alpha 39137871074 are pending; previous #1979 CI 39136750796 passed on 6c0528b12, not the refreshed head. main conflict resolution and agent-created main PR still require their previously requested approvals.

- Verified dev/alpha baseline: ef706121bf946c3af230f375c64552a775db296d, dev CI 39132737481 and Alpha 39132737476 SUCCESS; alpha commit header matches and DB health is true. Main baseline: edb7ecd31.
- Official Changesets CLI 2.30.0 via promote-main.sh --prepare-only consumes 26 pending Changesets and raises both fixed app source versions from 1.9.9 to 1.10.0. Both changelogs preserve production history. No dependency, application source, schema or migration change is introduced by this version preparation.
- prepare-only main-promotion gate and git diff --check PASS. The existing resolver uses patch advancement with zero pending Changesets, so the prepared source version 1.10.0 yields a 1.10.1-alpha artifact; this is the existing release contract, not a second source bump.
- Main has 27 commits absent from dev ancestry. A separate isolated integration checkout identified 10 conflict files. Read-only resolution proof confirms that resolving the 9 runtime/API-doc conflicts to the reviewed dev bytes leaves those files exactly identical to verified dev; the remaining task-log conflict must retain both records.
- Automatic approval rejected a batch regex conflict resolution plus immediate commit. No resolution was executed. The user was asked to approve the concrete main-to-dev resolution; that approval remains required before dependent integration work. No workaround or main write is performed.
- Local main/dev WIP and authenticated QA screenshot branches are excluded. Only release manifests/changelogs, consumed Changesets and this status record are owned by the version preparation.

Acceptance criteria:
- [x] Prepare fixed version metadata and consume all current Changesets.
- [x] Verify local release-preparation contract and whitespace.
- [ ] Approved main ancestry integration, preserving reviewed dev runtime and main release history.
- [ ] Preparation PR exact-head CI/review; new dev CI and Alpha after merge.
- [ ] main-promotion PR with current main/dev diff and explicit user-only production merge.


## Final preparation refresh — 2026-10-14

This snapshot supersedes the preparation snapshots below.

- User explicitly approved replacing Copilot review with direct code review and CI for #1911 and #1913 only. No exception is inferred for #1912.
- Latest dev baseline: `5b6ea95b75f1260289f5ebfa58861793a216ae97` (#1922). Main baseline: `3dd537d4eb74a0d2c74f1a28e6da3962611130b9`.
- #1913 refreshed head: `8392402562f856ccdc89fdcd0d1b494546ab09c5`; latest-dev merge preserves its four-file scope. Updated release-state regression PASS, including negative controls. Exact-head CI remains the merge gate.
- Preparation integrates main ancestry and latest dev with no application-source difference against dev. The observed dev/main sitemap conflicts disappear through that ancestry; no sitemap source is reverted.
- Official Changesets CLI 2.30.0 regenerated both app manifests/changelogs from main 1.8.2 and all 43 pending Changesets, including #1913. Both source versions remain 1.9.0; the existing resolver calculates stable artifact 1.9.1 when pending Changesets are zero.
- Order: #1913 exact-head CI and dev merge; #1911 exact-head CI and dev merge; final dev CI/Alpha activation; #1912 promotion gates and user main merge/production approval.
- No shared WIP, production or database mutation. No application UI change introduced by this preparation.

## Current preparation — 2026-10-14

The latest user request is `메인 승격 준비해줘`. Refresh existing preparation PR #1911 and promotion draft #1912 against the latest verified dev. Production merge and approval remain user-operated. This snapshot supersedes the historical release coordinates below.

- Base dev: `ac997f5d3b8702fb8250f588f8cd2e6a1441359b` (#1916); base main: `3dd537d4e` (#1903).
- Main-only SEO source was already present on dev. A clean main-to-feature merge changes only the two manifests and two changelogs, preserving the production 1.8.2 release history and ancestry. No application source, dependencies, migrations, credentials, native versions or shared WIP were changed.
- Official `corepack pnpm dlx @changesets/cli@2.30.0 version` consumes all 35 pending Changesets, including the three introduced by #1914/#1915/#1916. Regenerated the owned release metadata from main's 1.8.2 history plus the complete current Changeset set, preserving source version 1.9.0 instead of double-bumping the previous preparation. Both changelogs retain production 1.8.2. Artifact identities remain determined by the existing release resolver.
- Local preparation policy and main-promotion policy PASS; `git diff --check` PASS. No new debt marker. Existing `COLORXXX500` in an old changelog entry is unchanged.
- Base dev CI `38496329800` and Alpha `38496329788` PASS. Public Alpha API serves exact base `ac997f5d3b8702fb8250f588f8cd2e6a1441359b`, release `1.9.0-alpha.20261014.gac997f5d3b87`, HTTP 200 and DB=true. This proves the base runtime, not the future preparation merge.
- Follow-up #1913 (`635dcea16`) fixes same-SHA Alpha manifest reuse; its Gates/API/Web pass but it is not merged and has no submitted Copilot review. Its patch Changeset is not included in this 35-Changeset preparation. If integrated before promotion, it must also be consumed and the candidate revalidated.
- GitHub CLI help now documents `--add-reviewer @copilot`; requested #1913 using that supported alias as well as the existing documented login. No clean review or exception is inferred from command success or the user's preparation request.
- The prior Copilot waiver applies only to #1908. It does not apply to these new PRs. Review and exact-head CI remain required before merging the preparation PR.
- Preparation scope is release metadata plus this existing status record. No new UI requires a new browser screenshot; the restored league navigation evidence is linked at https://github.com/kim-song-jun/matchup-sports-platform/pull/1908#issuecomment-6151240723.

### Remaining promotion gates

- [x] Preserve main release history and prepare fixed source version 1.9.0 with all 35 current Changesets consumed.
- [x] Verify local release-preparation and promotion contracts and whitespace.
- [ ] Preparation PR exact-head CI and required review.
- [ ] Merge preparation into dev; synchronize local dev and verify actual new dev CI and Alpha activation/headers/health.
- [ ] If concurrent changes add another Changeset, consume it and revalidate the candidate before promotion.
- [ ] Draft dev-to-main PR: exact-head API/Web/Gates/CodeQL, review, unresolved threads and release-policy check.
- [ ] User main merge and production environment approval; production SHA/version/health verification.

### Ownership and cleanup

Owned: isolated `_worktrees/promotion-pr1911-fix`, remote `release/main-promotion-prep-20261014`, release manifests/changelogs/consumed Changesets, this status record and requested PR descriptions. Forbidden: original shared WIP, production deployment and DB mutation. Native pnpm/Changesets was obtained through Corepack; no local Next, browser or database process was started.

## Promotion PR follow-up — 2026-10-14

- Request: inspect preparation #1911 and promotion draft #1912 and resolve blockers. Scope: infra, release contract tests and this existing status record; application source and shared WIP are outside this follow-up.
- #1911 head `5f3d31438f8804af143f797f2f81c9fca709ded5`: Gates/API/Web PASS; no submitted Copilot review at inspection. It consumes 32 Changesets and prepares both fixed packages at source version 1.9.0.
- #1912 Gates fails correctly because dev has unreleased Changesets. API/Web and CodeQL pass. Keep the draft pending preparation consumption, current-head CI and review; no main merge or production approval is authorized.
- Alpha run `38475457320` fails in existing-manifest validation on same-SHA redeploy: resolved previous SHA becomes release SHA while the immutable manifest retains its original rollback predecessor. Actual public Alpha API is already serving `792042b7d359c5552f9dba7f8cb45dab3e19699b`, release `1.9.0-alpha.20261014.g792042b7d359`, HTTP 200 and DB=true. The failed rerun is not evidence that the runtime is down.
- Owned: isolated `_worktrees/alpha-manifest-redeploy`, manifest validator/self-test, existing Alpha release-state CI test, a patch Changeset and this record. Forbidden: original shared WIP, version-only #1911 implementation changes, main/prod and database mutations.
- Acceptance: same-SHA final-policy reuse preserves original rollback provenance; malformed provenance and changed source/image identity fail; different-SHA and StageA predecessor checks remain strict. Existing CI release-state test must execute the regression. No manifest rewrite or cloud mutation is used by the test.
- Validation: new same-SHA regression fails at the original validator's rollback comparison. Updated self-test and the full existing Alpha release-state CI test PASS; Alpha immutable-deploy check plus negative controls PASS. WSL root ran isolated `/tmp` fixtures because the ordinary-user test waited for sudo/rsync; that owned sudo process was terminated. No service or DB was started. Shell-only change: package tsc/build is delegated to exact-head CI.
- Dependency: the fix adds a new patch Changeset. If merged before promotion, refresh/consume it with the official release preparation flow after #1911; do not claim the old 1.9.0 preparation covers it. No review exception from an earlier PR applies.
- Progress: inspection, RED/GREEN and scoped implementation complete; publish the dev fix, then verify new-head CI/review. Main promotion and exact new-dev Alpha verification remain pending. No local Next/browser/database workload started.

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
