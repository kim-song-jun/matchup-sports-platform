import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { WebPushService } from '../../notifications/web-push.service';

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

type ReminderEvent = {
  /** Compound "${teamId}:${scheduleId}" — matches NotificationsService's own targetId shape for these events. */
  targetId: string;
  deepLink: string;
  title: string;
  body: string;
};

// Mirrors NotificationsService's EVENT_TITLES/EVENT_BODIES entries for these two event types
// exactly (see notifications.service.ts). Duplicated locally — not imported — because those
// tables are module-private there and this class must not depend on
// NotificationsService.emitNotificationToMany for persistence (see deliverDurableReminder below).
const RSVP_REMINDER_COPY = {
  title: '참석 여부를 알려주세요',
  body: 'RSVP 마감 전에 참석 여부를 남겨주세요.',
} as const;

const GUEST_RECRUITMENT_CLOSE_REMINDER_COPY = {
  title: '용병 모집이 곧 마감돼요',
  body: '모집 마감 전에 신청 현황을 확인해 주세요.',
} as const;

/**
 * Task 12 reminders lane — mirrors GameResultSubmittedEscalationService's shape (Task 9): each
 * handler locks the target row FOR UPDATE inside the worker's transaction, re-checks the current
 * state (no-op if the schedule was cancelled or the recruitment already closed since the reminder
 * was scheduled), then durably notifies every active team member (owner/manager/member).
 *
 * `new`'d in v1-game-operations-worker.main.ts after `app.get(NotificationsService)` resolves,
 * once WorkerNotificationsModule (the narrow, worker-only module declaring just
 * NotificationsService/WebPushService with a non-realtime REALTIME_NOTIFIER binding — see
 * worker-notifications.module.ts) is imported into V1GameOperationsWorkerModule.
 *
 * Fix (W1, durable-delivery defect — see review/git history): the constructor originally took
 * `NotificationsService` and each handler called `notifications.emitNotificationToMany(...)`, then
 * `await`ed it. But `emitNotificationToMany` is fire-and-forget BY DESIGN for the HTTP path — it
 * launches `createNotificationWithPrefCheck(...)` against `NotificationsService`'s own
 * `this.prisma` (a connection entirely separate from this worker's `tx`) without awaiting it, and
 * swallows every failure (its docblock: "Notification failures must NEVER propagate to the
 * caller's transaction or response"). Awaiting `emitNotificationToMany` therefore only awaited the
 * synchronous `for` loop that *kicks off* those detached promises, not their completion. The
 * result: the worker's transaction (and therefore the outbox row's COMPLETED transition) could
 * commit before any V1Notification row existed, or even if the detached create ultimately
 * rejected — silent data loss the outbox's retry mechanism could never see or correct.
 *
 * `deliverDurableReminder()` below fixes this by writing directly through `tx` — the SAME
 * transaction the worker uses to lock the source row and mark the outbox claim COMPLETED. If that
 * write throws, the error propagates out of the handler, the worker's `$transaction` rolls back
 * (no COMPLETED transition), and `V1GameOperationsWorkerService.fail()` puts the outbox row back
 * in RETRY. The `notifications: NotificationsService` constructor parameter is kept ONLY because
 * v1-game-operations-worker.main.ts (outside this lane's ownership) still constructs this class
 * with `new ScheduleReminderService(notifications)`; it is no longer used for persistence. The
 * `webPush` parameter is new and optional so that construction stays backward compatible until
 * main.ts is updated to also pass `app.get(WebPushService)` — see the deferred note this fix ships
 * with. Until that wiring lands, reminders are durably persisted and visible in-app but do not
 * additionally trigger a Web Push; that is a strictly better failure mode than before (no
 * notification silently lost) and never a regression relative to the last known-correct behavior.
 */
export class ScheduleReminderService {
  constructor(
    // Kept only for the un-owned main.ts call site's existing constructor arity — no longer used
    // for persistence; see class docblock.
    private readonly notifications: NotificationsService,
    private readonly webPush?: WebPushService,
  ) {}

  readonly rsvpDeadlineReminderHandler: GameOperationHandler = async (claim, tx) => {
    const scheduleId = this.scheduleId(claim.payload);
    const schedule = await this.lockSchedule(tx, scheduleId);
    if (schedule === null || schedule.state !== 'SCHEDULED') return;

    const recipients = await this.activeTeamMemberIds(tx, schedule.teamId);
    if (recipients.length === 0) return;

    await this.deliverDurableReminder(tx, claim.id, recipients, {
      targetId: `${schedule.teamId}:${schedule.id}`,
      deepLink: `/teams/${schedule.teamId}/schedules/${schedule.id}`,
      ...RSVP_REMINDER_COPY,
    });
  };

