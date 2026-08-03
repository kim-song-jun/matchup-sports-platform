import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import { NotificationsService } from '../../notifications/notifications.service';

type LockedSchedule = {
  id: string;
  teamId: string;
  state: string;
};

type LockedRecruitment = {
  id: string;
  scheduleId: string;
  teamId: string;
  state: string;
};

/**
 * Task 12 reminders lane — mirrors GameResultSubmittedEscalationService's shape (Task 9) but,
 * per user decision #3 ("reuse the existing NotificationsService rather than a second
 * notification path"), needs a live NotificationsService dependency. Unlike the Task 9 handler
 * classes (which have no DI deps and are `new`'d inline inside
 * V1GameOperationsWorkerService's constructor), this class is `new`'d in
 * v1-game-operations-worker.main.ts after `app.get(NotificationsService)` resolves, once
 * WorkerNotificationsModule (the narrow, worker-only module declaring just
 * NotificationsService/WebPushService with a non-realtime REALTIME_NOTIFIER binding — see
 * worker-notifications.module.ts) is imported into V1GameOperationsWorkerModule.
 *
 * Each handler locks the target row FOR UPDATE inside the worker's transaction, re-checks the
 * current state (no-op if the schedule was cancelled or the recruitment already closed since
 * the reminder was scheduled — the same "skip if state already changed" guard Task 9 uses),
 * then notifies every active team member (owner/manager/member) via
 * NotificationsService.emitNotificationToMany. The actual outbox row (with its
 * `ON CONFLICT (business_key) DO NOTHING` dedup) is inserted by
 * TeamSchedulesService.triggerReminder — this class only fires once the worker claims a due row.
 */
export class ScheduleReminderService {
  constructor(private readonly notifications: NotificationsService) {}

  readonly rsvpDeadlineReminderHandler: GameOperationHandler = async (claim, tx) => {
    const scheduleId = this.scheduleId(claim.payload);
    const schedule = await this.lockSchedule(tx, scheduleId);
    if (schedule === null || schedule.state !== 'SCHEDULED') return;

    const recipients = await this.activeTeamMemberIds(tx, schedule.teamId);
    if (recipients.length === 0) return;

    await this.notifications.emitNotificationToMany(
      recipients,
      'schedule_rsvp_deadline_reminder',
      `${schedule.teamId}:${schedule.id}`,
    );
  };

  readonly guestRecruitmentCloseReminderHandler: GameOperationHandler = async (claim, tx) => {
    const scheduleId = this.scheduleId(claim.payload);
    const recruitment = await this.lockRecruitment(tx, scheduleId);
    if (recruitment === null || recruitment.state !== 'OPEN') return;

    const recipients = await this.activeTeamMemberIds(tx, recruitment.teamId);
    if (recipients.length === 0) return;

    await this.notifications.emitNotificationToMany(
      recipients,
      'schedule_guest_recruitment_close_reminder',
      `${recruitment.teamId}:${recruitment.scheduleId}`,
    );
  };

  private scheduleId(payload: unknown): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('scheduleId' in payload) ||
      typeof (payload as { scheduleId?: unknown }).scheduleId !== 'string' ||
      (payload as { scheduleId: string }).scheduleId.trim().length === 0
    ) {
      throw new Error('Schedule reminder payload requires a non-empty scheduleId');
    }
    return (payload as { scheduleId: string }).scheduleId.trim();
  }

  private async lockSchedule(tx: Prisma.TransactionClient, scheduleId: string): Promise<LockedSchedule | null> {
    const rows = await tx.$queryRaw<LockedSchedule[]>`
      SELECT id, team_id AS "teamId", state::text AS state
      FROM v1_team_schedules
      WHERE id = ${scheduleId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async lockRecruitment(
    tx: Prisma.TransactionClient,
    scheduleId: string,
  ): Promise<LockedRecruitment | null> {
    const rows = await tx.$queryRaw<LockedRecruitment[]>`
      SELECT recruitment.id, recruitment.schedule_id AS "scheduleId", recruitment.state::text AS state,
             schedule.team_id AS "teamId"
      FROM v1_schedule_guest_recruitments recruitment
      INNER JOIN v1_team_schedules schedule ON schedule.id = recruitment.schedule_id
      WHERE recruitment.schedule_id = ${scheduleId}
      FOR UPDATE OF recruitment
    `;
    return rows[0] ?? null;
  }

  // No role filter: "every active team member (owner/manager/member)" per the reminder design —
  // all three roles are included, so the role column is not restricted here.
  private async activeTeamMemberIds(tx: Prisma.TransactionClient, teamId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT membership.user_id AS "userId"
      FROM v1_team_memberships membership
      INNER JOIN v1_users u ON u.id = membership.user_id
      WHERE membership.team_id = ${teamId}
        AND membership.status = 'active'
        AND u.account_status = 'active'
    `;
    return rows.map((r) => r.userId);
  }
}
