# Team schedules contract

The authoritative schedule, attendance, reminder, guest-recruitment, personal schedule, and lineup method/field/actor rows are frozen in the [REST and idempotency registry](../global-contract.md#frozen-rest-and-idempotency-contract). Schedule and lineup state transitions are frozen in the same registry.

The additive schedule models and constraints are frozen in the [Game aggregate schema ledger](./games.md#frozen-additive-schema-ledger).

## Task 12 implementation status: BUILT (post-review hardening applied)

Every route below is implemented, CI-integration-tested (`apps/v1_api/test/team-schedules/*.integration-spec.ts`), and wired into `AppModule` via `TeamSchedulesModule`. No new migration was required — the four models and seven enums already existed (migration `20260729000100_v1_game_operations`).

An external review (2026-08-03, two independent sources — GPT Pro W1-W10/T1-T3/L1-L2 plus Copilot CP1-CP4) found several concurrency/idempotency defects and CI-blind-spot gaps in the first cut of this implementation. A follow-up pass closed every one of them, including the three that a prior revision of this doc had left open under "Known gaps" (guest-close reminder terminal checks, the private-schedule/public-recruitment read leak, and guest-recruitment idempotency expiry) — see "Deviations" below for the current, as-shipped behavior of each. `git log` on `team-schedules.service.ts` / `guest-recruitment.service.ts` / `attendance.service.ts` is the authoritative source if this doc is read weeks later and a regression has since reopened one of these.

| Method | Path | Guard | Actor | Handler |
|---|---|---|---|---|
| `GET` | `/api/v1/teams/:teamId/schedules` | `OptionalV1AuthGuard` | any (visibility-filtered) | `TeamSchedulesController.list` |
| `POST` | `/api/v1/teams/:teamId/schedules` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.create` |
| `GET` | `/api/v1/teams/:teamId/schedules/:scheduleId` | `OptionalV1AuthGuard` | any (visibility-filtered) | `TeamSchedulesController.detail` |
| `PATCH` | `/api/v1/teams/:teamId/schedules/:scheduleId` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.update` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/cancel` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.cancel` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/complete` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.complete` |
| `PUT` | `/api/v1/teams/:teamId/schedules/:scheduleId/attendance/me` | `V1AuthGuard` | any active member (self only) | `ScheduleAttendanceController.setMyAttendance` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/reminders` | `V1AuthGuard` | team owner/manager | `ScheduleRemindersController.triggerReminder` |
| `GET` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | `OptionalV1AuthGuard` | gated by parent schedule visibility AND `recruitment.visibility` (Deviation 4) | `GuestRecruitmentController.get` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | `V1AuthGuard` | team owner/manager | `GuestRecruitmentController.create` |
| `PATCH` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | `V1AuthGuard` | team owner/manager | `GuestRecruitmentController.update` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment/applications` | `V1AuthGuard` | any authenticated user | `GuestRecruitmentController.apply` |
| `GET` | `/api/v1/me/schedule` | `V1AuthGuard` | authenticated member | `MyScheduleController.mySchedule` |

`POST .../complete` is new: the frozen contract's `scheduled -> cancelled|completed` transition table had no code path that ever produced `COMPLETED` until this route was added (see "Deviation 7" below). It is a versioned, idempotent, owner/manager-only mutation mirroring `cancel()`'s CAS shape — team owner/manager explicitly marks a past-`endAt` schedule complete; there is no background completion worker.

Reminders and escalation reuse the existing Task 5 DB-leased worker (`V1GameOperationsWorkerService`) and the existing `NotificationsService` — no second scheduler is used, but the notification **persistence path is not shared with the HTTP path** (see Deviation 8) — durable reminder delivery goes straight through the worker's own transaction, not through `NotificationsService.emitNotificationToMany`'s fire-and-forget path (`ScheduleReminderService`, registered in `v1-game-operations-worker.main.ts`).

## Known gaps (post-review)

None outstanding as of this revision. The three items a prior revision of this doc listed here — the guest-close reminder skipping the schedule/recruitment terminal check, a private schedule's `PUBLIC`-visibility recruitment being readable anonymously through the dedicated endpoint, and `GuestRecruitmentService`'s idempotency records never expiring out — have all been fixed; see Deviations 4, 10, and 11 below for the current behavior and the regression tests that guard each one. If you are reading this weeks later, check `git log` on `guest-recruitment.service.ts` / `team-schedules.service.ts` to confirm none of these have silently regressed.

## Deviations from the frozen contract

The literal contract text at [`global-contract.md`](../global-contract.md#frozen-rest-and-idempotency-contract) predates this implementation and does not match the shipped Prisma enums in several places. Per project instruction, **shipped code is canonical**; the deviations below are documented here rather than forced to match the older contract prose.

### 1. Attendance vocabulary is the shipped Prisma enum, not `attending|not_attending|undecided`

`SetAttendanceDto.status` accepts exactly `GOING | MAYBE | NOT_GOING` (`apps/v1_api/src/team-schedules/dto/attendance.dto.ts`) — the shipped `V1AttendanceStatus` enum, not the contract's prose vocabulary. `WAITLISTED` is excluded from client input entirely (`@IsIn` allowlist, not `@IsEnum(V1AttendanceStatus)`) since it is server-derived only: requesting `GOING` at full capacity silently persists `WAITLISTED` (200, not an error).

### 2. Reminder `kind` is a closed two-value allowlist with an opaque job id

`TriggerReminderDto.kind` accepts only `'rsvp_deadline' | 'guest_recruitment_close'` (`@IsIn`, 400 `VALIDATION_ERROR` on anything else). The response never exposes the internal `v1_outbox_events.id`; `jobId` is `sha256(businessKey).hex().slice(0, 32)` where `businessKey = schedule:<scheduleId>:reminder:<kind>`. Because the outbox insert uses `ON CONFLICT (business_key) DO NOTHING`, repeat `POST .../reminders` calls under **fresh** `Idempotency-Key` values never create a second outbox row — they re-read and return the row's live status, which is how a client polls (no separate GET status route exists or was added). The **same** `Idempotency-Key` + payload instead replays the original frozen `V1IdempotencyRecord` response per the standard idempotency contract.

### 3. Guest-recruitment `state` is lowercase contract vocabulary mapped onto the shipped enum

`UpdateGuestRecruitmentDto.state` accepts `'open' | 'closed'` (matching the contract's literal casing) and the service maps it onto Prisma's `OPEN | CLOSED`. `FILLED` is server-derived only (`approvedCount === slots`) and is not in the DTO's allowlist at all.

### 4. Visibility: `TEAM` and `MEMBERS` both resolve to "active membership required" today

The schema has no broader team-follower concept, so `TeamSchedulesService.assertManageableTeam`/`detail` and `GuestRecruitmentService.getRecruitment` treat `TEAM` and `MEMBERS` identically: both require an active `V1TeamMembership` row on the path's `:teamId`. `PUBLIC` is the only level `OptionalV1AuthGuard` lets through anonymously. The two-level enum is preserved in the schema for future granularity (documented in code comments at both call sites) rather than collapsed away.

A non-member or anonymous caller requesting a `TEAM`/`MEMBERS`-visibility schedule always gets `404 NOT_FOUND_OR_ARCHIVED`, never `403` — existence is never leaked for private rows. `GET .../guest-recruitment` (`GuestRecruitmentService.getRecruitment()`) now gates on **both** visibility levels, checked in this order: (1) the parent schedule's own `visibility` — a non-member/anonymous caller on a `TEAM`/`MEMBERS`-visibility schedule gets `404 NOT_FOUND_OR_ARCHIVED` regardless of the recruitment's own visibility (W8-B fix — a `PUBLIC`-visibility recruitment can no longer be read anonymously just because the caller knows the scheduleId), then (2) once past that gate, the recruitment's own `visibility` (a `MEMBERS`-visibility recruitment attached to a schedule the caller CAN otherwise see still 404s for a non-member). Both the "private schedule, no recruitment attached" case and the "schedule/recruitment do not exist" case return the identical `404 NOT_FOUND_OR_ARCHIVED` to a non-member (CP4 fix) — a non-member can never distinguish "this schedule id exists but has no recruitment" from "this schedule id doesn't exist" via the error code. A real active member, by contrast, gets the more specific `404 GUEST_RECRUITMENT_NOT_FOUND` when a schedule they can see has no recruitment attached — existence is not a secret from members. Separately: schedule **detail** (`GET .../schedules/:id`) independently redacts a `MEMBERS`-visibility recruitment to `null` for any caller who is not an active team member, even when the parent schedule itself is `PUBLIC` (W8-A fix, `TeamSchedulesService.detail()`'s `canSeeRecruitment` check) — the two endpoints now enforce the same effective rule (parent visibility AND child visibility) from both directions.

### 5. Waitlist promotion-on-vacancy (design addition beyond the literal contract)

Not specified verbatim anywhere in the frozen contract, but required for the waitlist to be usable at all: when a caller's own write transitions their prior status away from `GOING` (to `MAYBE`/`NOT_GOING`) on a capacity-limited schedule, the same transaction promotes the lowest-`waitlistPosition` `WAITLISTED` row to `GOING` and compacts remaining positions down by one. See `ScheduleAttendanceService.setMyAttendance`. Waitlist positions are assigned from `MAX(waitlist_position) + 1` (never a `COUNT()` over possibly-sparse rows) and every position behind a departing waitlisted row is unconditionally compacted down by one, regardless of why that row left the waitlist — a `COUNT()`-based tail assignment without unconditional compaction can assign the same position to two different rows once any waitlisted user has withdrawn.

### 6. List/`me/schedule` pagination shape is `{items, nextCursor}`, not `{items, pageInfo:{...}}`

An older v1 precedent (`team-matches.service.ts`) returns `{items, pageInfo:{nextCursor,hasNext}}`. Since `global-contract.md`'s opening paragraph freezes `{items,nextCursor}` as the cross-domain default, every Task 12 list endpoint follows that literal shape instead of copying the pre-existing (pre-contract) team-matches convention.

### 7. `COMPLETED` is reachable only through an explicit `POST .../complete` mutation, never automatically

The frozen contract's transition table (`scheduled -> cancelled|completed`) does not specify a mechanism. `TeamSchedulesService.complete()` is a versioned, idempotent, owner/manager-only CAS mutation (same shape as `cancel()`) that requires `schedule.endAt` to already be in the past (`409 SCHEDULE_NOT_YET_ENDED` otherwise) and is itself terminal (a completed schedule cannot be updated, cancelled, or completed again). There is no cron/worker that completes schedules automatically based on `endAt` alone — an owner/manager must call this route.

### 8. Durable reminder delivery does not reuse `NotificationsService.emitNotificationToMany`'s persistence path

`NotificationsService.emitNotificationToMany()` (the HTTP path's notification helper) is fire-and-forget by design: it kicks off detached, unawaited inserts against its own Prisma connection and swallows every failure so a notification-send never fails the caller's HTTP request/transaction. That contract is correct for HTTP but is exactly wrong for a durable outbox worker — awaiting it only awaits the loop that *starts* the detached writes, not their completion, so the worker could mark an outbox row `COMPLETED` before (or even if never) a notification row existed. `ScheduleReminderService.deliverDurableReminder()` instead writes `V1Notification` rows directly through the **same** `Prisma.TransactionClient` the worker uses to lock the source row and mark the outbox event `COMPLETED` — a persistence failure now propagates, rolls back the transaction, and leaves the outbox row retryable. Each row's `businessKey` is `${outboxId}:${recipientUserId}` with `skipDuplicates:true`, so re-processing the same outbox claim (crash + retry) can never produce more than one notification row per recipient. Web Push (`WebPushService.sendToUser`) still runs best-effort, but strictly *after* the durable row exists and is caught locally so a push failure can never undo it.

### 9. `teamMatchId` is rejected outright (422) for every non-`MATCH` schedule type

Cross-team ownership validation for `teamMatchId` (the referenced team match must belong to the acting team, checked via `hostTeamId`/`approvedApplicantTeamId`) only ever ran for `type === 'MATCH'`. `TeamSchedulesService.create()` now rejects `teamMatchId` with `422 SCHEDULE_TEAM_MATCH_NOT_ALLOWED` whenever `type !== 'MATCH'`, so the ownership check can never again be silently bypassed by picking a different schedule type.

### 10. Idempotency records past their 30-day retention are deleted on legitimate reuse, not merely ignored

`TeamSchedulesService.checkReplay()` (used by `update`/`cancel`/`complete`/`triggerReminder`) and `create()`'s pre-creation lookup both treat an idempotency record whose `expiresAt` has passed as eligible for **replacement**: the expired exact-scope row is deleted (under the already-held per-scope advisory lock) before the real mutation proceeds, so the mutation's own `storeIdempotency()` insert at the end never collides with a still-present expired row on the same composite unique key. `create()`'s lookup additionally filters to `expiresAt > now` and orders by `[{createdAt:'desc'},{resourceId:'desc'}]` (a genuinely total order — `createdAt` alone can tie at microsecond resolution, per Copilot's CP2 finding) rather than an unfiltered/unordered `findFirst()`, so an expired record can never nondeterministically shadow a later, still-active one after a key has legitimately been reused, and repeated identical replay lookups always resolve to the same row. `GuestRecruitmentService`'s equivalent lookup (`findReplay()`, shared by `createRecruitment`/`updateRecruitment`/`createApplication`) has the same expired-record-deletion fix.

### 11. A guest-recruitment reminder trigger is rejected once either the schedule or the recruitment itself is terminal

`TeamSchedulesService.triggerReminder()`'s `rsvp_deadline` branch always required `schedule.state === SCHEDULED`; the `guest_recruitment_close` branch did not check either the schedule's or the recruitment's own state before enqueueing (W5). The schedule-terminal check is now hoisted above the kind-branch entirely (so both reminder kinds share it, and the schedule row is locked `FOR UPDATE` before it — closing a race where a concurrent `cancel()` could commit in between the read and the outbox insert), and the `guest_recruitment_close` branch additionally requires `recruitment.state === OPEN` (`409 GUEST_RECRUITMENT_TERMINAL` otherwise). A cancelled schedule or a manually-closed recruitment now rejects a guest-close reminder trigger with `409` and creates no outbox row, instead of silently accepting one that `ScheduleReminderService`'s handler would have discarded as a no-op anyway.

### 12. `createApplication()`'s concurrent-duplicate recovery path always persists an idempotency record for its own key

`GuestRecruitmentService.createApplication()`'s `INSERT ... ON CONFLICT DO NOTHING RETURNING` recovery branch (fired when a genuine concurrent duplicate insert loses the race) now persists a `V1IdempotencyRecord` for the caller's own `Idempotency-Key` before returning, matching every other return path in this method (CP3). A retry with that same key correctly replays (`replayed: true`) instead of re-running the whole transaction from scratch. In practice, this specific branch is unreachable through the public method today: `createApplication()`'s own schedule-then-recruitment `FOR UPDATE` locks (added for W2) fully serialize two concurrent calls for the same recruitment, so the losing caller's pre-insert `existingApplication` check always observes the winner's already-committed row first — the fix is still correct defense-in-depth if that serialization is ever relaxed, and `guest-recruitment.integration-spec.ts`'s CP3 regression test proves the caller-observable retry contract via the reachable path.

## Source references

- `apps/v1_api/src/team-schedules/team-schedules.controller.ts`, `team-schedules.service.ts` — schedule CRUD/versioned mutate/cancel/reminder-trigger/my-schedule
- `apps/v1_api/src/team-schedules/attendance.controller.ts`, `attendance.service.ts` — self-only RSVP
- `apps/v1_api/src/team-schedules/guest-recruitment.controller.ts`, `guest-recruitment.service.ts` — guest recruitment + applications
- `apps/v1_api/src/team-schedules/reminders.controller.ts`, `my-schedule.controller.ts` — standalone route owners delegating to `TeamSchedulesService`
- `apps/v1_api/src/team-schedules/dto/*.ts`
- `apps/v1_api/src/team-schedules/team-schedules.module.ts` — wiring; registered in `apps/v1_api/src/app.module.ts`
- `apps/v1_api/src/jobs/schedule-reminders/schedule-reminder.service.ts` — durable reminder handlers (Task 5 worker)
- `apps/v1_api/src/jobs/v1-game-operations-worker.main.ts`, `v1-game-operations-worker.module.ts` — worker registration (additive `NotificationsServiceModule` import — the narrow module declaring only `NotificationsService`/`WebPushService`, so it doesn't re-declare the worker's own `ResultEscalation*` controllers/providers; see `apps/v1_api/src/notifications/notifications-service.module.ts`)
- `apps/v1_api/src/notifications/notifications.service.ts` — `schedule_guest_application_received`, `schedule_rsvp_deadline_reminder`, `schedule_guest_recruitment_close_reminder` event types
- Tests (all under `apps/v1_api/test/team-schedules/`, selected by the `integration` Jest project's `test/team-schedules/**/*.integration-spec.ts` glob):
  - `attendance.integration-spec.ts` — CAS/idempotency/capacity, a genuine row-lock-barrier proof of the last-slot race (not a bare `Promise.all()`), the corrected stale-version regression test, and the waitlist-compaction regression (withdrawal + new joiner never collide, repeat request preserves position)
  - `schedule-crud.integration-spec.ts` — CRUD/cancel/reminder-trigger CAS, cross-team `teamMatchId` rejection for every non-`MATCH` type (W7), `rsvpDeadlineAt: null` explicit-clear vs. omitted-preserves-value (CP1), expired-idempotency-record reuse for create/update/cancel/reminder-trigger (W9/CP2, including the deterministic create-replay ordering), and the `complete()` transition/terminal-state/query-visibility regression (W10)
  - `guest-recruitment.integration-spec.ts` — `GuestRecruitmentService` race regressions: a cancellation-equivalent state change committing while a genuinely-blocked application waits on the same schedule row lock (W2), the resulting fully-serialized concurrent-duplicate-application contract plus a same-key retry replay proof (W3/CP3), a reopened-after-cancellation rejection (W4), and a standalone SQL-contract test for the `ON CONFLICT DO NOTHING RETURNING` duplicate-application pattern
  - `team-schedules.integration-spec.ts` — HTTP contract: guest-recruitment identity/deadline/idempotency/visibility including the parent-schedule-visibility gate on the dedicated recruitment endpoint (W8-B) and the identical non-member 404 code for "no recruitment" vs. "no schedule" (CP4), schedule-detail recruitment redaction (W8-A), a genuine row-lock-barrier proof of the concurrent PATCH race, cancel/reminder interaction for both reminder kinds including the guest-recruitment-close terminal checks (W5), and a real internal-scrimmage (non-`MATCH`) schedule creation proving no `V1Game` row is ever created by any Task 12 schedule type (global before/after count, not just one `teamMatchId` filter)
  - `reminder-worker-wiring.integration-spec.ts` — boots the **real** `v1-game-operations-worker.main.ts` entry point as a child process (production-shaped env: no `FRONTEND_URL`) and drives both real outbox event types through the actual running worker end-to-end, proving handler registration, dispatch-to-the-correct-handler, and durable notification persistence (including same-claim re-processing producing no duplicate rows) — this is the one spec in this domain that exercises the actual composition root rather than a hand-constructed service/class instance
  - `helpers/lock-barrier.ts` — shared deterministic-concurrency-barrier utility (`holdRowLock`/`isStillPending`) used by every genuine-race test above
- Unit: `apps/v1_api/src/jobs/schedule-reminders/schedule-reminder.service.spec.ts` — durable-delivery contract in isolation (persistence failure propagates and is retryable, preference filtering, Web Push best-effort ordering)
