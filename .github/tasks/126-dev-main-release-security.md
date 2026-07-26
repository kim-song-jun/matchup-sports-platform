# Task 126 — dev-to-main release migration and security gate

## Scope

- Release candidate: `release/dev-to-main-20260726`
- Base: `main`
- Source: `dev`
- Backend: v1 migration rehearsal and CodeQL remediation
- Frontend: CodeQL remediation only
- Production mutation remains forbidden until every gate below is complete.

## Acceptance Criteria

- [x] `origin/main` is an ancestor of `origin/dev`; release candidate uses fast-forward history.
- [x] Production database and v1 upload volume have validated backups.
- [x] The production database backup restores into an isolated database.
- [x] All 38 pending candidate migrations apply to that restored snapshot.
- [x] Prisma reports zero schema drift after rehearsal.
- [x] All 51 pre-existing data tables keep identical row counts.
- [ ] CodeQL reports no new high-severity alert on the candidate.
- [ ] Candidate CI Test is green after security remediation.
- [ ] Final maintenance-window database and upload backups are captured before production approval.
- [ ] Production migration, health checks, and critical smoke scenarios pass.

## Security Remediation

- Replace uncontrolled URL-query regex normalization with bounded token processing.
- Use Web Crypto UUIDs instead of `Math.random()` for correlation and draft identifiers.
- Restrict video preview sources to local uploads or HTTP(S) video files.
- Escape CSS string backslashes, quotes, and control characters.

## Progress Snapshot

- Initial candidate SHA: `6169ab6f270387e93531770801c880a8ae422f83`.
- Draft PR: `#195`.
- Restored-production rehearsal: 80 total migrations, 38 pending, 38 applied.
- Post-rehearsal status: up to date; schema diff exit `0`.
- Row preservation: 51/51 existing tables, diff exit `0`.
- Initial PR CodeQL: six high alerts; remediation is implemented locally and awaiting rerun.

## Ambiguity Log

- The preliminary backup was taken while production writes remained enabled. It is valid
  for rehearsal, but a new maintenance-window backup is required for production rollback.
- Repository-wide `git diff --check origin/main..dev` reports extensive pre-existing
  whitespace findings. This release task does not perform a broad mechanical rewrite;
  touched security files must remain clean, and the inherited findings remain visible.
