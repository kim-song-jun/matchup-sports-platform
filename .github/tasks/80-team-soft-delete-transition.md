# Task 80 - Team Soft Delete Transition

Owner: backend-api-dev / backend-data-dev / frontend-data-dev / frontend-ui-dev / backend-integration-dev / QA / docs
Date drafted: 2026-04-23
Status: Planned
Priority: P1
Supersedes: Task 75 as the preferred product direction

## Context

`DELETE /api/v1/teams/:id` currently performs a physical delete:
- `apps/api/src/teams/teams.service.ts`
  - `remove(teamId, userId)` -> owner check -> `prisma.sportTeam.delete(...)`

This is incompatible with current data relationships because team records are referenced by history-bearing domains:
- `TeamMatch.hostTeamId`
- `TeamMatchApplication.applicantTeamId`
- plus member/application/chat/mercenary/listing/lesson/tournament surfaces that assume the team row still exists

The product goal is:
- a team owner can "delete" a team from active product surfaces
- completed team-match history remains intact
- the API must not fail with raw FK-driven `500`

## Why Soft Delete

Physical delete is a poor fit here because:
- completed team matches are historical records
- applicant-team references in team-match applications are also historical records
- cascade deletion would destroy auditability and relational context
- hard-block-only leaves owners unable to leave the product in a predictable way

Soft delete gives the cleanest contract:
- remove the team from active discovery and management surfaces
- preserve historical relations and read models
- allow the backend to deactivate active flows explicitly instead of failing at the DB layer

## Proposed Contract

### User-facing behavior

- `DELETE /teams/:id` becomes a soft delete, not a physical delete.
- Success remains `204 No Content`.
- Deleted teams no longer appear in:
  - `/teams`
  - `/teams/me`
  - `/my/teams`
  - public `/teams/:id`
  - member management and invitation/application entry surfaces
- Historical team-match/application records remain in the database.

### Backend behavior

- Add `deletedAt` to `SportTeam`.
- All "active team" queries default to `deletedAt: null`.
- `DELETE /teams/:id` updates `deletedAt` inside a transaction instead of deleting the row.
- Team-owned active flows are deactivated during the same transaction or deterministic follow-up updates.

## MVP Scope

### 1. Schema

- Add to `SportTeam`:
  - `deletedAt DateTime? @map("deleted_at")`
- Add index:
  - `@@index([deletedAt])`

Optional but recommended if audit depth is needed:
- `deletedByUserId String? @map("deleted_by_user_id")`
- `deletionReason String? @map("deletion_reason")`

MVP recommendation:
- start with `deletedAt` only
- add actor/reason only if admin/audit requirements demand it immediately

### 2. Delete semantics

Replace physical delete with transactional soft delete:
- verify owner role
- verify team is not already deleted
- mark `deletedAt = now()`
- force active outward-facing team state inert:
  - `isRecruiting = false`

### 3. Active-flow shutdown rules

When a team is soft-deleted, active product flows must stop behaving as if the team still operates.

MVP shutdown rules:
- hosted `TeamMatch` rows in active/recruiting states:
  - transition to `cancelled`
- pending `TeamMatchApplication` rows where this team is applicant:
  - transition to `withdrawn` or leave as-is but exclude from active applicant actions
- active `MercenaryPost` rows for the team:
  - transition away from public recruitment state
- `TeamInvitation` / pending `TeamMembership` application paths:
  - no new actions allowed once team is deleted

Decision note:
- if this wave is kept narrow, only `TeamMatch` + `TeamMatchApplication` shutdown is required for correctness
- mercenary/listing/lesson/tournament cleanup can be phase 2 if current UI already hides deleted teams everywhere those flows start

### 4. Read contracts

All active team reads should treat soft-deleted teams as missing:
- `GET /teams`
- `GET /teams/me`
- `GET /teams/:id`
- `GET /teams/:id/hub`
- members/applications/invitations endpoints

Expected behavior:
- deleted team id returns `404` on team-centric endpoints
- list endpoints exclude deleted teams by default

### 5. Mutation guards