  readonly guestRecruitmentCloseReminderHandler: GameOperationHandler = async (claim, tx) => {
    const scheduleId = this.scheduleId(claim.payload);
    const recruitment = await this.lockRecruitment(tx, scheduleId);
    if (recruitment === null || recruitment.state !== 'OPEN') return;

    const recipients = await this.activeTeamMemberIds(tx, recruitment.teamId);
    if (recipients.length === 0) return;

    await this.deliverDurableReminder(tx, claim.id, recipients, {
      targetId: `${recruitment.teamId}:${recruitment.scheduleId}`,
      deepLink: `/teams/${recruitment.teamId}/schedules/${recruitment.scheduleId}`,
      ...GUEST_RECRUITMENT_CLOSE_REMINDER_COPY,
    });
  };

  /**
   * Durable delivery for a reminder claim. Everything up to and including the
   * `tx.v1Notification.createMany` call happens inside the caller's transaction (`tx`):
   *
   *   1. Read each recipient's `teamEnabled` preference through `tx` (defaulting to enabled when
   *      no preference row exists — mirrors NotificationsService.createNotificationWithPrefCheck).
   *   2. Create one V1Notification row per enabled recipient through `tx`, with `businessKey`
   *      `${outboxId}:${recipientUserId}` so re-processing the SAME outbox claim (crash + retry,
   *      or any future re-delivery bug) can never produce more than one row per recipient —
   *      `skipDuplicates` absorbs only that exact collision; every other failure (connection loss,
   *      constraint violation, etc.) still throws and propagates.
   *
   * Only once that create has been awaited successfully (i.e. the notification is durable within
   * this transaction) does step 3 best-effort a Web Push per recipient — caught locally so a push
   * failure can never fail the job or roll back the already-durable notification row, and
   * structurally incapable of running before step 2 succeeds.
   *
   * P0-3 fix: Web Push is, and remains, a best-effort/at-least-once channel by design — matching
   * `NotificationsService.createNotificationWithPrefCheck`'s identical fire-and-forget
   * `sendToUser(...).catch(...)` call for the HTTP path, and `WebPushService`'s own documented
   * policy (a push failure must never fail the notification flow; failures land in
   * `V1WebPushFailureLog` for ops visibility instead of an automatic retry — see Task 76's ops
   * dashboard). That is an accepted, system-wide tradeoff, not a defect on its own. The genuine,
   * fixable-without-a-schema-change defect the review found is narrower: because the OUTBOX
   * WORKER (unlike the single-shot HTTP path) retries a claim whose transaction failed to commit
   * fully, a forced reprocess of the SAME outbox claim previously re-sent a Web Push to every
   * recipient every single retry, even though `skipDuplicates` correctly kept the durable
   * `V1Notification` row to exactly one per recipient — the DB row was exactly-once, the push was
   * not even "at-least-once" in the intended sense, it was "once per retry". Querying which
   * recipients already have a durable row for this exact `businessKey` BEFORE issuing `createMany`
   * — and only pushing to the ones that are genuinely new in *this* invocation — closes that gap:
   * a forced re-delivery of an already-fully-delivered claim never re-pushes. A true delivery
   * ledger with per-recipient retry (the review's suggested `(outboxId, recipientUserId, channel)
   * UNIQUE` table) would still be needed to make an individual failed push retryable — that
   * requires a migration and is out of scope here (HARD CONSTRAINTS forbid schema changes); see
   * the Task 12 review response for that residual, explicitly-scoped gap.
   */
  private async deliverDurableReminder(
    tx: Prisma.TransactionClient,
    outboxId: string,
    recipients: string[],
    event: ReminderEvent,
  ): Promise<void> {
    const preferences = await tx.v1NotificationPreference.findMany({
      where: { userId: { in: recipients } },
      select: { userId: true, teamEnabled: true },
    });
    const teamEnabledByUser = new Map(preferences.map((p) => [p.userId, p.teamEnabled] as const));
    const enabledRecipients = recipients.filter((userId) => teamEnabledByUser.get(userId) !== false);
    if (enabledRecipients.length === 0) return;

    const businessKeyFor = (userId: string): string => `${outboxId}:${userId}`;
    const alreadyDelivered = await tx.v1Notification.findMany({
      where: { businessKey: { in: enabledRecipients.map(businessKeyFor) } },
      select: { businessKey: true },
    });
    const alreadyDeliveredKeys = new Set(alreadyDelivered.map((n) => n.businessKey));

    await tx.v1Notification.createMany({
      data: enabledRecipients.map((userId) => ({
        recipientUserId: userId,
        targetType: 'team',
        targetId: event.targetId,
        title: event.title,
        body: event.body,
        deepLink: event.deepLink,
        businessKey: businessKeyFor(userId),
      })),
      skipDuplicates: true,
    });

    const newlyDeliveredRecipients = enabledRecipients.filter((userId) => !alreadyDeliveredKeys.has(businessKeyFor(userId)));

    for (const userId of newlyDeliveredRecipients) {
      void this.webPush
        ?.sendToUser(userId, { title: event.title, body: event.body, url: event.deepLink })
        .catch(() => {
          // Best-effort only, and structurally unreachable before the createMany above has
          // resolved — a push failure must never undo or retry the already-durable notification.
        });
    }
  }

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
