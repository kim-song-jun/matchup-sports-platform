# Team schedules contract

The authoritative schedule, attendance, reminder, guest-recruitment, personal schedule, and lineup method/field/actor rows are frozen in the [REST and idempotency registry](../global-contract.md#frozen-rest-and-idempotency-contract). Schedule and lineup state transitions are frozen in the same registry.

The additive schedule models and constraints are frozen in the [Game aggregate schema ledger](./games.md#frozen-additive-schema-ledger).

## Task 12 implementation status: BUILT

Every route below is implemented, CI-integration-tested (`apps/v1_api/test/team-schedules/*.integration-spec.ts`), and wired into `AppModule` via `TeamSchedulesModule`. No new migration was required — the four models and seven enums already existed (migration `20260729000100_v1_game_operations`).

| Method | Path | Guard | Actor | Handler |
|---|---|---|---|---|
| `GET` | `/api/v1/teams/:teamId/schedules` | `OptionalV1AuthGuard` | any (visibility-filtered) | `TeamSchedulesController.list` |
| `POST` | `/api/v1/teams/:teamId/schedules` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.create` |
| `GET` | `/api/v1/teams/:teamId/schedules/:scheduleId` | `OptionalV1AuthGuard` | any (visibility-filtered) | `TeamSchedulesController.detail` |
| `PATCH` | `/api/v1/teams/:teamId/schedules/:scheduleId` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.update` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/cancel` | `V1AuthGuard` | team owner/manager | `TeamSchedulesController.cancel` |
| `PUT` | `/api/v1/teams/:teamId/schedules/:scheduleId/attendance/me` | `V1AuthGuard` | any active member (self only) | `ScheduleAttendanceController.setMyAttendance` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/reminders` | `V1AuthGuard` | team owner/manager | `ScheduleRemindersController.triggerReminder` |
| `GET` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | `OptionalV1AuthGuard` | gated by `recruitment.visibility` | `GuestRecruitmentController.get` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | `V1AuthGuard` | team owner/manager | `GuestRecruitmentController.create` |
| `PATCH` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | `V1AuthGuard` | team owner/manager | `GuestRecruitmentController.update` |
| `POST` | `/api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment/applications` | `V1AuthGuard` | any authenticated user | `GuestRecruitmentController.apply` |
| `GET` | `/api/v1/me/schedule` | `V1AuthGuard` | authenticated member | `MyScheduleController.mySchedule` |

Reminders and escalation reuse the existing Task 5 DB-leased worker (`V1GameOperationsWorkerService`) and the existing `NotificationsService` — no second scheduler or notification path was introduced (`ScheduleReminderService`, registered in `v1-game-operations-worker.main.ts`).

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

A non-member or anonymous caller requesting a `TEAM`/`MEMBERS`-visibility schedule always gets `404 NOT_FOUND_OR_ARCHIVED`, never `403` — existence is never leaked for private rows. One residual nuance: `GET .../guest-recruitment`'s existence-hiding is scoped to `recruitment.visibility`, not the parent schedule's own `visibility` — a private (`TEAM`/`MEMBERS`) schedule that has **no recruitment attached at all** returns `404 GUEST_RECRUITMENT_NOT_FOUND` rather than `404 NOT_FOUND_OR_ARCHIVED` to a non-member/anonymous caller, which is a one-bit "this schedule id exists" signal distinct from a truly-nonexistent id. Both codes are 404 and this leaks no schedule content, and IDs are non-enumerable UUIDs, but it is a real (low-severity) side channel worth flagging if this contract is ever revisited.

### 5. Waitlist promotion-on-vacancy (design addition beyond the literal contract)

Not specified verbatim anywhere in the frozen contract, but required for the waitlist to be usable at all: when a caller's own write transitions their prior status away from `GOING` (to `MAYBE`/`NOT_GOING`) on a capacity-limited schedule, the same transaction promotes the lowest-`waitlistPosition` `WAITLISTED` row to `GOING` and compacts remaining positions down by one. See `ScheduleAttendanceService.setMyAttendance`.

### 6. List/`me/schedule` pagination shape is `{items, nextCursor}`, not `{items, pageInfo:{...}}`

An older v1 precedent (`team-matches.service.ts`) returns `{items, pageInfo:{nextCursor,hasNext}}`. Since `global-contract.md`'s opening paragraph freezes `{items,nextCursor}` as the cross-domain default, every Task 12 list endpoint follows that literal shape instead of copying the pre-existing (pre-contract) team-matches convention.

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
- Tests: `apps/v1_api/test/team-schedules/attendance.integration-spec.ts`, `schedule-crud.integration-spec.ts`, `team-schedules.integration-spec.ts` (HTTP contract: guest-recruitment identity/deadline, cancel/reminder interaction, real concurrent version-conflict race, Game-safety)
