import { ScheduleReminderService } from './schedule-reminder.service';

describe('ScheduleReminderService', () => {
  function fakeNotifications() {
    return { emitNotificationToMany: jest.fn().mockResolvedValue(undefined) };
  }

  const claim = (scheduleId: string) => ({
    id: 'outbox-1',
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

  it('rsvpDeadlineReminderHandler notifies every active team member when the schedule is still SCHEDULED', async () => {
    const notifications = fakeNotifications();
    const service = new ScheduleReminderService(notifications as never);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 's1', teamId: 't1', state: 'SCHEDULED' }])
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);
    const txClient = { $queryRaw: queryRaw };

    await service.rsvpDeadlineReminderHandler(claim('s1') as never, txClient as never);

    expect(notifications.emitNotificationToMany).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'schedule_rsvp_deadline_reminder',
      't1:s1',
    );
  });

  it('rsvpDeadlineReminderHandler is a no-op once the schedule is no longer SCHEDULED (already cancelled)', async () => {
    const notifications = fakeNotifications();
    const service = new ScheduleReminderService(notifications as never);
    const txClient = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 's1', teamId: 't1', state: 'CANCELLED' }]) };

    await service.rsvpDeadlineReminderHandler(claim('s1') as never, txClient as never);

    expect(notifications.emitNotificationToMany).not.toHaveBeenCalled();
  });

  it('rsvpDeadlineReminderHandler is a no-op when the schedule row no longer exists', async () => {
    const notifications = fakeNotifications();
    const service = new ScheduleReminderService(notifications as never);
    const txClient = { $queryRaw: jest.fn().mockResolvedValueOnce([]) };

    await service.rsvpDeadlineReminderHandler(claim('s1') as never, txClient as never);

    expect(notifications.emitNotificationToMany).not.toHaveBeenCalled();
  });

  it('guestRecruitmentCloseReminderHandler notifies active team members while the recruitment is still OPEN', async () => {
    const notifications = fakeNotifications();
    const service = new ScheduleReminderService(notifications as never);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'OPEN' }])
      .mockResolvedValueOnce([{ userId: 'u3' }]);
    const txClient = { $queryRaw: queryRaw };

    await service.guestRecruitmentCloseReminderHandler(claim('s1') as never, txClient as never);

    expect(notifications.emitNotificationToMany).toHaveBeenCalledWith(
      ['u3'],
      'schedule_guest_recruitment_close_reminder',
      't1:s1',
    );
  });

  it('guestRecruitmentCloseReminderHandler is a no-op once the recruitment is already CLOSED', async () => {
    const notifications = fakeNotifications();
    const service = new ScheduleReminderService(notifications as never);
    const txClient = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 'r1', scheduleId: 's1', teamId: 't1', state: 'CLOSED' }]),
    };

    await service.guestRecruitmentCloseReminderHandler(claim('s1') as never, txClient as never);

    expect(notifications.emitNotificationToMany).not.toHaveBeenCalled();
  });

  it('rejects a payload without a scheduleId', async () => {
    const notifications = fakeNotifications();
    const service = new ScheduleReminderService(notifications as never);
    const txClient = { $queryRaw: jest.fn() };
    const badClaim = { ...claim('s1'), payload: {} };

    await expect(service.rsvpDeadlineReminderHandler(badClaim as never, txClient as never)).rejects.toThrow(
      'Schedule reminder payload requires a non-empty scheduleId',
    );
  });
});
