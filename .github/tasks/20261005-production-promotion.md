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
