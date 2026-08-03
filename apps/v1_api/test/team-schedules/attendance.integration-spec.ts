import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ScheduleAttendanceService } from '../../src/team-schedules/attendance.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { holdRowLock, isStillPending } from './helpers/lock-barrier';

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

  it(
    'T3 regression: the schedule row lock genuinely serializes two concurrent last-slot GOING ' +
      'writers — proven with a deterministic barrier, not a lucky Promise.all() overlap',
    async () => {
      const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000108', capacity: 1 });

      // Hold a lock on the exact same schedule row setMyAttendance() itself locks. Any concurrent
      // setMyAttendance() call for this schedule cannot even reach its capacity COUNT() until
      // this external holder releases.
      //
      // FG-5 fix: this previously took `FOR UPDATE`, the same lock mode an attendance INSERT's
      // own FK-implied reference to the parent schedule row takes automatically (Postgres takes a
      // `FOR KEY SHARE`-equivalent lock on a referenced row for any INSERT into a table with an FK
      // to it) — so even with production's explicit `SELECT ... FOR UPDATE` schedule lock deleted
      // entirely, the attendance row INSERT's own FK check would still contend with a `FOR UPDATE`
      // holder, and this test would keep "passing" for the wrong reason. `FOR KEY SHARE` is the
      // weakest mode that still conflicts with an explicit `FOR UPDATE` (what the production lock
      // takes) while NOT conflicting with another `FOR KEY SHARE` (what the FK-implied lock takes)
      // — so if the production lock is ever removed, this holder no longer blocks the INSERT and
      // the "still pending" assertions below correctly flip to false.
      const holder = await holdRowLock(
        prisma,
        (tx) => tx.$queryRaw`SELECT id FROM v1_team_schedules WHERE id = ${schedule.id} FOR KEY SHARE`,
      );

      const callA = service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'barrier-a-key');
      const callB = service.setMyAttendance(authUser(ids.userB), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'barrier-b-key');

      // The actual proof of contention: with the lock genuinely held, BOTH calls must still be
      // pending. If the production code ever drops its explicit schedule lock, these calls would
      // race past the (now-unlocked) holder's transaction immediately and this assertion would
      // flip to false, catching the regression directly instead of relying on lucky scheduling.
      const [aPending, bPending] = await Promise.all([isStillPending(callA, 250), isStillPending(callB, 250)]);
      expect(aPending).toBe(true);
      expect(bPending).toBe(true);

      await holder.release();

      const [resultA, resultB] = await Promise.all([callA, callB]);
      const statuses = [resultA.status, resultB.status].sort();
      expect(statuses).toEqual(['GOING', 'WAITLISTED']);
      const goingCount = await prisma.v1ScheduleAttendance.count({ where: { scheduleId: schedule.id, status: 'GOING' } });
      expect(goingCount).toBe(1);
    },
  );

  // L1 fix: the ORIGINAL version of this test asserted that a SECOND expectedVersion:0 call
  // (fresh idempotency key) after a row-creating first call must be a STALE version and reject
  // with 409. That is logically incompatible with the implementation: a freshly-created row's
  // persisted `version` really is 0 (see attendance.service.ts's create branch — `newVersion = 0`,
  // never incremented on creation), and the pre-existing, still-passing "promotes the lowest-
  // position WAITLISTED user..." test below relies on that exact same pattern (create at v0, then
  // a second write also at expectedVersion:0) SUCCEEDING. Two tests in the same suite cannot both
  // be correct against one deterministic implementation if they assert opposite outcomes for the
  // identical input shape — the still-passing promotion test proves version:0 after creation is
  // genuinely current, not stale, so the ORIGINAL "stale version" test was asserting the wrong
  // thing about a correct implementation (a CI-red-for-the-wrong-reason bug, not a production
  // defect). Rewritten below to construct genuine staleness: create (v0) -> a real successful
  // update (v0 -> v1) -> THEN reuse the now-stale v0 token and expect the conflict.
  it('rejects a genuinely stale expectedVersion with VERSION_CONFLICT once the row has actually advanced past it', async () => {
    const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000109' });

    // First call creates the row. Per the implementation, a freshly-created row's persisted
    // version is 0 — it has not yet been mutated, so 0 is not yet stale.
    const created = await service.setMyAttendance(
      authUser(ids.userA),
      ids.team,
      schedule.id,
      { status: 'MAYBE', expectedVersion: 0 },
      'genuine-stale-key-1',
    );
    expect(created).toMatchObject({ status: 'MAYBE', version: 0 });

    // Second call legitimately succeeds: expectedVersion:0 still matches the row's real, current
    // version. This is the write the ORIGINAL (buggy) test wrongly expected to fail with 409.
    const updated = await service.setMyAttendance(
      authUser(ids.userA),
      ids.team,
      schedule.id,
      { status: 'GOING', expectedVersion: 0 },
      'genuine-stale-key-2',
    );
    expect(updated).toMatchObject({ status: 'GOING', version: 1 });

    // Third call reuses expectedVersion:0 again (fresh idempotency key) — NOW it is genuinely
    // stale, since the persisted version has moved to 1. This is the real regression guard: a
    // change that stops advancing the version on a real update (or that lets a truly-stale caller
    // through) fails here.
    const error = await captureFailure(() =>
      service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'NOT_GOING', expectedVersion: 0 }, 'genuine-stale-key-3'),
    );
    expectHttpCode(error, 409, 'VERSION_CONFLICT');

    const row = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
      where: { scheduleId_userId: { scheduleId: schedule.id, userId: ids.userA } },
    });
    expect(row.status).toBe('GOING');
    expect(row.version).toBe(1);
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

  // W6 regression: drives the reviewer's exact deterministic corruption scenario (A going, B
  // waitlisted 1, C waitlisted 2, B withdraws, D joins) and asserts the previously-possible
  // collision (C and D both landing on position 2) can no longer happen, plus that a repeat
  // GOING request from an already-waitlisted user never recomputes/moves their position. If the
  // fix is reverted to the old COUNT()-based tail assignment with no departure compaction, this
  // test fails on the "C === 1, D === 2" assertion (both would instead be 2).
  it(
    'W6 regression: compacts waitlist positions when a WAITLISTED user withdraws, keeps positions ' +
      'unique and contiguous for new joiners, and preserves position on a repeat GOING request',
    async () => {
      const schedule = await createSchedule({ id: '6c000000-0000-4000-8000-000000000107', capacity: 1 });

      await service.setMyAttendance(authUser(ids.owner), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'w6-a-going');
      const bJoin = await service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'w6-b-wait');
      expect(bJoin).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
      const cJoin = await service.setMyAttendance(authUser(ids.userB), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'w6-c-wait');
      expect(cJoin).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 });

      // B withdraws from the waitlist entirely (not a GOING-vacancy promotion path — B was never
      // GOING). C must compact down to position 1.
      await service.setMyAttendance(authUser(ids.userA), ids.team, schedule.id, { status: 'NOT_GOING', expectedVersion: 0 }, 'w6-b-withdraw');
      const cAfterWithdrawal = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
        where: { scheduleId_userId: { scheduleId: schedule.id, userId: ids.userB } },
      });
      expect(cAfterWithdrawal).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });

      // D joins next — the new tail must be 2 (immediately after C's compacted position), never
      // colliding with C's position via a stale COUNT()-based computation.
      const dJoin = await service.setMyAttendance(authUser(ids.userC), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'w6-d-wait');
      expect(dJoin).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 });

      const waitlistRows = await prisma.v1ScheduleAttendance.findMany({
        where: { scheduleId: schedule.id, status: 'WAITLISTED' },
        orderBy: { waitlistPosition: 'asc' },
        select: { userId: true, waitlistPosition: true },
      });
      expect(waitlistRows.map((r) => r.waitlistPosition)).toEqual([1, 2]);
      expect(new Set(waitlistRows.map((r) => r.waitlistPosition)).size).toBe(waitlistRows.length);
      expect(waitlistRows.map((r) => r.userId)).toEqual([ids.userB, ids.userC]);

      // A repeat GOING request from C (still WAITLISTED, schedule still full) under a fresh
      // idempotency key must preserve C's existing position (1), never recompute/move it. Note:
      // the waitlist-compaction UPDATE above is a raw SQL statement scoped to *other* rows'
      // waitlist_position and does not touch C's own `version` column, so C's row is still at the
      // version its own single prior write (w6-c-wait) left it at — 0 (a freshly-created row's
      // version, per attendance.service.ts's create branch).
      const cRepeat = await service.setMyAttendance(authUser(ids.userB), ids.team, schedule.id, { status: 'GOING', expectedVersion: 0 }, 'w6-c-repeat');
      expect(cRepeat).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
    },
  );
});
