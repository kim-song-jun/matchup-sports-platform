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
      // P1-3 fix: lockRecruitment's row now also carries the parent schedule's own state
      // (`scheduleState`) — this fixture must supply it as 'SCHEDULED' for this positive-path test
      // to keep passing under the new guard.
      const tx = txWith({
        lockRows: [{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'OPEN', version: 0, scheduleState: 'SCHEDULED' }],
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

    // 2026-08-27 감사 41/44: 워커의 outbox 트랜잭션이 롤백되면 이미 나간 웹 푸시는
    // 되돌릴 수 없다 — claim.afterCommit이 있으면 deliverDurableReminder가 그 안에
    // push만 하고 커밋 전에는 절대 sendToUser를 직접 부르지 않아야 한다.
    it('claim.afterCommit이 주어지면 push를 즉시 보내지 않고 커밋 후 실행할 effect로만 담는다', async () => {
      const webPush = fakeWebPush();
      const service = new ScheduleReminderService(fakeNotifications() as never, webPush as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED' }],
        memberRows: [{ userId: 'u1' }],
      });
      const afterCommit: Array<() => void | Promise<void>> = [];
      const claimWithAfterCommit = { ...claim('s1', 'outbox-99'), afterCommit };

      await service.rsvpDeadlineReminderHandler(claimWithAfterCommit as never, tx as never);

      // 알림 row는 이미 durable하게 만들어졌지만, 아직 워커 트랜잭션이 커밋되지
      // 않았다고 가정하는 시점이라 푸시는 나가면 안 된다.
      expect(tx.v1Notification.createMany).toHaveBeenCalled();
      expect(webPush.sendToUser).not.toHaveBeenCalled();
      expect(afterCommit).toHaveLength(1);

      // 워커가 커밋 확정 뒤 afterCommit을 실행하는 시점을 흉내낸다.
      await afterCommit[0]();
      expect(webPush.sendToUser).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ title: '참석 여부를 알려주세요' }),
      );
    });

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

  describe('P1-2 regression: stale reminder generation is a no-op', () => {
    it('rsvpDeadlineReminderHandler no-ops when expectedRsvpDeadlineAt no longer matches the schedule\'s current rsvpDeadlineAt', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED', rsvpDeadlineAt: new Date('2026-09-10T00:00:00.000Z') }],
        memberRows: [{ userId: 'u1' }],
      });
      const staleClaim = {
        ...claim('s1'),
        payload: { scheduleId: 's1', kind: 'rsvp_deadline', expectedRsvpDeadlineAt: '2026-01-01T00:00:00.000Z' },
      };

      await service.rsvpDeadlineReminderHandler(staleClaim as never, tx as never);

      expect(tx.v1NotificationPreference.findMany).not.toHaveBeenCalled();
      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });

    it('rsvpDeadlineReminderHandler still fires when expectedRsvpDeadlineAt matches the schedule\'s current rsvpDeadlineAt', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txWith({
        lockRows: [{ id: 's1', teamId: 't1', state: 'SCHEDULED', rsvpDeadlineAt: new Date('2026-09-10T00:00:00.000Z') }],
        memberRows: [{ userId: 'u1' }],
      });
      const currentClaim = {
        ...claim('s1'),
        payload: { scheduleId: 's1', kind: 'rsvp_deadline', expectedRsvpDeadlineAt: '2026-09-10T00:00:00.000Z' },
      };

      await service.rsvpDeadlineReminderHandler(currentClaim as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalled();
    });

    it('guestRecruitmentCloseReminderHandler no-ops when expectedRecruitmentVersion no longer matches the recruitment\'s current version', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txWith({
        lockRows: [{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'OPEN', version: 2, scheduleState: 'SCHEDULED' }],
        memberRows: [{ userId: 'u3' }],
      });
      const staleClaim = {
        ...guestClaim('s1'),
        payload: { scheduleId: 's1', kind: 'guest_recruitment_close', expectedRecruitmentVersion: 0 },
      };

      await service.guestRecruitmentCloseReminderHandler(staleClaim as never, tx as never);

      expect(tx.v1NotificationPreference.findMany).not.toHaveBeenCalled();
      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });

    it('guestRecruitmentCloseReminderHandler still fires when expectedRecruitmentVersion matches the recruitment\'s current version', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txWith({
        lockRows: [{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'OPEN', version: 2, scheduleState: 'SCHEDULED' }],
        memberRows: [{ userId: 'u3' }],
      });
      const currentClaim = {
        ...guestClaim('s1'),
        payload: { scheduleId: 's1', kind: 'guest_recruitment_close', expectedRecruitmentVersion: 2 },
      };

      await service.guestRecruitmentCloseReminderHandler(currentClaim as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalled();
    });
  });

  describe('P1-3 regression: guestRecruitmentCloseReminderHandler independently checks the parent schedule state', () => {
    it('no-ops when the recruitment is still OPEN but its parent schedule is no longer SCHEDULED', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      // A recruitment left OPEN on a schedule that has independently become COMPLETED/CANCELLED —
      // the exact drift team-schedules.service.ts's complete()/cancel() fixes now prevent going
      // forward, but this handler must not depend on that alone.
      const tx = txWith({
        lockRows: [{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'OPEN', version: 0, scheduleState: 'COMPLETED' }],
        memberRows: [{ userId: 'u3' }],
      });

      await service.guestRecruitmentCloseReminderHandler(guestClaim('s1') as never, tx as never);

      expect(tx.v1NotificationPreference.findMany).not.toHaveBeenCalled();
      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('P1-4 regression: guestApplicationManagerNotificationHandler durably notifies managers', () => {
    function txForGuestApplication(overrides: {
      managerRows?: Array<{ userId: string }>;
      preferenceRows?: Array<{ userId: string; teamEnabled: boolean }>;
    }) {
      return {
        $queryRaw: jest.fn().mockResolvedValueOnce(overrides.managerRows ?? []),
        v1NotificationPreference: {
          findMany: jest.fn().mockResolvedValue(overrides.preferenceRows ?? []),
        },
        v1Notification: {
          createMany: jest.fn().mockResolvedValue({ count: overrides.managerRows?.length ?? 0 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
    }

    const guestApplicationClaim = (id = 'outbox-app-1') => ({
      id,
      businessKey: 'guest-application:app-1:manager-notification',
      aggregateType: 'V1_SCHEDULE_GUEST_APPLICATION',
      aggregateId: 'app-1',
      revisionId: null,
      type: 'SCHEDULE_GUEST_APPLICATION_MANAGER_NOTIFICATION',
      payload: { teamId: 't1', scheduleId: 's1', displayName: 'Racer A' },
      attempts: 0,
      retryGeneration: 0,
      version: 0,
      leaseOwner: 'owner-1',
      leaseUntil: new Date(),
    });

    it('persists exactly one V1Notification per active manager/owner through tx, keyed by outboxId:recipient', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txForGuestApplication({ managerRows: [{ userId: 'owner-u1' }, { userId: 'manager-u2' }] });

      await service.guestApplicationManagerNotificationHandler(guestApplicationClaim('outbox-app-42') as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            recipientUserId: 'owner-u1',
            targetType: 'team',
            targetId: 't1:s1',
            deepLink: '/teams/t1/schedules/s1',
            title: '용병 신청이 도착했어요',
            body: '"Racer A"님이 용병 모집에 신청했어요.',
            businessKey: 'outbox-app-42:owner-u1',
          }),
          expect.objectContaining({
            recipientUserId: 'manager-u2',
            businessKey: 'outbox-app-42:manager-u2',
          }),
        ],
        skipDuplicates: true,
      });
    });

    it('is a no-op when the team has no active owner/manager', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = txForGuestApplication({ managerRows: [] });

      await service.guestApplicationManagerNotificationHandler(guestApplicationClaim() as never, tx as never);

      expect(tx.v1NotificationPreference.findMany).not.toHaveBeenCalled();
      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });

    it('rejects a payload missing displayName/teamId/scheduleId', async () => {
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      const tx = { $queryRaw: jest.fn() };
      const badClaim = { ...guestApplicationClaim(), payload: { teamId: 't1', scheduleId: 's1' } };

      await expect(service.guestApplicationManagerNotificationHandler(badClaim as never, tx as never)).rejects.toThrow(
        'Guest application notification payload requires teamId, scheduleId, and displayName',
      );
    });
  });
});
