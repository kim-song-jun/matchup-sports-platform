# Task 133 - 2026-08-07 production promotion

## Scope

- Finalize the `dev` release candidate for production.
- Resolve the two real review findings on PR #264.
- Re-run Alpha, consume pending Changesets through the canonical release workflow, and prepare the final `dev -> main` promotion.
- Production merge and environment approval remain user-only operations.

## Acceptance Criteria

- [x] Roster cleanup updates only still-active rows and reports the actual updated count.
- [x] Eligible-player names normalize whitespace-only values to `null`.
- [ ] Narrow regression tests, committed-tree checks, dev CI, and Alpha deployment pass.
- [ ] Pending Changesets are consumed through `release-main.yml` and the resulting Alpha release identity is verified.
- [ ] PR #264 reflects the full release scope and has green checks with no unresolved review threads.
- [ ] Fresh production backup/PITR evidence and rollback SHA are recorded before approval.
- [ ] Production headers, DB health, and critical smoke checks pass after the user merges and approves.

## Progress Snapshot

- Production before promotion: release `0.2.1`, SHA `c19cf50b5b430185067d0b8635d799b5fbf81f1a`, DB health true.
- Initial Alpha candidate: release `0.2.1-alpha.20260807.gb23b63829f40`, SHA `b23b63829f404df27a09fa7698fd35658195c5a7`.
- `dev` is 31 commits ahead of and 0 commits behind `main`.
- PR #264 is mergeable but unstable because two jobs hit a transient GitHub Actions outage and two real Copilot review threads remain unresolved.
- Pending release contract: 26 Changesets; package versions are `0.2.0`, so direct promotion would reuse the current production display version `0.2.1`.
- Local verification: 69 targeted Jest tests pass; v1 API `tsc --noEmit` passes after regenerating the Prisma client.

## Ambiguity Log

- GitHub repository settings allow direct `main` pushes and admin bypass of the production environment. This task intentionally uses neither path.
- Application rollback does not reverse Prisma migrations. The two pending migrations are additive, but a fresh backup/PITR check is still required before approval.
