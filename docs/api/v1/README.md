# Teameet V1 API Contract

Status: implementation-facing draft published from the frozen SM New reference contract and current `apps/v1_api` controllers.

Scope:

- Runtime API: `apps/v1_api`
- Runtime prefix: `/api/v1`
- Runtime web: `apps/v1_web`
- Database: isolated v1 database with `v1_*` tables and `V1*` Prisma models
- Existing `apps/api`, `apps/web`, and legacy DB contracts are not valid runtime sources for v1 completion.

Canonical sources:

- Frozen reference: `docs/reference/sm-new-api-v1-contract-checklist.md`
- State machines: `docs/reference/sm-new-state-machines.md`
- Permissions: `docs/reference/sm-new-permission-matrix.md`
- DB design: `docs/reference/sm-new-db-v1-implementation-design.md`
- Runtime evidence: `apps/v1_api/src/**`
- Scenario matrix: `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`

## Documents

- [Global Contract](./global-contract.md)
- [Auth And Onboarding](./domains/auth-onboarding.md)
- [Home, Search, Notices, Master](./domains/home-search-notices-master.md)
- [Matches](./domains/matches.md)
- [Teams](./domains/teams.md)
- [Team Matches](./domains/team-matches.md)
- [Chat And Notifications](./domains/chat-notifications.md)
- [Reviews](./domains/reviews.md)
- [Profile And Settings](./domains/profile-settings.md)
- [Admin And Audit](./domains/admin-audit.md)
- [Admin Ops](./domains/admin-ops.md)
- [Deferred Boundaries](./domains/deferred-boundaries.md)

## Publication Notes

- These docs describe the v1 implementation contract as of 2026-05-18.
- The frozen reference checklist used `/api/v1/sm-new` while the implemented Nest app uses `/api/v1`. The implementation prefix wins for runtime and frontend hook work.
- Terms, OAuth callback, email login, signup, and global search remain frozen in the reference contract but are not yet implemented in `apps/v1_api`; they are marked as pending implementation where relevant.
- Task 104 adds internal `/ops` APIs for reports, disputes, payments, refunds, settlements, payout attempts, and audit history under `/api/v1/admin/*`; `/admin` remains a customer ERP surface and must not consume those APIs.
- Marketplace, lessons, venue owner/operator, DM, permanent team chat, and file attachment remain deferred unless a v1 task explicitly implements them.
