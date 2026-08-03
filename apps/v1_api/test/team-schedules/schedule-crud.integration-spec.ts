import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TeamSchedulesService } from '../../src/team-schedules/team-schedules.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const ids = {
  teamA: '6d000000-0000-4000-8000-000000000020',
  teamB: '6d000000-0000-4000-8000-000000000021',
  sport: '6d000000-0000-4000-8000-000000000010',
  region: '6d000000-0000-4000-8000-000000000011',
  ownerA: '6d000000-0000-4000-8000-000000000001',
  managerA: '6d000000-0000-4000-8000-000000000002',
  memberA: '6d000000-0000-4000-8000-000000000003',
  memberB: '6d000000-0000-4000-8000-000000000004',
  outsider: '6d000000-0000-4000-8000-000000000005',
  otherTeamMatch: '6d000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('Task 12 schedule CRUD/cancel/reminders lane — TeamSchedulesService', () => {
  let service: TeamSchedulesService;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 12 schedule CRUD lane integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.ownerA, ids.managerA, ids.memberA, ids.memberB, ids.outsider].map((id) => ({
        id,
        email: `${id}@example.test`,
        phone: `010${id.slice(-8)}`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task12-schedule-crud-football' },
      update: {},
      create: { id: ids.sport, code: 'task12-schedule-crud-football', name: 'Task 12 Schedule CRUD Football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK12_SCHEDULE_CRUD_REGION', name: 'Task 12 Schedule CRUD Region', level: 2 },
    });
    await prisma.v1Team.create({
      data: { id: ids.teamA, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 12 Team A' },
    });
    await prisma.v1Team.create({
      data: { id: ids.teamB, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 12 Team B' },
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamA, userId: ids.managerA, role: 'manager', status: 'active' },
        { teamId: ids.teamA, userId: ids.memberA, role: 'member', status: 'active' },
      ],
    });
    // teamMatch hosted by teamB, unrelated to teamA — used for the cross-team ownership check.
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.otherTeamMatch,
        hostTeamId: ids.teamB,
        createdByUserId: ids.ownerA,
        sportId: sport.id,
        regionId: ids.region,
        title: 'Task 12 unrelated team match',
        placeName: 'Task 12 ground',
        startAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    moduleRef = await Test.createTestingModule({
      providers: [TeamSchedulesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TeamSchedulesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  const baseDto = () => ({
    title: 'Task 12 CRUD fixture',
    type: 'TRAINING' as const,
    startAt: '2026-09-10T10:00:00.000Z',
    endAt: '2026-09-10T12:00:00.000Z',
    timezone: 'Asia/Seoul',
  });

  it('rejects a MATCH-type schedule with no teamMatchId', async () => {
    const error = await captureFailure(() =>
      service.create(authUser(ids.ownerA), ids.teamA, { ...baseDto(), type: 'MATCH' } as never, 'match-source-key'),
    );
    expectHttpCode(error, 422, 'SCHEDULE_MATCH_SOURCE_REQUIRED');
  });

  it('rejects a teamMatchId that does not belong to this team', async () => {
    const error = await captureFailure(() =>
      service.create(
        authUser(ids.ownerA),
        ids.teamA,
        { ...baseDto(), type: 'MATCH', teamMatchId: ids.otherTeamMatch } as never,
        'match-cross-team-key',
      ),
    );
    expectHttpCode(error, 404, 'TEAM_MATCH_NOT_FOUND_FOR_TEAM');
  });

  it('rejects a plain member updating a schedule and leaves the row unchanged', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'member-cannot-edit-create-key');
    const scheduleId = (created as { id: string }).id;

    const error = await captureFailure(() =>
      service.update(
        authUser(ids.memberA),
        ids.teamA,
        scheduleId,
        { expectedVersion: 0, title: 'Hijacked title' },
        'member-cannot-edit-key',
      ),
    );
    expectHttpCode(error, 403, 'PERMISSION_DENIED');

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(row.title).toBe(baseDto().title);
    expect(row.version).toBe(0);
  });

  it('rejects a stale expectedVersion on update and leaves the row unchanged', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'ver-conflict-create-key');
    const scheduleId = (created as { id: string }).id;
    await service.update(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0, title: 'First edit' }, 'ver-edit-1');

    const error = await captureFailure(() =>
      service.update(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0, title: 'Stale edit' }, 'ver-edit-2'),
    );
    expectHttpCode(error, 409, 'VERSION_CONFLICT');

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(row.title).toBe('First edit');
    expect(row.version).toBe(1);
  });

  it('cancel is a state transition (never a delete) and closes an attached OPEN guest recruitment', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'cancel-create-key');
    const scheduleId = (created as { id: string }).id;
    await prisma.v1ScheduleGuestRecruitment.create({
      data: { scheduleId, slots: 2, closesAt: new Date('2026-09-09T00:00:00.000Z'), state: 'OPEN' },
    });

    const result = await service.cancel(
      authUser(ids.ownerA),
      ids.teamA,
      scheduleId,
      { expectedVersion: 0, cancelReason: 'Rained out' },
      'cancel-key',
    );
    expect(result).toMatchObject({ state: 'cancelled', version: 1 });

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(row.state).toBe('CANCELLED');
    expect(row.cancelReason).toBe('Rained out');

    const recruitment = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId } });
    expect(recruitment.state).toBe('CLOSED');

    // Already-terminal: a second cancel attempt (even with the original version) must reject,
    // not delete or re-cancel.
    const error = await captureFailure(() =>
      service.cancel(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0, cancelReason: 'again' }, 'cancel-key-2'),
    );
    expectHttpCode(error, 409, 'SCHEDULE_TERMINAL');
  });

  it('cross-team access to a TEAM-visibility schedule 404s for a non-member, but PUBLIC is visible anonymously', async () => {
    const teamVisible = await service.create(
      authUser(ids.ownerA),
      ids.teamA,
      { ...baseDto(), visibility: 'TEAM' },
      'visibility-team-key',
    );
    const publicVisible = await service.create(
      authUser(ids.ownerA),
      ids.teamA,
      { ...baseDto(), visibility: 'PUBLIC' },
      'visibility-public-key',
    );

    const hiddenError = await captureFailure(() =>
      service.detail(authUser(ids.outsider), ids.teamA, (teamVisible as { id: string }).id),
    );
    expectHttpCode(hiddenError, 404, 'NOT_FOUND_OR_ARCHIVED');

    const anonymousHiddenError = await captureFailure(() =>
      service.detail(null, ids.teamA, (teamVisible as { id: string }).id),
    );
    expectHttpCode(anonymousHiddenError, 404, 'NOT_FOUND_OR_ARCHIVED');

    const visible = await service.detail(null, ids.teamA, (publicVisible as { id: string }).id);
    expect(visible).toMatchObject({ id: (publicVisible as { id: string }).id, visibility: 'PUBLIC' });
  });

  it('duplicate reminder trigger under a fresh Idempotency-Key never creates a second outbox row', async () => {
    const created = await service.create(
      authUser(ids.ownerA),
      ids.teamA,
      { ...baseDto(), rsvpDeadlineAt: '2026-09-09T00:00:00.000Z' },
      'reminder-create-key',
    );
    const scheduleId = (created as { id: string }).id;

    const first = await service.triggerReminder(
      authUser(ids.ownerA),
      ids.teamA,
      scheduleId,
      { kind: 'rsvp_deadline' },
      'reminder-key-1',
    );
    const second = await service.triggerReminder(
      authUser(ids.ownerA),
      ids.teamA,
      scheduleId,
      { kind: 'rsvp_deadline' },
      'reminder-key-2',
    );

    expect((first as { jobId: string }).jobId).toBe((second as { jobId: string }).jobId);
    const outboxCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM v1_outbox_events WHERE business_key = ${`schedule:${scheduleId}:reminder:rsvp_deadline`}
    `;
    expect(Number(outboxCount[0].count)).toBe(1);
  });

  it('rejects a reminder trigger for guest_recruitment_close when no recruitment is attached', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'reminder-no-recruitment-key');
    const scheduleId = (created as { id: string }).id;

    const error = await captureFailure(() =>
      service.triggerReminder(
        authUser(ids.ownerA),
        ids.teamA,
        scheduleId,
        { kind: 'guest_recruitment_close' },
        'reminder-missing-recruitment-key',
      ),
    );
    expectHttpCode(error, 404, 'GUEST_RECRUITMENT_NOT_FOUND');
  });
});
