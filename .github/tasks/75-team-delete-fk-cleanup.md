# Task 75 - Team Delete FK Cleanup

Owner: backend-api-dev / backend-data-dev / backend-integration-dev
Date drafted: 2026-04-23
Status: Planned
Priority: P1

## Context

`DELETE /api/v1/teams/:id` is currently implemented as a direct `sportTeam.delete()` call after owner-role verification.

Current implementation:
- `apps/api/src/teams/teams.service.ts`
  - `remove(teamId, userId)` -> `assertRole(owner)` -> `findById(teamId)` -> `prisma.sportTeam.delete({ where: { id: teamId } })`

Schema evidence shows at least two non-cascading references that can block team deletion:
- `apps/api/prisma/schema.prisma`
  - `TeamMatch.hostTeamId -> SportTeam.id` via `@relation("TeamMatchHost", fields: [hostTeamId], references: [id])`
  - `TeamMatchApplication.applicantTeamId -> SportTeam.id` via `@relation("TeamAppApplicant", fields: [applicantTeamId], references: [id])`

By contrast, several other team-owned relations already clean up safely:
- `TeamMembership.team` -> `onDelete: Cascade`
- `MercenaryPost.team` -> `onDelete: Cascade`
- `Lesson.team` / `MarketplaceListing.team` / `Tournament.team` -> `onDelete: SetNull`

## Runtime Status

Live confirmation of the exact DELETE failure response is currently blocked on local runtime availability:
- `http://localhost:8111/api/v1/health` was unreachable on 2026-04-23.
- Docker-backed repro is blocked because Docker daemon is not running on this machine (`dockerDesktopLinuxEngine` pipe missing).

I added a focused repro spec:
- `apps/api/test/integration/teams-delete.e2e-spec.ts`

But the live integration run could not be completed end-to-end in the current environment because:
- host-side integration lacked `DATABASE_URL`
- docker-side integration could not start without Docker daemon

## Problem Statement

Team deletion currently assumes `SportTeam` is leaf-owned by the owner, but it is still referenced by team-match records in two roles:
- host team of a posted team match
- applicant team of a team-match application

As a result, owner-facing delete can fail with an internal server error instead of a product-level guarded response or deterministic cleanup flow.

## Required

- Reproduce the exact failure response for `DELETE /teams/:id` against a live runtime.
- Decide the product contract for team deletion when team-match history exists.
- Implement explicit pre-delete handling for team-match references instead of relying on raw FK failure.
- Add integration coverage for both blocking paths:
  - deleting a host team with existing `TeamMatch`
  - deleting an applicant team with existing `TeamMatchApplication`

## Decision Surface

The implementation must explicitly choose one of these contracts:

1. Hard block delete when any active or historical team-match reference exists.
2. Allow delete only after archiving/canceling owned team matches and removing pending applications.
3. Convert team references to a soft-delete/archive model and keep historical rows readable.

Current recommendation:
- Start with `hard block + explicit 409/400 domain error` if any `TeamMatch` or `TeamMatchApplication` reference exists.
- Only move to destructive cleanup if product explicitly wants delete-as-cascade semantics.

Reason:
- Team matches are transactional/history-bearing records.
- Blind cascade on host/applicant relationships risks losing operational history, chat/dispute linkage, and auditability.

## Acceptance Criteria

- Given a team owns one or more `TeamMatch` rows
  - When the owner calls `DELETE /teams/:id`
  - Then the API returns a domain-level error, not raw 500

- Given a team has one or more `TeamMatchApplication` rows as applicant
  - When the owner calls `DELETE /teams/:id`
  - Then the API returns a domain-level error, not raw 500

- Given a team has no blocking team-match references
  - When the owner calls `DELETE /teams/:id`
  - Then the team is deleted successfully and cascade/set-null behavior remains intact for safe relations

## Implementation Notes

- Add a preflight query in `TeamsService.remove()` for:
  - hosted team matches
  - applicant team-match applications
- Throw an explicit `ConflictException` or structured domain error code such as:
  - `TEAM_DELETE_BLOCKED_BY_HOSTED_MATCHES`
  - `TEAM_DELETE_BLOCKED_BY_MATCH_APPLICATIONS`
- Preserve current owner-only authorization contract.
- Update `docs/api/domains/teams.md` in the same change once the contract is chosen.

## Validation

- `pnpm --filter api test:integration -- teams-delete.e2e-spec.ts`
- Add/adjust unit coverage for `TeamsService.remove()`
- Live runtime smoke:
  - `DELETE /api/v1/teams/:id` with hosted match reference
  - `DELETE /api/v1/teams/:id` with applicant application reference
  - `DELETE /api/v1/teams/:id` with no blocking references
