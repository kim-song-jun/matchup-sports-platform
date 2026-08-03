import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ScheduleAttendanceService } from '../../src/team-schedules/attendance.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const ids = {
  team: '6c000000-0000-4000-8000-000000000020',
  sport: '6c000000-0000-4000-8000-000000000010',
  region: '6c000000-0000-4000-8000-000000000011',
  owner: '6c000000-0000-4000-8000-000000000001',
  userA: '6c000000-0000-4000-8000-000000000002',
  userB: '6c000000-0000-4000-8000-000000000003',
  userC: '6c000000-0000-4000-8000-000000000004',
  nonMember: '6c000000-0000-4000-8000-000000000005',
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

async function createSchedule(overrides: {
  id: string;
  capacity?: number | null;
  rsvpDeadlineAt?: Date | null;
  state?: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
}) {
  return prisma.v1TeamSchedule.create({
    data: {
      id: overrides.id,
      teamId: ids.team,
      title: 'Task 12 attendance fixture',
      type: 'TRAINING',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T12:00:00.000Z'),
      timezone: 'Asia/Seoul',
      capacity: overrides.capacity ?? null,
      rsvpDeadlineAt: overrides.rsvpDeadlineAt ?? null,
      state: overrides.state ?? 'SCHEDULED',
    },
  });
}

describe('Task 12 attendance lane — ScheduleAttendanceService', () => {
  let service: ScheduleAttendanceService;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 12 attendance lane integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.owner, ids.userA, ids.userB, ids.userC, ids.nonMember].map((id) => ({
        id,
        email: `${id}@example.test`,
        phone: `010${id.slice(-8)}`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task12-attendance-football' },
      update: {},
      create: { id: ids.sport, code: 'task12-attendance-football', name: 'Task 12 Attendance Football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK12_ATTENDANCE_REGION', name: 'Task 12 Attendance Region', level: 2 },
    });
    await prisma.v1Team.create({
      data: {
        id: ids.team,
        ownerUserId: ids.owner,
        sportId: sport.id,
        regionId: ids.region,
        name: 'Task 12 Attendance Team',
      },
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' },
        { teamId: ids.team, userId: ids.userA, role: 'member', status: 'active' },
        { teamId: ids.team, userId: ids.userB, role: 'member', status: 'active' },
        { teamId: ids.team, userId: ids.userC, role: 'member', status: 'active' },
      ],
    });

    moduleRef = await Test.createTestingModule({
      providers: [ScheduleAttendanceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ScheduleAttendanceService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  it('rejects RSVP after the deadline has passed and creates no row', async () => {
    const schedule = await createSchedule({
      id: '6c000000-0000-4000-8000-000000000100',
      rsvpDeadlineAt: new Date(Date.now() - 60_000),
    });
    const error = await captureFailure(() =>
      service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'deadline-key'),
    );
    expectHttpCode(error, 409, 'RSVP_DEADLINE_PASSED');
    expect(await prisma.v1ScheduleAttendance.count({ where: { scheduleId: schedule.id } })).toBe(0);
  });

  it('rejects attendance changes on a non-SCHEDULED schedule', async () => {
    const schedule = await createSchedule({
      id: '6c000000-0000-4000-8000-000000000101',
      state: 'CANCELLED',
    });
    const error = await captureFailure(() =>
      service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'terminal-key'),
    );
    expectHttpCode(error, 409, 'SCHEDULE_NOT_ACTIVE');
  });

  it('rejects a non-member and creates no row', async () => {
    const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000102' });
    const error = await captureFailure(() =>
      service.setMyAttendance(authUser(ids.nonMember), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'nonmember-key'),
    );
    expectHttpCode(error, 403, 'PERMISSION_DENIED');
    expect(await prisma.v1ScheduleAttendance.count({ where: { scheduleId: schedule.id } })).toBe(0);
  });

  it('waitlists a GOING request once capacity is full, and duplicate Idempotency-Key replays the same result', async () => {
    const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000103', capacity: 1 });
    const first = await service.setMyAttendance(
      authUser(ids.userA),
      ids.team,
      schedule.id,
      { status: 'GOING', expectedVersion: 0 },
      'cap-a-key',
    );
    expect(first).toMatchObject({ status: 'GOING', waitlistPosition: null, replayed: false });

    const second = await service.setMyAttendance(
      authUser(ids.userB),
      ids.team,
      schedule.id,
      { status: 'GOING', expectedVersion: 0 },
      'cap-b-key',
    );
    expect(second).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1, replayed: false });
    expect(second.counts).toEqual({ going: 1, maybe: 0, notGoing: 0, waitlisted: 1 });

    const replay = await service.setMyAttendance(
      authUser(ids.userB),
      ids.team,
      schedule.id,
      { status: 'GOING', expectedVersion: 0 },
      'cap-b-key',
    );
    expect(replay).toEqual({ ...second, replayed: true });
    expect(await prisma.v1ScheduleAttendance.count({ where: { scheduleId: schedule.id, userId: ids.userB } })).toBe(1);
  });

  it('never lets two concurrent GOING writers both take the last slot', async () => {
    const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000104', capacity: 1 });
    const [resultA, resultB] = await Promise.all([
      service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'race-a-key'),
      service.setMyAttendance(authUser(ids.userB), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'race-b-key'),
    ]);
    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual(['GOING', 'WAITLISTED']);
    const goingCount = await prisma.v1ScheduleAttendance.count({ where: { scheduleId: schedule.id, status: 'GOING' } });
    expect(goingCount).toBe(1);
    const waitlisted = [resultA, resultB].find((r) => r.status === 'WAITLISTED');
    expect(waitlisted?.waitlistPosition).toBe(1);
  });

  it('rejects a stale expectedVersion with VERSION_CONFLICT and leaves the row unchanged', async () => {
    const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000105' });
    await service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'MAYBE', expectedVersion: 0 }, 'ver-key-1');
    const error = await captureFailure(() =>
      service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'ver-key-2'),
    );
    expectHttpCode(error, 409, 'VERSION_CONFLICT');
    const row = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
      where: { scheduleId_userId: { scheduleId: schedule.id, userId: ids.userA } },
    });
    expect(row.status).toBe('MAYBE');
    expect(row.version).toBe(0);
  });

  it('promotes the lowest-position WAITLISTED user to GOING when a GOING slot frees up', async () => {
    const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000106', capacity: 1 });
    await service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'promo-a-key');
    const waitlistedB = await service.setMyAttendance(
      authUser(ids.userB),
      ids.team,
      schedule.id,
      { status: 'GOING', expectedVersion: 0 },
      'promo-b-key',
    );
    expect(waitlistedB).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });

    await service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'NOT_GOING', expectedVersion: 0 }, 'promo-a-vacate-key');

    const promoted = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
      where: { scheduleId_userId: { scheduleId: schedule.id, userId: ids.userB } },
    });
    expect(promoted.status).toBe('GOING');
    expect(promoted.waitlistPosition).toBeNull();
  });
});
