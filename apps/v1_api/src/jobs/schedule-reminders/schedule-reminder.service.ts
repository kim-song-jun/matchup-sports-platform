import { Prisma } from '@prisma/client';
import type { GameOperationClaim, GameOperationHandler } from '../v1-game-operations-worker.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { WebPushService } from '../../notifications/web-push.service';

type LockedSchedule = {
  id: string;
  teamId: string;
  state: string;
  // P1-2 fix: needed so rsvpDeadlineReminderHandler can compare it against the outbox payload's
  // `expectedRsvpDeadlineAt` and no-op a row whose generation the schedule has since moved past.
  rsvpDeadlineAt: Date | null;
};

type LockedRecruitment = {
  id: string;
  scheduleId: string;
  teamId: string;
  state: string;
  // P1-2 fix: needed so guestRecruitmentCloseReminderHandler can compare it against the outbox
  // payload's `expectedRecruitmentVersion` and no-op a stale generation.
  version: number;
  // P1-3 fix: needed so guestRecruitmentCloseReminderHandler can independently confirm the parent
  // schedule is still SCHEDULED — see that handler's own P1-3 comment.
  scheduleState: string;
};

type GuestApplicationNotificationPayload = {
  teamId: string;
  scheduleId: string;
  displayName: string;
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

// P1-4 fix: title only — the body embeds the applicant's displayName, so it is built per-call
// (see guestApplicationManagerNotificationHandler below) rather than as a static constant.
const GUEST_APPLICATION_RECEIVED_TITLE = '용병 신청이 도착했어요';

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

    // P1-2 fix: team-schedules.service.ts's triggerReminder() now folds the rsvpDeadlineAt value
    // that was current at trigger-time into both the outbox business key AND this payload field
    // (`expectedRsvpDeadlineAt`). A row enqueued from BEFORE this fix (or a genuinely different,
    // still-pending row whose target schedule has been rescheduled again since) carries a
    // generation this schedule has since moved past — firing it would notify with a deadline that
    // no longer matches reality. `undefined` (the field is absent entirely, e.g. a pre-fix row)
    // means "no expectation recorded" and is treated exactly like the pre-fix behavior: proceed.
    const expectedRsvpDeadlineAt = this.expectedRsvpDeadlineAt(claim.payload);
    if (expectedRsvpDeadlineAt !== undefined) {
      const currentRsvpDeadlineAt = schedule.rsvpDeadlineAt === null ? null : schedule.rsvpDeadlineAt.toISOString();
      if (currentRsvpDeadlineAt !== expectedRsvpDeadlineAt) return;
    }

    const recipients = await this.activeTeamMemberIds(tx, schedule.teamId);
    if (recipients.length === 0) return;

    await this.deliverDurableReminder(tx, claim, recipients, {
      targetId: `${schedule.teamId}:${schedule.id}`,
      deepLink: `/teams/${schedule.teamId}/schedules/${schedule.id}`,
      ...RSVP_REMINDER_COPY,
    });
  };

  readonly guestRecruitmentCloseReminderHandler: GameOperationHandler = async (claim, tx) => {
    const scheduleId = this.scheduleId(claim.payload);
    const recruitment = await this.lockRecruitment(tx, scheduleId);
    if (recruitment === null || recruitment.state !== 'OPEN') return;

    // P1-3 fix: this previously only checked the recruitment's own state. TeamSchedulesService's
    // cancel() AND complete() both now close an attached OPEN recruitment in the same transaction
    // as the schedule's own terminal transition (see each method's own P1-3 comment) — so in
    // practice a terminal schedule's recruitment should already be unreachable here. This check is
    // defense-in-depth against exactly the class of drift that fix closes: any other terminal
    // transition (present or future) that forgets to also close the child recruitment must not
    // let this handler notify managers about a "closing soon" recruitment on a schedule that has
    // already ended.
    if (recruitment.scheduleState !== 'SCHEDULED') return;

    // P1-2 fix: same generation check as rsvpDeadlineReminderHandler above, scoped to the
    // recruitment's own `version` (which bumps on every mutation of that row — see
    // guest-recruitment.service.ts's updateRecruitment) instead of a specific field, since any
    // mutation of the recruitment can invalidate a previously-scheduled close reminder.
    const expectedRecruitmentVersion = this.expectedRecruitmentVersion(claim.payload);
    if (expectedRecruitmentVersion !== undefined && recruitment.version !== expectedRecruitmentVersion) return;

    const recipients = await this.activeTeamMemberIds(tx, recruitment.teamId);
    if (recipients.length === 0) return;

    await this.deliverDurableReminder(tx, claim, recipients, {
      targetId: `${recruitment.teamId}:${recruitment.scheduleId}`,
      deepLink: `/teams/${recruitment.teamId}/schedules/${recruitment.scheduleId}`,
      ...GUEST_RECRUITMENT_CLOSE_REMINDER_COPY,
    });
  };

  /**
   * P1-4 fix: guest-recruitment.service.ts's createApplication() used to notify managers via a
   * fire-and-forget `NotificationsService.emitToManyDeferred(...)` call kicked off from inside its
   * own `$transaction` callback but never awaited by it, with the recipient lookup running through
   * `this.prisma` (a separate connection from that transaction's `tx`). The notification's own
   * durability was entirely decoupled from the application-creation transaction's commit/rollback:
   * a commit failure after that detached work had already run could notify managers about an
   * application that was never actually persisted, and a process crash between commit and that
   * detached promise's execution could lose the notification forever with no retry path.
   * createApplication() now records a durable outbox row, in the SAME transaction as the
   * application insert, with business key `guest-application:{applicationId}:manager-notification`
   * — this handler claims and delivers it exactly like the two reminder handlers above, reusing
   * the identical durable-notification-write pattern (`deliverDurableReminder`).
   */
  readonly guestApplicationManagerNotificationHandler: GameOperationHandler = async (claim, tx) => {
    const payload = this.guestApplicationPayload(claim.payload);
    const recipients = await this.activeManagerIds(tx, payload.teamId);
    if (recipients.length === 0) return;

    await this.deliverDurableReminder(tx, claim, recipients, {
      targetId: `${payload.teamId}:${payload.scheduleId}`,
      deepLink: `/teams/${payload.teamId}/schedules/${payload.scheduleId}`,
      title: GUEST_APPLICATION_RECEIVED_TITLE,
      body: `"${payload.displayName}"님이 용병 모집에 신청했어요.`,
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
   *
   * **afterCommit boundary (2026-08-27 audit 41/44):** step 3's Web Push used to fire directly
   * inside `tx`'s scope, same as the other three notification sites this audit flagged. That is
   * exactly the "genuinely fixable" bug the P0-3 note above already diagnoses — a *duplicate*
   * push on retry — but it has a second, sharper failure mode: if anything AFTER this call
   * throws (the caller handler keeps running after `deliverDurableReminder` returns, and the
   * worker's own `completeWith` CAS can still fail), the whole `$transaction` this call is
   * nested in rolls back — the just-created V1Notification rows disappear, but the push already
   * left the process and cannot be recalled. The fix moves the send into `claim.afterCommit`
   * (the pattern `identity-link-expiry.service.ts` established) so it only actually fires once
   * the worker's transaction has durably committed. `claim` replaces the old bare `outboxId`
   * string parameter — `businessKeyFor` below reads `claim.id`, which is the same value
   * `outboxId` always was.
   */
  private async deliverDurableReminder(
    tx: Prisma.TransactionClient,
    claim: GameOperationClaim,
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

    const businessKeyFor = (userId: string): string => `${claim.id}:${userId}`;
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
      const send = () =>
        void this.webPush
          ?.sendToUser(userId, { title: event.title, body: event.body, url: event.deepLink })
          .catch(() => {
            // Best-effort only, and structurally unreachable before the createMany above has
            // resolved — a push failure must never undo or retry the already-durable notification.
          });
      // Only fires once the worker's transaction actually commits (see docblock above). Handlers
      // that call this directly with a hand-built claim missing `afterCommit` (unit specs) fall
      // back to sending immediately, preserving those specs' existing assertions.
      if (claim.afterCommit === undefined) {
        send();
      } else {
        claim.afterCommit.push(send);
      }
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

  // P1-2 fix: `undefined` means the field is absent entirely (a pre-fix outbox row, or any other
  // payload shape that never set it) — callers treat that as "no expectation recorded" and proceed
  // exactly like the pre-fix behavior. `null` is a real, valid expected value (no rsvp deadline).
  private expectedRsvpDeadlineAt(payload: unknown): string | null | undefined {
    if (typeof payload !== 'object' || payload === null || !('expectedRsvpDeadlineAt' in payload)) {
      return undefined;
    }
    const value = (payload as { expectedRsvpDeadlineAt: unknown }).expectedRsvpDeadlineAt;
    if (value === null || typeof value === 'string') return value;
    throw new Error('Schedule reminder payload has an invalid expectedRsvpDeadlineAt');
  }

  // P1-2 fix: same "absent means no expectation, proceed" contract as expectedRsvpDeadlineAt above.
  private expectedRecruitmentVersion(payload: unknown): number | undefined {
    if (typeof payload !== 'object' || payload === null || !('expectedRecruitmentVersion' in payload)) {
      return undefined;
    }
    const value = (payload as { expectedRecruitmentVersion: unknown }).expectedRecruitmentVersion;
    if (typeof value !== 'number') {
      throw new Error('Schedule reminder payload has an invalid expectedRecruitmentVersion');
    }
    return value;
  }

  private guestApplicationPayload(payload: unknown): GuestApplicationNotificationPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { teamId?: unknown }).teamId !== 'string' ||
      (payload as { teamId: string }).teamId.trim().length === 0 ||
      typeof (payload as { scheduleId?: unknown }).scheduleId !== 'string' ||
      (payload as { scheduleId: string }).scheduleId.trim().length === 0 ||
      typeof (payload as { displayName?: unknown }).displayName !== 'string' ||
      (payload as { displayName: string }).displayName.trim().length === 0
    ) {
      throw new Error('Guest application notification payload requires teamId, scheduleId, and displayName');
    }
    return payload as GuestApplicationNotificationPayload;
  }

  private async lockSchedule(tx: Prisma.TransactionClient, scheduleId: string): Promise<LockedSchedule | null> {
    const rows = await tx.$queryRaw<LockedSchedule[]>`
      SELECT id, team_id AS "teamId", state::text AS state, rsvp_deadline_at AS "rsvpDeadlineAt"
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
             recruitment.version AS "version", schedule.team_id AS "teamId",
             schedule.state::text AS "scheduleState"
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

  // P1-4 fix: owner/manager only — mirrors the recipient set guest-recruitment.service.ts's
  // createApplication() previously resolved inline via `this.prisma.v1TeamMembership.findMany`.
  private async activeManagerIds(tx: Prisma.TransactionClient, teamId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT membership.user_id AS "userId"
      FROM v1_team_memberships membership
      INNER JOIN v1_users u ON u.id = membership.user_id
      WHERE membership.team_id = ${teamId}
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'manager')
        AND u.account_status = 'active'
    `;
    return rows.map((r) => r.userId);
  }
}