All team-scoped mutations must reject deleted teams:
- update team
- add/remove members
- apply to team
- transfer ownership
- invitations
- any future team-centric admin/member actions

Suggested error code:
- `TEAM_DELETED`

### 6. Frontend contract

Frontend must treat delete as archive/deactivate, not destructive erase.

Required changes:
- delete confirmation copy:
  - explain that the team disappears from active surfaces
  - explain that historical records remain
- after success:
  - invalidate team caches
  - redirect owner away from deleted team routes
- `/my/teams` and any owner dashboards must not show deleted teams as manageable

### 7. Historical rendering policy

Historical team-match and application records may still point to soft-deleted teams.

MVP rendering rule:
- preserve relation rows
- when rendering a deleted team from historical context, prefer:
  - existing stored team relation if available
  - fallback label such as `삭제된 팀`

Open decision:
- whether historical detail pages should still deep-link to `/teams/:id`
- MVP recommendation: no; team detail route should return `404` once deleted

## Implementation Plan

### Phase 0 - Contract lock

- Confirm soft delete is the chosen product direction.
- Mark Task 75 as superseded by this task for implementation.
- Update `docs/api/domains/teams.md` to reflect soft delete semantics.

### Phase 1 - Schema and backend core

- Add `deletedAt` to `SportTeam` and generate migration.
- Refactor `TeamsService.remove()` to:
  - check owner role
  - fail gracefully if already deleted
  - soft-delete in transaction
  - deactivate active hosted/application team-match state
- Update all team read methods to filter `deletedAt: null`.
- Add shared helper if needed:
  - `assertActiveTeam(teamId)`

### Phase 2 - Team-scoped mutation guards

- Ensure all team mutations reject soft-deleted teams.
- Add service-layer checks, not just controller guards.

### Phase 3 - Frontend behavior

- Update delete CTA copy on `/teams/[id]/edit`
- Ensure deleted teams disappear from owner/member lists
- Handle post-delete redirect and cache invalidation
- Show stable error handling if user lands on a deleted team URL

### Phase 4 - Docs and QA

- Update:
  - `docs/api/domains/teams.md`
  - relevant scenario docs under `docs/scenarios/`
- Add integration tests for:
  - delete team with hosted team-match history
  - delete team with applicant history
  - deleted team excluded from reads
  - deleted team rejects future team mutations

## Acceptance Criteria

- Given a team has completed or pending team-match history
  - When the owner calls `DELETE /teams/:id`
  - Then the API returns `204`
  - And the team row remains with `deletedAt != null`
  - And no raw FK `500` occurs

- Given a team is soft-deleted
  - When a client calls `GET /teams/:id`
  - Then the API returns `404`

- Given a team is soft-deleted
  - When a client lists teams via `/teams` or `/teams/me`
  - Then that team is excluded

- Given a team is soft-deleted
  - When someone attempts team-scoped mutations
  - Then the API returns a domain error such as `TEAM_DELETED`

- Given a deleted team had active team-match recruitment state
  - When deletion completes
  - Then those active flows are no longer recruitable/actionable

## Risks

- Hidden query drift:
  - any missed `deletedAt: null` filter can leak deleted teams back into UI
- Historical rendering drift:
  - old screens may still assume every team id deep-links to a live detail page
- Partial shutdown:
  - if active mercenary or other team-owned flows are not deactivated, deleted teams may still appear operational

## Validation

- Backend unit:
  - `pnpm --filter api test -- teams.service.spec.ts`
- Backend integration:
  - targeted soft-delete spec
  - targeted reads-after-delete spec
- Web:
  - `pnpm --filter web test`
  - `pnpm --filter web exec tsc --noEmit`
- Runtime smoke:
  - owner deletes team with completed team-match history
  - deleted team disappears from `/my/teams`
  - direct visit to deleted `/teams/:id` returns 404 or equivalent not-found UI

## Open Questions

1. Should deleted teams be restorable by admin later, or is delete irreversible at product level?
2. On delete, should hosted future team matches become `cancelled` immediately, or should they remain as historical but hidden?
3. Do we need to null or snapshot certain public profile fields on deleted teams for privacy, or is route-level hiding sufficient?
