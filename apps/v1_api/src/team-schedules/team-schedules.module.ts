import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { ScheduleAttendanceController } from './attendance.controller';
import { ScheduleAttendanceService } from './attendance.service';
import { GuestRecruitmentController } from './guest-recruitment.controller';
import { GuestRecruitmentService } from './guest-recruitment.service';
import { MyScheduleController } from './my-schedule.controller';
import { ScheduleRemindersController } from './reminders.controller';
import { TeamSchedulesController } from './team-schedules.controller';
import { TeamSchedulesService } from './team-schedules.service';

// Task 12 (team schedules) is split into five standalone controllers so concurrent edits never
// collide on the same file, all delegating to the one shared TeamSchedulesService (list/create/
// detail/update/cancel/complete/triggerReminder/mySchedule) plus two dedicated services for their
// own lanes (ScheduleAttendanceService, GuestRecruitmentService):
//   - TeamSchedulesController: GET/POST .../schedules, GET/PATCH/cancel/complete .../schedules/:id
//   - ScheduleAttendanceController: PUT .../attendance/me
//   - GuestRecruitmentController: GET/POST/PATCH .../guest-recruitment + POST .../applications
//   - ScheduleRemindersController: POST .../reminders
//   - MyScheduleController: GET me/schedule
// No two controllers register the same method+path (Nest/Express silently shadows on collision
// rather than erroring, so this was verified route-by-route against docs/api/global-contract.md).
// V1AuthGuard/OptionalV1AuthGuard are locally re-provided (not imported via AuthModule) to mirror
// the existing convention in teams.module.ts / team-matches.module.ts. GuestRecruitmentService no
// longer injects NotificationsService (P1-4 fix: the new-guest-application manager notification is
// now a durable outbox row delivered by the worker's ScheduleReminderService handler instead of an
// in-request fire-and-forget call), so NotificationsModule is no longer imported here.
@Module({
  controllers: [
    TeamSchedulesController,
    ScheduleAttendanceController,
    GuestRecruitmentController,
    ScheduleRemindersController,
    MyScheduleController,
  ],
  providers: [
    TeamSchedulesService,
    ScheduleAttendanceService,
    GuestRecruitmentService,
    V1AuthGuard,
    OptionalV1AuthGuard,
  ],
})
export class TeamSchedulesModule {}
