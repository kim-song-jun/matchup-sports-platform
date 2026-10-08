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
    /** 일정이 연결된 팀매치와 그 리그가 보류인지 — 기본은 리그 경기 아님. */
    teamMatchId?: string | null;
    heldLeague?: boolean;
  }) {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce(overrides.lockRows ?? [])
      .mockResolvedValueOnce(overrides.memberRows ?? []);
    return {
      $queryRaw: queryRaw,
      v1TeamSchedule: { findUnique: jest.fn().mockResolvedValue({ teamMatchId: overrides.teamMatchId ?? null }) },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(overrides.heldLeague ? 1 : 0) },
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

  it('rsvpDeadlineReminderHandler is a no-op when the schedule belongs to a fixture of a league on hold', async () => {
    const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
    const createMany = jest.fn();
    const tx = txWith({
      lockRows: [{ id: 'schedule-1', teamId: 'team-1', state: 'SCHEDULED', rsvpDeadlineAt: null }],
      memberRows: [{ userId: 'u1' }],
      createMany,
      teamMatchId: 'tm-1',
      heldLeague: true,
    });

    await service.rsvpDeadlineReminderHandler(claim('schedule-1') as never, tx as never);

    expect(tx.v1TeamMatch.count).toHaveBeenCalledWith({ where: { id: 'tm-1', league: { is: { status: 'on_hold' } } } });
    expect(createMany).not.toHaveBeenCalled();
  });

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
      scheduleStartAt?: Date;
    }) {
      return {
        $queryRaw: jest.fn().mockResolvedValueOnce(overrides.managerRows ?? []),
        v1TeamSchedule: {
          findUnique: jest.fn().mockResolvedValue({ startAt: overrides.scheduleStartAt ?? new Date('2026-06-20T10:00:00Z') }),
        },
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

    it('밤(KST 21~9시)에는 알림함 행만 남기고, 그 밤이 끝나기 전에 시작하는 일정일 때만 푸시한다(H1-night)', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-14T14:00:00Z') }); // KST 23:00
      try {
        const later = fakeWebPush();
        const laterTx = txForGuestApplication({ managerRows: [{ userId: 'owner-u1' }], scheduleStartAt: new Date('2026-06-15T01:00:00Z') }); // 다음 날 10:00
        await new ScheduleReminderService(fakeNotifications() as never, later as never).guestApplicationManagerNotificationHandler(guestApplicationClaim() as never, laterTx as never);
        expect(laterTx.v1Notification.createMany).toHaveBeenCalledTimes(1);
        expect(later.sendToUser).not.toHaveBeenCalled();

        const early = fakeWebPush();
        const earlyTx = txForGuestApplication({ managerRows: [{ userId: 'owner-u1' }], scheduleStartAt: new Date('2026-06-14T22:00:00Z') }); // 다음 날 07:00
        await new ScheduleReminderService(fakeNotifications() as never, early as never).guestApplicationManagerNotificationHandler(guestApplicationClaim() as never, earlyTx as never);
        expect(early.sendToUser).toHaveBeenCalledWith('owner-u1', expect.objectContaining({ url: '/teams/t1/schedules/s1' }));
      } finally {
        jest.useRealTimers();
      }
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

  describe('Task 180 H1: 일정 생성·취소 알림', () => {
    // KST 6/14 12:00 — 낮. 일정은 KST 6/16 (화) 19:00.
    const baseSchedule = {
      id: 's1',
      teamId: 't1',
      title: '화요일 정기 훈련',
      startAt: new Date('2026-06-16T10:00:00Z'),
      state: 'SCHEDULED',
      visibility: 'TEAM',
      cancelReason: null as string | null,
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-06-14T03:00:00Z') });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    function noticeTx(options: {
      schedule?: Partial<typeof baseSchedule>;
      members?: string[];
      notGoing?: string[];
      approvedGuests?: string[];
      activeAccounts?: string[];
    }) {
      const activeAccounts = options.activeAccounts ?? options.approvedGuests ?? [];
      return {
        $queryRaw: jest.fn().mockResolvedValue((options.members ?? []).map((userId) => ({ userId }))),
        v1TeamSchedule: { findUnique: jest.fn().mockResolvedValue({ ...baseSchedule, ...options.schedule }) },
        v1Team: { findUnique: jest.fn().mockResolvedValue({ name: '마포 FC' }) },
        v1ScheduleAttendance: {
          findMany: jest.fn(({ where }: { where: { status: string } }) =>
            Promise.resolve(where.status === 'NOT_GOING' ? (options.notGoing ?? []).map((userId) => ({ userId })) : []),
          ),
        },
        v1ScheduleGuestApplication: {
          findMany: jest.fn().mockResolvedValue((options.approvedGuests ?? []).map((userId) => ({ userId }))),
        },
        v1User: {
          findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
            Promise.resolve(where.id.in.filter((id) => activeAccounts.includes(id)).map((id) => ({ id }))),
          ),
        },
        v1NotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
        v1Notification: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
    }

    const noticeClaim = (type: string, actorUserId = 'owner') => ({
      id: 'outbox-n1',
      businessKey: `schedule:s1:${type}`,
      aggregateType: 'V1_TEAM_SCHEDULE',
      aggregateId: 's1',
      revisionId: null,
      type,
      payload: { scheduleId: 's1', actorUserId },
      attempts: 0,
      retryGeneration: 0,
      version: 0,
      leaseOwner: 'owner-1',
      leaseUntil: new Date(),
    });

    const sentRows = (tx: ReturnType<typeof noticeTx>) =>
      tx.v1Notification.createMany.mock.calls.flatMap(([arg]) => arg.data) as Array<Record<string, string>>;

    it('새 일정은 만든 사람을 뺀 활성 멤버 전원에게 "참석 여부를 알려 주세요"로 가고 일정 상세로 착지한다', async () => {
      const webPush = fakeWebPush();
      const tx = noticeTx({ members: ['owner', 'm1', 'm2'] });
      await new ScheduleReminderService(fakeNotifications() as never, webPush as never).scheduleCreatedNotificationHandler(
        noticeClaim('SCHEDULE_CREATED_NOTIFICATION') as never,
        tx as never,
      );

      expect(sentRows(tx).map((row) => row.recipientUserId)).toEqual(['m1', 'm2']);
      expect(sentRows(tx)[0]).toMatchObject({
        targetType: 'team',
        targetId: 't1:s1',
        title: '새 일정이 올라왔어요',
        body: '"마포 FC" · 화요일 정기 훈련 · 6/16 (화) 19:00. 참석 여부를 알려 주세요.',
        deepLink: '/teams/t1/schedules/s1',
      });
      expect(webPush.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('워커가 받기 전에 취소된 일정이면 새 일정 알림을 보내지 않는다', async () => {
      const tx = noticeTx({ members: ['owner', 'm1'], schedule: { state: 'CANCELLED', cancelReason: '우천' } });
      await new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never).scheduleCreatedNotificationHandler(
        noticeClaim('SCHEDULE_CREATED_NOTIFICATION') as never,
        tx as never,
      );

      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });

    it('밤에 만든 일정은 알림함에만 남기고, 그 밤이 끝나기 전에 시작하는 일정만 푸시한다', async () => {
      jest.setSystemTime(new Date('2026-06-14T14:00:00Z')); // KST 23:00
      const later = fakeWebPush();
      const laterTx = noticeTx({ members: ['owner', 'm1'] }); // 6/16 19:00
      await new ScheduleReminderService(fakeNotifications() as never, later as never).scheduleCreatedNotificationHandler(
        noticeClaim('SCHEDULE_CREATED_NOTIFICATION') as never,
        laterTx as never,
      );
      expect(sentRows(laterTx).map((row) => row.recipientUserId)).toEqual(['m1']);
      expect(later.sendToUser).not.toHaveBeenCalled();

      const early = fakeWebPush();
      const earlyTx = noticeTx({ members: ['owner', 'm1'], schedule: { startAt: new Date('2026-06-14T22:00:00Z') } }); // 다음 날 07:00
      await new ScheduleReminderService(fakeNotifications() as never, early as never).scheduleCreatedNotificationHandler(
        noticeClaim('SCHEDULE_CREATED_NOTIFICATION') as never,
        earlyTx as never,
      );
      expect(early.sendToUser).toHaveBeenCalledWith('m1', expect.objectContaining({ title: '새 일정이 올라왔어요' }));
    });

    it('취소는 "불참"이라고 답한 사람과 취소한 본인을 빼고, 응답하지 않은 사람에게도 사유를 그대로 싣는다', async () => {
      const tx = noticeTx({
        members: ['owner', 'going', 'no-answer', 'not-going'],
        notGoing: ['not-going'],
        schedule: { state: 'CANCELLED', cancelReason: '우천으로 취소해요.' },
      });
      await new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never).scheduleCancelledNotificationHandler(
        noticeClaim('SCHEDULE_CANCELLED_NOTIFICATION') as never,
        tx as never,
      );

      expect(sentRows(tx).map((row) => row.recipientUserId)).toEqual(['going', 'no-answer']);
      expect(sentRows(tx)[0]).toMatchObject({
        title: '일정이 취소됐어요',
        body: '"마포 FC" · 화요일 정기 훈련(6/16 (화) 19:00) · 우천으로 취소해요.',
        deepLink: '/teams/t1/schedules/s1',
      });
    });

    it('승인된 용병은 공개 일정일 때만 받는다 — 비공개 일정 상세는 비멤버에게 열리지 않는다', async () => {
      const cancelled = { state: 'CANCELLED', cancelReason: '구장 사정' };
      const publicTx = noticeTx({
        members: ['owner', 'm1'],
        approvedGuests: ['guest-active', 'guest-suspended'],
        activeAccounts: ['guest-active'],
        schedule: { ...cancelled, visibility: 'PUBLIC' },
      });
      const service = new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never);
      await service.scheduleCancelledNotificationHandler(noticeClaim('SCHEDULE_CANCELLED_NOTIFICATION') as never, publicTx as never);
      expect(sentRows(publicTx).map((row) => row.recipientUserId)).toEqual(['m1', 'guest-active']);

      const teamOnlyTx = noticeTx({ members: ['owner', 'm1'], approvedGuests: ['guest-active'], schedule: cancelled });
      await service.scheduleCancelledNotificationHandler(noticeClaim('SCHEDULE_CANCELLED_NOTIFICATION') as never, teamOnlyTx as never);
      expect(sentRows(teamOnlyTx).map((row) => row.recipientUserId)).toEqual(['m1']);
    });

    it('아직 취소되지 않은 일정이면 취소 알림을 보내지 않는다', async () => {
      const tx = noticeTx({ members: ['owner', 'm1'] });
      await new ScheduleReminderService(fakeNotifications() as never, fakeWebPush() as never).scheduleCancelledNotificationHandler(
        noticeClaim('SCHEDULE_CANCELLED_NOTIFICATION') as never,
        tx as never,
      );

      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });
  });
});
