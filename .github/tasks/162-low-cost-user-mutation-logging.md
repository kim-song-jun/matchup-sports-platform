# Task 162 ??Low-cost user mutation logging

## Scope

- Target: backend + docs
- Mode: CODE
- Valid runtime: `apps/v1_api`
- Database changes: none

## Problem

The API already has structured HTTP/error logs, GA events, admin audit rows, and tournament/game operation audits, but ordinary authenticated user mutations do not have a compact, consistent diagnostic event. Adding a database row for every user action would add write load and unbounded storage cost.

## Decision

Emit one structured Pino event for authenticated state-changing HTTP requests only.

- Included methods: `POST`, `PUT`, `PATCH`, `DELETE`
- Excluded: reads, anonymous requests, admin/operation paths already covered by durable audits, and high-volume/noisy auth, chat, notification, upload, verification, and client-log paths
- Stored data: event name, hashed actor ID, method, route template, outcome, status code, duration, request ID
- Logger source: the Pino root logger, not the request-scoped child logger, so automatic request headers and IP metadata cannot be attached to this event
- Never stored: request/response bodies, query strings, headers, cookies, tokens, email, phone, raw user ID, or concrete route parameter values
- Persistence: existing rotating Docker JSON logs only (`10m` 횞 `5`); no DB table, migration, queue, analytics vendor, or new paid service

## Acceptance Criteria

- [x] Authenticated included mutations emit exactly one `user_mutation` event.
- [x] Successful and failed mutations record outcome and status without changing the response/error.
- [x] GET and anonymous requests emit no user mutation event.
- [x] Excluded high-volume or already-audited route groups emit no user mutation event.
- [x] Event payload cannot contain request bodies, query strings, headers, personal contact data, or raw user IDs.
- [x] Existing v1 API response and authorization contracts remain unchanged.
- [x] Focused unit tests prove the logging and exclusion contracts.

## Progress Snapshot

- 2026-09-02: Scope fixed to a zero-DB, bounded-log implementation because operating cost is the primary constraint.
- 2026-09-02: Implemented a global mutation logging interceptor and registered it in `AppModule`.
- 2026-09-02: Rebased the implementation onto fresh `origin/dev` in an isolated Task 162 worktree; focused Jest result: 1 suite, 10 tests passed, including the guarantee that a logger failure cannot break the mutation.
- 2026-09-02: `tsc --noEmit` passed. The combined lint command then hit Windows `find.exe` incompatibility, so `v1-surface-check.mjs` was rerun under Git Bash and passed (498 files; all baselines unchanged).
- 2026-09-02: Added the required `v1_api: patch` changeset. No Prisma schema, migration, DB query, or paid service was added.
- 2026-09-02: ALPHA runtime verification found that the first implementation's request-scoped Pino child automatically appended request headers and IP metadata. Switched this event to the documented Pino root logger and added an exact allowlist assertion before redeploying.
