# V1 Mercenary Flow Scenarios

> Status: Not implemented in the active v1 runtime.

The earlier checked scenarios were executed against legacy `apps/api` and `apps/web`. Under the repository v1 scope override, that evidence does not prove anything about `apps/v1_api` or `apps/v1_web` and is no longer counted as complete.

## Current V1 Evidence

- `apps/v1_web` has no `/mercenary`, `/mercenary/new`, or `/mercenary/[id]` route.
- `apps/v1_api` has no mercenary controller, service, DTO, Prisma model, migration, or fixture.
- The landing page still advertises mercenary recruiting, and the popup screen enum includes `mercenary`; these references are promises/navigation taxonomy, not an implemented user flow.
- The new-page decision is gated in [`teameet-new-page-scope-decision.html`](/Users/sungjun/.codex/visualizations/2026/07/14/019f6103-b74c-7b80-9c89-f5578f96784c/teameet-new-page-scope-decision.html). Option B is recommended because it is the only candidate that creates a genuinely absent user-facing v1 page rather than extending an existing route.

## Pending V1 Scenario Contract

- [ ] MERC-V1-001 Define the DB/API/permission/idempotency contract before UI work.
- [ ] MERC-V1-002 Create a realistic recruitment post through `/mercenary/new` and persist it.
- [ ] MERC-V1-003 Show the post in `/mercenary`, its detail route, the related team surface, and the host's own list after reload.
- [ ] MERC-V1-004 Reject guest application, self-application, duplicate application, and application after close.
- [ ] MERC-V1-005 Let the host review and accept or reject applicants; reflect the result to the applicant after reload.
- [ ] MERC-V1-006 Make create/apply/accept/reject/close safe against same-tick double submit and network retry.
- [ ] MERC-V1-007 Prove role boundaries for team owner/manager/member and protect private applicant data.
- [ ] MERC-V1-008 Verify loading, empty, error, retry, validation, animation, focus, and responsive layouts at 375/768/1280.
- [ ] MERC-V1-009 Record exact fixture creation and cleanup without production data mutation.

## Gate

No v1 schema, API, route, mock, or QA data is created until the user selects the new-page scope. Legacy source or tests must not be copied as implementation authority.
