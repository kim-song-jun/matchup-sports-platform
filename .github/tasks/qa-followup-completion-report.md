# QA Follow-up Completion Report — Phase 1-5

Date: 2026-04-05

---

## Summary

QA feedback was addressed across 5 implementation phases plus a cleanup pass. The work covered DB schema additions, backend service rewrites, DTO hardening, realtime infrastructure, and frontend auth gating.

---

## Phase Breakdown

### Phase 1: DB Schema & Migration
- Added 3 new models: `TeamMembership`, `MercenaryPost`, `MercenaryApplication`
- Added 4 new enums: `TeamRole` (owner/manager/member), `TeamMembershipStatus`, `MercenaryPostStatus`, `MercenaryApplicationStatus`
- Migration file: `apps/api/prisma/migrations/20260405000000_add_team_membership_and_mercenary/migration.sql`
  - Includes owner backfill SQL to populate memberships for existing teams
- Updated `apps/api/prisma/seed.ts` to auto-create owner memberships and seed 5 mercenary posts
- Files changed: 3 (schema.prisma, seed.ts, migration SQL)

### Phase 2: Backend Mercenary (Prisma Rewrite)
- Replaced in-memory mock store with full Prisma-backed implementation
- `MercenaryService` now persists posts and applications to DB
- Added `MercenaryApplicationStatus` lifecycle (pending → accepted/rejected/withdrawn)
- New endpoints: `GET /mercenary/me/applications`, `PATCH /mercenary/:id/applications/:appId/accept|reject`, `DELETE /mercenary/:id/applications/me`
- Files changed: ~4 (mercenary.service.ts, mercenary.controller.ts, DTOs, module)

### Phase 3: Backend Team Membership & Permissions
- New `TeamMembershipService` at `apps/api/src/teams/team-membership.service.ts`
  - Key methods: `assertRole`, `listUserTeams`, `addMember`, `updateRole`, `removeMember`
- Role hierarchy enforced: owner > manager > member
- `assertRole(teamId, userId, 'manager')` is the standard guard for mutation endpoints
- New endpoints: `GET /teams/:id/members`, `POST /teams/:id/members`, `PATCH /teams/:id/members/:userId`, `DELETE /teams/:id/members/:userId`, `POST /teams/:id/leave`
- Files changed: ~5 (team-membership.service.ts, teams.controller.ts, DTOs, teams.module.ts)

### Phase 4: Backend DTO Hardening & Realtime
- Team-matches DTOs: 7 DTO classes rewritten, all `Record<string, unknown>` removed
- New endpoints: `GET /team-matches/:id/applications` (host view), `GET /team-matches/me/applications` (applicant view)
- `RealtimeGateway` updated: JWT handshake auth, `chat:*` and `notification:*` events, `emitToUser(userId, event, payload)` helper
- `NotificationService`: switched to Prisma-backed storage + realtime emit via gateway
- Files changed: ~8 (7 DTO files, realtime.gateway.ts, notifications.service.ts)

### Phase 5: Frontend (Auth Guard, Applications UI, Profile)
- `useRequireAuth` hook adopted across all protected routes:
  - `/(main)/my/*`, `/teams/new`, `/team-matches/new`, `/mercenary/new`
- New API hooks added to `apps/web/src/hooks/use-api.ts` for all new backend endpoints
- New pages and components:
  - `apps/web/src/components/team-matches/applications-section.tsx` — host-side applicant list
  - `apps/web/src/app/(main)/mercenary/new/page.tsx` — mercenary post creation
  - `apps/web/src/app/(main)/teams/[id]/members/page.tsx` — member management
- `/my/team-matches`: tab UI (hosted / applied)
- `/profile`: link fixes, mercenary section, "+ 모집글 등록" button
- `/my/matches`: `?tab=created|history` URL param support
- Realtime client stub: `apps/web/src/lib/realtime-client.ts` + `apps/web/src/hooks/use-realtime.ts`
  - Stub only — `socket.io-client` not yet installed
- Files changed: ~12

---

## Files Changed by Area

| Area | Approximate File Count |
|------|----------------------|
| DB (schema, migration, seed) | 3 |
| Backend services | 6 |
| Backend controllers | 4 |
| Backend DTOs | 9 |
| Backend modules | 3 |
| Frontend pages | 5 |
| Frontend components | 3 |
| Frontend hooks | 2 |
| Frontend lib (realtime stub) | 1 |
| **Total** | **~36** |

---

## Test Results

| Suite | Result |
|-------|--------|
| Backend (Jest) | 118 pass, 0 fail |
| Frontend (Vitest) | 125 pass, 0 fail |
| TypeScript (`tsc --noEmit`) | Clean — no errors |
| E2E (Playwright) | Not run (DB offline during session) |

---

## Blockers Remaining

### 1. `socket.io-client` not installed
- Affects: `apps/web/src/lib/realtime-client.ts`, `apps/web/src/hooks/use-realtime.ts`
- Both files are stubs and will throw at runtime
- Fix: `pnpm add socket.io-client --filter web`

### 2. DB migration not applied
- `apps/api/prisma/migrations/20260405000000_add_team_membership_and_mercenary/migration.sql` exists but PostgreSQL was offline during the session
- `TeamMembership`, `MercenaryPost`, `MercenaryApplication` tables do not exist in the DB yet
- Fix:
  ```bash
  docker compose up -d
  cd apps/api && pnpm prisma migrate deploy
  ```

---

## Out-of-Scope Items (Deferred)

The following were identified but explicitly not addressed in this session:

- AI matching algorithm integration with team membership data
- Payment flow for mercenary posts
- Push notification delivery (FCM/APNs) — only in-app realtime implemented
- Team trust score recalculation after mercenary matches
- Admin dashboard views for new models (TeamMembership, MercenaryPost)
- E2E tests for new flows (member management, mercenary applications)

---

## Next Session Suggestions

1. **Unblock first**: Run the two blocker commands above before any other work
2. **Realtime smoke test**: After installing `socket.io-client`, verify `emitToUser` delivers notifications end-to-end in dev
3. **E2E coverage**: Add Playwright tests for the member management and mercenary application flows
4. **Admin views**: Extend admin dashboard to surface `TeamMembership` and `MercenaryPost` data
5. **Mercenary payment**: Wire up Toss Payments for paid mercenary slots (currently fee field exists but payment not triggered)
