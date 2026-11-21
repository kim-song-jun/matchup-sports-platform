import { Test, type TestingModule } from '@nestjs/testing';
import { ScheduleReminderService } from '../../src/jobs/schedule-reminders/schedule-reminder.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamSchedulesService } from '../../src/team-schedules/team-schedules.service';

/** 응답 마감 자동 리마인더: 마감 3시간 전에 예약되고, 아직 응답하지 않은 팀원에게만 간다. */
const ids = {
  team: '6e000000-0000-4000-8000-000000000020',
  sport: '6e000000-0000-4000-8000-000000000010',
  region: '6e000000-0000-4000-8000-000000000011',
  owner: '6e000000-0000-4000-8000-000000000001',
  manager: '6e000000-0000-4000-8000-000000000002',
  memberGoing: '6e000000-0000-4000-8000-000000000003',
  memberNotGoing: '6e000000-0000-4000-8000-000000000004',
  memberSilent: '6e000000-0000-4000-8000-000000000005',
} as const;
const everyone = Object.values(ids).filter((id) => id !== ids.team && id !== ids.sport && id !== ids.region);

const prisma = new PrismaService();
const authUser = (id: string) => ({ id, email: `${id}@example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });
const HOUR = 60 * 60 * 1_000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR);

describe('응답 마감 자동 리마인더', () => {
  let service: TeamSchedulesService;
  let moduleRef: TestingModule | undefined;
  let keySeq = 0;

  const create = (over: Record<string, unknown> = {}) =>
    service.create(
      authUser(ids.owner),
      ids.team,
      { title: '자동 리마인더', type: 'TRAINING' as const, startAt: at(72).toISOString(), endAt: at(74).toISOString(), timezone: 'Asia/Seoul', ...over },
      `auto-reminder-${(keySeq += 1)}-${Date.now()}`,
    ) as Promise<{ id: string; version: number }>;
  const reminderRows = (scheduleId: string) =>
    prisma.v1OutboxEvent.findMany({ where: { aggregateId: scheduleId, type: 'SCHEDULE_RSVP_DEADLINE_REMINDER' }, orderBy: { createdAt: 'asc' } });
  const claimOf = (row: { id: string; businessKey: string; aggregateType: string; aggregateId: string; type: string; payload: unknown }) => ({
    id: row.id, businessKey: row.businessKey, aggregateType: row.aggregateType, aggregateId: row.aggregateId, revisionId: null,
    type: row.type, payload: row.payload, attempts: 0, retryGeneration: 0, version: 0, leaseOwner: 'test', leaseUntil: new Date(),
  });
  const recipientsOf = async (outboxId: string) =>
    (await prisma.v1Notification.findMany({ where: { businessKey: { startsWith: `${outboxId}:` } } })).map((n) => n.recipientUserId).sort();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: everyone.map((id) => ({ id, email: `${id}@example.test`, phone: `010${id.slice(-8)}`, accountStatus: 'active', onboardingStatus: 'completed' })),
    });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'football' }, update: {}, create: { id: ids.sport, code: 'football', name: '자동 리마인더 풋볼' }, select: { id: true } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'AUTO_REMINDER_REGION', name: '자동 리마인더 지역', level: 2 } });
    await prisma.v1Team.create({ data: { id: ids.team, ownerUserId: ids.owner, sportId: sport.id, regionId: ids.region, name: '자동 리마인더 팀' } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' },
        { teamId: ids.team, userId: ids.manager, role: 'manager', status: 'active' },
        { teamId: ids.team, userId: ids.memberGoing, role: 'member', status: 'active' },
        { teamId: ids.team, userId: ids.memberNotGoing, role: 'member', status: 'active' },
        { teamId: ids.team, userId: ids.memberSilent, role: 'member', status: 'active' },
      ],
    });
    moduleRef = await Test.createTestingModule({ providers: [TeamSchedulesService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = moduleRef.get(TeamSchedulesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  it('마감이 24시간 뒤면 마감 3시간 전으로 예약된다', async () => {
    const deadline = at(24);
    const { id } = await create({ rsvpDeadlineAt: deadline.toISOString() });
    const [row] = await reminderRows(id);

    expect(row).toBeDefined();
    expect(Math.abs(row.availableAt.getTime() - (deadline.getTime() - 3 * HOUR))).toBeLessThan(1_000);
    expect(row.payload).toEqual({ scheduleId: id, kind: 'rsvp_deadline', expectedRsvpDeadlineAt: deadline.toISOString(), auto: true });
  });

  it('마감 3시간 전이 밤(21~09시 KST)이면 직전 저녁 20:30 KST 로 앞당겨 예약한다', async () => {
    // 마감 = 현재 기준 1~2일 뒤의 06:00 KST(= 전날 21:00Z). 3시간 전은 03:00 KST 라 밤이다.
    const base = new Date(Date.now() + 48 * HOUR);
    const deadline = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 21, 0));
    const { id } = await create({ rsvpDeadlineAt: deadline.toISOString() });
    const [row] = await reminderRows(id);

    const expected = new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate(), 11, 30)); // 20:30 KST
    expect(row.availableAt.toISOString()).toBe(expected.toISOString());
  });

  it('마감이 없거나 3시간 안으로 가까우면 예약하지 않는다', async () => {
    const none = await create();
    const soon = await create({ rsvpDeadlineAt: at(2).toISOString() });

    expect(await reminderRows(none.id)).toHaveLength(0);
    expect(await reminderRows(soon.id)).toHaveLength(0);
  });

  it('마감을 바꾸면 새 마감으로 새로 예약하고, 옛 예약은 워커가 건너뛴다', async () => {
    const first = at(24);
    const created = await create({ rsvpDeadlineAt: first.toISOString() });
    const second = at(48);
    await service.update(authUser(ids.owner), ids.team, created.id, { expectedVersion: created.version, rsvpDeadlineAt: second.toISOString() }, `auto-reminder-update-${Date.now()}`);

    const rows = await reminderRows(created.id);
    expect(rows.map((row) => (row.payload as { expectedRsvpDeadlineAt: string }).expectedRsvpDeadlineAt)).toEqual([first.toISOString(), second.toISOString()]);

    const worker = new ScheduleReminderService({} as never);
    const stale = rows[0];
    await prisma.$transaction((tx) => worker.rsvpDeadlineReminderHandler(claimOf(stale) as never, tx));
    expect(await recipientsOf(stale.id)).toEqual([]);
  });

  it('이미 참석·불참으로 응답한 팀원은 빼고 아직 응답하지 않은 팀원에게만 알림이 간다', async () => {
    const created = await create({ rsvpDeadlineAt: at(24).toISOString() });
    await prisma.v1ScheduleAttendance.createMany({
      data: [
        { scheduleId: created.id, userId: ids.memberGoing, status: 'GOING' },
        { scheduleId: created.id, userId: ids.memberNotGoing, status: 'NOT_GOING' },
      ],
    });
    const [row] = await reminderRows(created.id);

    const worker = new ScheduleReminderService({} as never);
    await prisma.$transaction((tx) => worker.rsvpDeadlineReminderHandler(claimOf(row) as never, tx));

    expect(await recipientsOf(row.id)).toEqual([ids.owner, ids.manager, ids.memberSilent].sort());
  });

  it('같은 마감에 수동 트리거를 불러도 새 행이 생기지 않고 자동 행의 상태만 돌아온다', async () => {
    const created = await create({ rsvpDeadlineAt: at(24).toISOString() });
    const result = (await service.triggerReminder(authUser(ids.owner), ids.team, created.id, { kind: 'rsvp_deadline' }, `auto-reminder-manual-${Date.now()}`)) as { status: string };

    expect(await reminderRows(created.id)).toHaveLength(1);
    expect(result.status).toBe('PENDING');
  });

  it('전원이 응답했으면 아무에게도 보내지 않는다', async () => {
    const created = await create({ rsvpDeadlineAt: at(24).toISOString() });
    await prisma.v1ScheduleAttendance.createMany({
      data: everyone.map((userId) => ({ scheduleId: created.id, userId, status: 'MAYBE' as const })),
    });
    const [row] = await reminderRows(created.id);

    const worker = new ScheduleReminderService({} as never);
    await prisma.$transaction((tx) => worker.rsvpDeadlineReminderHandler(claimOf(row) as never, tx));

    expect(await recipientsOf(row.id)).toEqual([]);
  });
});
