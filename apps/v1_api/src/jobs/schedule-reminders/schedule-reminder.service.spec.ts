import { ScheduleReminderService } from './schedule-reminder.service';

describe('ScheduleReminderService', () => {
  function fakeNotifications() {
    // Kept only because the constructor still accepts a NotificationsService for compatibility
    // with the un-owned main.ts call site — it is never invoked by the durable delivery path.
    return { emitNotificationToMany: jest.fn() };
  }

  function fakeWebPush() {
    return { sendToUser: jest.fn().mockResolvedValue({ subscriptions: 0, delivered: 0, failed: 0, disabled: true }) };
  }

  const claim = (scheduleId: string, id = 'outbox-1') => ({
    id,
    businessKey: 'schedule:s1:reminder:rsvp_deadline',
    aggregateType: 'V1_TEAM_SCHEDULE',
    aggregateId: scheduleId,
    revisionId: null,
    type: 'SCHEDULE_RSVP_DEADLINE_REMINDER',
    payload: { scheduleId, kind: 'rsvp_deadline' },
    attempts: 0,
    retryGeneration: 0,
    version: 0,
    leaseOwner: 'owner-1',
    leaseUntil: new Date(),
  });

  // T1 regression note: guestRecruitmentCloseReminderHandler ignores claim.type/payload.kind
  // entirely (it only ever reads claim.payload.scheduleId) — feeding it an RSVP-shaped `claim()`
  // fixture below therefore passed even before this helper existed, without proving the guest
  // handler was ever actually exercised with a real guest-recruitment-close event shape. Every
  // guestRecruitmentCloseReminderHandler call in this file uses this dedicated fixture instead.
  const guestClaim = (scheduleId: string, id = 'outbox-1') => ({
    id,
    businessKey: 'schedule:s1:reminder:guest_recruitment_close',
    aggregateType: 'V1_TEAM_SCHEDULE',
    aggregateId: scheduleId,
    revisionId: null,
    type: 'SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER',
    payload: { scheduleId, kind: 'guest_recruitment_close' },
    attempts: 0,
    retryGeneration: 0,
    version: 0,
    leaseOwner: 'owner-1',
    leaseUntil: new Date(),
  });

  function txWith(overrides: {
    lockRows?: unknown[];
    memberRows?: Array<{ userId: string }>;
    preferenceRows?: Array<{ userId: string; teamEnabled: boolean }>;
    createMany?: jest.Mock;
    alreadyDeliveredBusinessKeys?: string[];
  }) {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce(overrides.lockRows ?? [])
      .mockResolvedValueOnce(overrides.memberRows ?? []);
    return {
      $queryRaw: queryRaw,
      v1NotificationPreference: {
        findMany: jest.fn().mockResolvedValue(overrides.preferenceRows ?? []),
      },
      v1Notification: {
        createMany: overrides.createMany ?? jest.fn().mockResolvedValue({ count: overrides.memberRows?.length ?? 0 }),
        // P0-3 fix: deliverDurableReminder() now queries which recipients already have a durable
        // row for this exact outbox claim BEFORE createMany, to decide who genuinely gets pushed.
        // Defaults to "nobody already delivered" so every pre-existing test (none of which cared
        // about this) keeps its original behavior.
        findMany: jest.fn().mockResolvedValue(
          (overrides.alreadyDeliveredBusinessKeys ?? []).map((businessKey) => ({ businessKey })),
        ),
      },
    };
  }

  it('rsvpDeadlineReminderHandler is a no-op once the schedule is no longer SCHEDULED (already cancelled)', async () => {
    const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
    // FG-1 fix: a non-empty memberRows fixture is required here — with the previous empty-array
    // default, `createMany` was never called regardless of the `schedule.state !== 'SCHEDULED'`
    // guard even existing, so removing that guard entirely would not have failed this test.
    const tx = txWith({
      lockRows: [{ id: 's1', teamId: 't1', state: 'CANCELLED' }],
      memberRows: [{ userId: 'u1' }],
    });

    await service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never);

    // The state guard must return before ever reading recipients/preferences, not merely before
    // createMany — assert the whole downstream chain never ran.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.v1NotificationPreference.findMany).not.toHaveBeenCalled();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('rsvpDeadlineReminderHandler is a no-op when the schedule row no longer exists', async () => {
    const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
    const tx = txWith({ lockRows: [], memberRows: [{ userId: 'u1' }] });

    await service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never);

    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('guestRecruitmentCloseReminderHandler is a no-op once the recruitment is already CLOSED', async () => {
    const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
    // FG-1 fix: see the rsvpDeadlineReminderHandler equivalent above for why a real recipient is
    // required to make this guard's removal provably fail the test.
    const tx = txWith({
      lockRows: [{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'CLOSED' }],
      memberRows: [{ userId: 'u3' }],
    });

    await service.guestRecruitmentCloseReminderHandler(guestClaim('s1') as never, tx as never);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.v1NotificationPreference.findMany).not.toHaveBeenCalled();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('rejects a payload without a scheduleId', async () => {
    const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
    const tx = { $queryRaw: jest.fn() };
    const badClaim = { ...claim('s1'), payload: {} };

    await expect(service.rsvpDeadlineReminderHandler(badClaim as never, tx as never)).rejects.toThrow(
      'Schedule reminder payload requires a non-empty scheduleId',
    );
  });

  describe('durable delivery (W1 regression coverage)', () => {
    it('rsvpDeadlineReminderHandler persists exactly one V1Notification per active member through tx, keyed by outboxId:recipient', async () => {
      const webPush = fakeWebPush();
      const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }, { userId: 'u2' }],
      });

      await service.rsvpDeadlineReminderHandler(claim('s1', 'outbox-42') as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            recipientUserId: 'u1',
            targetType: 'team',
            targetId: 't1:s1',
            deepLink: '/teams/t1/schedules/s1',
            businessKey: 'outbox-42:u1',
          }),
          expect.objectContaining({
            recipientUserId: 'u2',
            businessKey: 'outbox-42:u2',
          }),
        ],
        skipDuplicates: true,
      });
    });

    it('guestRecruitmentCloseReminderHandler persists through tx keyed by outboxId:recipient', async () => {
      const webPush = fakeWebPush();
      const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
      const tx = txWith({
        lockRows: [{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'OPEN' }],
        memberRows: [{ userId: 'u3' }],
      });

      await service.guestRecruitmentCloseReminderHandler(guestClaim('s1', 'outbox-7') as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            recipientUserId: 'u3',
            targetType: 'team',
            targetId: 't1:s1',
            deepLink: '/teams/t1/schedules/s1',
            businessKey: 'outbox-7:u3',
          }),
        ],
        skipDuplicates: true,
      });
    });

    it('excludes a recipient whose teamEnabled preference is explicitly false', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }, { userId: 'u2' }],
        preferenceRows: [{ userId: 'u2', teamEnabled: false }],
      });

      await service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never);

      const call = (tx.v1Notification.createMany as jest.Mock).mock.calls[0][0];
      expect(call.data.map((d: { recipientUserId: string }) => d.recipientUserId)).toEqual(['u1']);
    });

    it('skips the durable write entirely (and never calls push) once every recipient has opted out', async () => {
      const webPush = fakeWebPush();
      const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }],
        preferenceRows: [{ userId: 'u1', teamEnabled: false }],
      });

      await service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never);

      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
      expect(webPush.sendToUser).not.toHaveBeenCalled();
    });

    it('W1: a persistence failure propagates out of the handler instead of being swallowed, so the outbox job fails and can retry', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const persistenceError = new Error('connection terminated unexpectedly');
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }],
        createMany: jest.fn().mockRejectedValue(persistenceError),
      });

      await expect(service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never)).rejects.toThrow(
        'connection terminated unexpectedly',
      );
    });

    it('a Web Push failure does not fail the job — the durable notification write already succeeded', async () => {
      const webPush = { sendToUser: jest.fn().mockRejectedValue(new Error('push service unreachable')) };
      const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }],
      });

      await expect(
        service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never),
      ).resolves.toBeUndefined();
      expect(tx.v1Notification.createMany).toHaveBeenCalled();
      // FG-2 fix: the original test never asserted `sendToUser` was actually invoked, so deleting
      // every Web Push call site in this class (the `this.webPush?.sendToUser(...)` call and its
      // constructor plumbing) left this test green. It must actually observe the push attempt.
      expect(webPush.sendToUser).toHaveBeenCalledTimes(1);
      expect(webPush.sendToUser).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ title: '참석 여부를 알려주세요' }),
      );
    });

    it(
      'P0-3 regression: a forced reprocess of the SAME outbox claim never re-pushes Web Push to a ' +
        'recipient who already has a durable notification row for this exact claim, even though ' +
        'createMany is still attempted (skipDuplicates no-ops it at the DB layer)',
      async () => {
        const webPush = fakeWebPush();
        const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
        const tx = txWith({
          lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
          memberRows: [{ userId: 'u1' }],
          // Simulates the exact Trigger-1 scenario from the review: outbox claim `outbox-1` was
          // already fully processed once for u1 (a durable V1Notification row with businessKey
          // `outbox-1:u1` already exists), and the same claim is now being reprocessed (e.g. an
          // operational forced replay, or a retry after the outbox-completion CAS failed post-commit).
          alreadyDeliveredBusinessKeys: ['outbox-1:u1'],
        });

        await service.rsvpDeadlineReminderHandler(claim('s1', 'outbox-1') as never, tx as never);

        expect(tx.v1Notification.createMany).toHaveBeenCalled();
        expect(webPush.sendToUser).not.toHaveBeenCalled();
      },
    );

    it(
      'P0-3: a genuinely new recipient on a reprocessed claim (mixed with an already-delivered ' +
        'one) still gets pushed exactly once',
      async () => {
        const webPush = fakeWebPush();
        const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
        const tx = txWith({
          lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
          memberRows: [{ userId: 'u1' }, { userId: 'u2' }],
          alreadyDeliveredBusinessKeys: ['outbox-1:u1'],
        });

        await service.rsvpDeadlineReminderHandler(claim('s1', 'outbox-1') as never, tx as never);

        expect(webPush.sendToUser).toHaveBeenCalledTimes(1);
        expect(webPush.sendToUser).toHaveBeenCalledWith('u2', expect.anything());
      },
    );

    it('is safe to construct without a webPush dependency (main.ts backward compatibility) and still persists durably', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }],
      });

      await expect(service.rsvpDeadlineReminderHandler(claim('s1') as never, tx as never)).resolves.toBeUndefined();
      expect(tx.v1Notification.createMany).toHaveBeenCalled();
    });
  });
});
