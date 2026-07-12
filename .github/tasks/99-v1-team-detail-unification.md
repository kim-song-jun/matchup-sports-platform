# 99 V1 Team Detail Unification

## Scope

- Frontend: `apps/v1_web`
- Backend contract cleanup: `apps/v1_api/src/teams/teams.service.ts` only if needed for dead route alignment
- Canonical routes:
  - Team detail: `/teams/[id]`
  - Team edit: `/teams/[id]/edit`
  - Team members: `/teams/[id]/members`

## Problem

`/teams/[id]` and `/my/teams/[id]` show different versions of the same team. My team cards route to a reduced my-team detail page, while the public team detail has fuller information. Owner/manager actions are split across my-team detail and members pages, and the API exposes `manageRoute: /teams/:id/manage` even though no v1 route exists there.

## Requirements

- `/teams/[id]` is the single full team detail surface for outsiders and members.
- `/my/teams` cards navigate to the canonical `/teams/[id]` detail.
- Owner/manager users see an operations menu on `/teams/[id]`.
- Member users see team detail and chat entry, without owner/manager operations.
- Outsiders keep join/request/withdraw/closed CTA behavior.
- `/my/teams/[id]` and `/my/teams/[id]/members` must not become separate competing detail surfaces.
- No dead `/teams/[id]/manage` links.

## Acceptance Criteria

- Given an outsider opens `/teams/[id]`, they see full team detail and a join-related CTA only.
- Given an owner or manager opens `/teams/[id]`, they see full team detail plus operations for edit and member management.
- Given a member opens `/teams/[id]`, they see full team detail and team chat entry but no edit/member-management operations.
- Given a user opens `/my/teams`, selecting a team lands on `/teams/[id]`.
- Given a direct visit to `/my/teams/[id]`, it redirects to `/teams/[id]`.
- Given a direct visit to `/my/teams/[id]/members`, it redirects to `/teams/[id]/members`.
- API/frontend links no longer point to `/teams/[id]/manage`.

## Validation

- `git diff --check`
- `pnpm --filter v1_web lint:patterns`
- Type/lint/build if local command resolution permits
- Browser smoke with owner/manager/member/outsider where local seed data allows:
  - `/my/teams`
  - `/teams/[id]`
  - `/my/teams/[id]`
  - `/my/teams/[id]/members`

## Progress Snapshot

- 2026-06-29: Implemented canonical `/teams/[id]` routing from `/my/teams`, added redirects from old my-team detail/member routes, added owner/manager operations on team detail, changed member/owner CTA to team chat, and aligned `manageRoute` away from dead `/teams/:id/manage`.
