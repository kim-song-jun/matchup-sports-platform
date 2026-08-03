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
      where: { code: 'football' },
      update: {},
      create: { id: ids.sport, code: 'football', name: 'Task 12 Schedule CRUD Football' },
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

  // CP1 regression: `UpdateScheduleDto.rsvpDeadlineAt` previously let `null` bypass validation and
  // fall straight into `new Date(null)`, which silently persists 1970-01-01T00:00:00.000Z instead
  // of clearing the column. The fix distinguishes three states: omitted (preserve), `null`
  // (explicit clear to SQL NULL), and a real date string (parse it). If the fix is reverted, the
  // `toBeNull()` assertions below fail — the row would instead read back as `new Date(0)`.
  it(
    'CP1 regression: PATCH rsvpDeadlineAt:null clears it to SQL NULL (never a silent ' +
      '1970-01-01 corruption), and omitting the field preserves whatever value is already set',
    async () => {
      const created = await service.create(
        authUser(ids.ownerA),
        ids.teamA,
        { ...baseDto(), rsvpDeadlineAt: '2026-09-05T00:00:00.000Z' },
        'cp1-create-key',
      );
      const scheduleId = (created as { id: string }).id;

      const cleared = await service.update(
        authUser(ids.ownerA),
        ids.teamA,
        scheduleId,
        { expectedVersion: 0, rsvpDeadlineAt: null },
        'cp1-clear-key',
      );
      expect((cleared as { rsvpDeadlineAt: Date | null }).rsvpDeadlineAt).toBeNull();

      const rowAfterClear = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      expect(rowAfterClear.rsvpDeadlineAt).toBeNull();
      // The historical bug: `new Date(null)` silently becomes epoch instead of SQL NULL.
      expect(rowAfterClear.rsvpDeadlineAt).not.toEqual(new Date(0));

      // Omitting rsvpDeadlineAt entirely on a later update must preserve the now-NULL value —
      // never silently resurrect or re-corrupt it.
      const omittedAfterClear = await service.update(
        authUser(ids.ownerA),
        ids.teamA,
        scheduleId,
        { expectedVersion: 1, title: 'CP1 omit-preserves-null title' },
        'cp1-omit-after-clear-key',
      );
      expect((omittedAfterClear as { rsvpDeadlineAt: Date | null }).rsvpDeadlineAt).toBeNull();

      // Omitting the field when a real value IS currently set must preserve that real value too
      // (not just the null case).
      const withDeadline = await service.create(
        authUser(ids.ownerA),
        ids.teamA,
        { ...baseDto(), rsvpDeadlineAt: '2026-09-06T00:00:00.000Z' },
        'cp1-preserve-create-key',
      );
      const withDeadlineId = (withDeadline as { id: string }).id;
      const omittedWithValue = await service.update(
        authUser(ids.ownerA),
        ids.teamA,
        withDeadlineId,
        { expectedVersion: 0, title: 'CP1 omit-preserves-value title' },
        'cp1-preserve-omit-key',
      );
      expect((omittedWithValue as { rsvpDeadlineAt: Date }).rsvpDeadlineAt).toEqual(new Date('2026-09-06T00:00:00.000Z'));
    },
  );

  // P1-10 regression: increasing capacity must promote the front of the WAITLISTED queue (and
  // compact the rest) instead of leaving freed slots stranded behind whoever was already queued.
  // If this fix is ever reverted, memberB/outsider below stay WAITLISTED at positions 1/2 forever.
  it(
    'P1-10 regression: increasing schedule capacity promotes the front of the WAITLISTED queue ' +
      'and compacts the rest, bumping their version',
    async () => {
      const created = await service.create(authUser(ids.ownerA), ids.teamA, { ...baseDto(), capacity: 1 }, 'p1-10-increase-create-key');
      const scheduleId = (created as { id: string }).id;

      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.ownerA, status: 'GOING', version: 0 } });
      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.memberA, status: 'WAITLISTED', waitlistPosition: 1, version: 0 } });
      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.memberB, status: 'WAITLISTED', waitlistPosition: 2, version: 0 } });

      const result = await service.update(
        authUser(ids.ownerA),
        ids.teamA,
        scheduleId,
        { expectedVersion: 0, capacity: 2 },
        'p1-10-increase-key',
      );
      expect(result).toMatchObject({ capacity: 2, version: 1 });

      const promoted = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
        where: { scheduleId_userId: { scheduleId, userId: ids.memberA } },
      });
      expect(promoted).toMatchObject({ status: 'GOING', waitlistPosition: null, version: 1 });

      const compacted = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
        where: { scheduleId_userId: { scheduleId, userId: ids.memberB } },
      });
      expect(compacted).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1, version: 1 });
    },
  );

  // P1-10 regression: decreasing capacity below the current GOING count must be rejected outright,
  // never silently leave `goingCount > capacity`. If this fix is ever reverted, this call succeeds
  // 200 and the schedule row's capacity ends up at 1 with 2 GOING attendees.
  it(
    'P1-10 regression: decreasing schedule capacity below the current GOING count is rejected and ' +
      'mutates nothing',
    async () => {
      const created = await service.create(authUser(ids.ownerA), ids.teamA, { ...baseDto(), capacity: 2 }, 'p1-10-decrease-create-key');
      const scheduleId = (created as { id: string }).id;

      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.ownerA, status: 'GOING', version: 0 } });
      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.memberA, status: 'GOING', version: 0 } });

      const error = await captureFailure(() =>
        service.update(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0, capacity: 1 }, 'p1-10-decrease-key'),
      );
      expectHttpCode(error, 409, 'SCHEDULE_CAPACITY_BELOW_GOING_COUNT');

      const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      expect(row.capacity).toBe(2);
      expect(row.version).toBe(0);
    },
  );

  // P1-10 regression: removing the cap entirely (capacity -> null) must promote every remaining
  // WAITLISTED attendee — nobody should be left queued on what is now an uncapped schedule.
  it(
    'P1-10 regression: removing schedule capacity entirely promotes every remaining WAITLISTED ' +
      'attendee to GOING',
    async () => {
      const created = await service.create(authUser(ids.ownerA), ids.teamA, { ...baseDto(), capacity: 1 }, 'p1-10-uncap-create-key');
      const scheduleId = (created as { id: string }).id;

      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.ownerA, status: 'GOING', version: 0 } });
      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.memberA, status: 'WAITLISTED', waitlistPosition: 1, version: 0 } });
      await prisma.v1ScheduleAttendance.create({ data: { scheduleId, userId: ids.memberB, status: 'WAITLISTED', waitlistPosition: 2, version: 0 } });

      const result = await service.update(
        authUser(ids.ownerA),
        ids.teamA,
        scheduleId,
        { expectedVersion: 0, capacity: null } as never,
        'p1-10-uncap-key',
      );
      expect(result).toMatchObject({ capacity: null, version: 1 });

      const memberARow = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
        where: { scheduleId_userId: { scheduleId, userId: ids.memberA } },
      });
      expect(memberARow).toMatchObject({ status: 'GOING', waitlistPosition: null, version: 1 });
      const memberBRow = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
        where: { scheduleId_userId: { scheduleId, userId: ids.memberB } },
      });
      expect(memberBRow).toMatchObject({ status: 'GOING', waitlistPosition: null, version: 1 });
    },
  );

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

    // Already-terminal: a second cancel attempt must reject, not delete or re-cancel.
    // This passes the CURRENT version (1, bumped by the cancel above) on purpose. The P1-9 fix
    // made the optimistic-concurrency check run BEFORE the terminal-state check, so passing the
    // now-stale original version 0 here would correctly answer 409 VERSION_CONFLICT and this test
    // would no longer be exercising the terminal guard at all. Stale-version-wins-over-terminal is
    // covered separately by the P1-9 regression test.
    const error = await captureFailure(() =>
      service.cancel(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 1, cancelReason: 'again' }, 'cancel-key-2'),
    );
    expectHttpCode(error, 409, 'SCHEDULE_TERMINAL');
  });

  // P1-3 regression: cancel() (tested above) already closed an attached OPEN guest recruitment in
  // the same transaction as the cancellation — complete() never had the equivalent statement. A
  // schedule could reach COMPLETED while its recruitment stayed OPEN forever (new applications
  // rejected only because the PARENT schedule was terminal, never surfaced as the recruitment's
  // own state; GET kept showing OPEN; a still-pending guest_recruitment_close outbox reminder had
  // no way to know its parent had ended). If this fix is ever reverted, the final
  // `recruitment.state` assertion below fails back to 'OPEN'.
  it('complete is a state transition (never a delete) and closes an attached OPEN guest recruitment', async () => {
    const created = await service.create(
      authUser(ids.ownerA),
      ids.teamA,
      { ...baseDto(), startAt: '2020-01-01T10:00:00.000Z', endAt: '2020-01-01T12:00:00.000Z' },
      'complete-recruitment-create-key',
    );
    const scheduleId = (created as { id: string }).id;
    await prisma.v1ScheduleGuestRecruitment.create({
      data: { scheduleId, slots: 2, closesAt: new Date('2020-01-02T00:00:00.000Z'), state: 'OPEN' },
    });

    const result = await service.complete(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0 }, 'complete-recruitment-key');
    expect(result).toMatchObject({ state: 'completed', version: 1 });

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(row.state).toBe('COMPLETED');

    const recruitment = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId } });
    expect(recruitment.state).toBe('CLOSED');
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
    // P1-2 fix: the business key now embeds the schedule's rsvpDeadlineAt value, so a genuinely
    // rescheduled deadline gets its own outbox row instead of colliding with a stale key.
    const outboxRows = await prisma.$queryRaw<Array<{ count: bigint; type: string; payload: unknown }>>`
      SELECT COUNT(*) AS count, MIN(type::text) AS type, MIN(payload::text) AS payload
      FROM v1_outbox_events WHERE business_key = ${`schedule:${scheduleId}:reminder:rsvp_deadline:2026-09-09T00:00:00.000Z`}
    `;
    expect(Number(outboxRows[0].count)).toBe(1);
    // FG-8 fix: the original assertions only checked jobId equality and row count — neither
    // observes the outbox row's own `type` column, so swapping the
    // rsvp_deadline/guest_recruitment_close -> outbox-type mapping in triggerReminder() would
    // still pass every assertion here. Assert the actual persisted type and payload.
    expect(outboxRows[0].type).toBe('SCHEDULE_RSVP_DEADLINE_REMINDER');
    // P1-2 fix: payload now also carries `expectedRsvpDeadlineAt` — the worker handler
    // (schedule-reminder.service.ts) reads it back to no-op a stale row if the schedule's
    // rsvpDeadlineAt has since changed again past this row's own generation.
    expect(JSON.parse(outboxRows[0].payload as string)).toEqual({
      scheduleId,
      kind: 'rsvp_deadline',
      expectedRsvpDeadlineAt: '2026-09-09T00:00:00.000Z',
    });
  });

  // FG-8 fix: the sibling "no recruitment attached" test below proves the 404 branch, but nothing
  // in this file previously drove a SUCCESSFUL guest_recruitment_close trigger and inspected its
  // outbox row — the rsvp_deadline positive-path test above and this one are what actually catch
  // a swapped `rsvp_deadline -> SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER` /
  // `guest_recruitment_close -> SCHEDULE_RSVP_DEADLINE_REMINDER` mapping regression.
  it('triggers a guest_recruitment_close reminder and persists the correct outbox type/payload', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'reminder-guest-close-create-key');
    const scheduleId = (created as { id: string }).id;
    await prisma.v1ScheduleGuestRecruitment.create({
      data: {
        scheduleId,
        slots: 2,
        closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        state: 'OPEN',
      },
    });

    const result = await service.triggerReminder(
      authUser(ids.ownerA),
      ids.teamA,
      scheduleId,
      { kind: 'guest_recruitment_close' },
      'reminder-guest-close-key',
    );
    expect((result as { kind: string }).kind).toBe('guest_recruitment_close');

    // P1-2 fix: the business key now embeds the recruitment's own `version` (freshly created here,
    // so it is the schema default 0) instead of being permanently the same key for this schedule —
    // a reopened/edited recruitment (whose version has since bumped) gets its own outbox row.
    const businessKey = `schedule:${scheduleId}:reminder:guest_recruitment_close:0`;
    const outboxRows = await prisma.$queryRaw<Array<{ count: bigint; type: string; payload: unknown }>>`
      SELECT COUNT(*) AS count, MIN(type::text) AS type, MIN(payload::text) AS payload
      FROM v1_outbox_events WHERE business_key = ${businessKey}
    `;
    expect(Number(outboxRows[0].count)).toBe(1);
    expect(outboxRows[0].type).toBe('SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER');
    // P1-2 fix: payload now also carries `expectedRecruitmentVersion` — the worker handler reads
    // it back to no-op a stale row if the recruitment has since been mutated past this generation.
    expect(JSON.parse(outboxRows[0].payload as string)).toEqual({
      scheduleId,
      kind: 'guest_recruitment_close',
      expectedRecruitmentVersion: 0,
    });
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

  // W7 regression: teamMatchId previously bypassed cross-team ownership validation for every
  // non-MATCH type (the check only ran `if (dto.type === 'MATCH' && dto.teamMatchId)`). If that
  // guard is ever reverted, this call would silently persist a TRAINING schedule carrying team
  // B's teamMatchId (201) instead of rejecting it — this test fails on the `expectHttpCode` call
  // and/or the row-count assertion in that case.
  it(
    'W7 regression: rejects teamMatchId on a non-MATCH schedule type outright (cross-team ' +
      'ownership validation must never be skippable via type) and creates no row',
    async () => {
      const before = await prisma.v1TeamSchedule.count({ where: { teamId: ids.teamA } });

      const error = await captureFailure(() =>
        service.create(
          authUser(ids.ownerA),
          ids.teamA,
          { ...baseDto(), type: 'TRAINING', teamMatchId: ids.otherTeamMatch } as never,
          'w7-non-match-team-match-id-key',
        ),
      );
      expectHttpCode(error, 422, 'SCHEDULE_TEAM_MATCH_NOT_ALLOWED');

      const after = await prisma.v1TeamSchedule.count({ where: { teamId: ids.teamA } });
      expect(after).toBe(before);
    },
  );

  // W9 regression (schedule creation, the "unordered findFirst can select the stale expired row"
  // shape): create with key K, expire K's record, legitimately reuse K once (creates a second,
  // distinct schedule), then immediately retry K again. The fixed lookup filters to
  // `expiresAt > now` and orders by recency, so it deterministically finds only the still-active
  // second record and replays it. Reverting to an unfiltered/unordered findFirst risks the still-
  // present expired first record shadowing the active one and creating a THIRD schedule instead
  // of replaying the second — this test's final count/replay assertions catch that.
  it(
    'W9 regression: reusing a create Idempotency-Key after its record has expired creates a new ' +
      'schedule once, and an immediate retry of that same key replays the second schedule ' +
      '(never a third)',
    async () => {
      const key = 'w9-create-expiry-key';
      const dto = { ...baseDto(), title: 'W9 create expiry fixture' };

      const first = await service.create(authUser(ids.ownerA), ids.teamA, dto, key);
      const firstId = (first as { id: string; replayed: boolean }).id;
      expect((first as { replayed: boolean }).replayed).toBe(false);

      // Simulate the key's 30-day retention window having elapsed.
      // P1-6 fix: the stored idempotency record's resourceId is now `teamId` (a stable value
      // shared by every create attempt under this scope), not the freshly-created schedule's own
      // id — see create()'s own P1-6 comment. `firstId` never appeared as a resourceId to begin
      // with under the fixed code, so this lookup targets `ids.teamA` instead.
      await prisma.v1IdempotencyRecord.updateMany({
        where: { action: 'SCHEDULE_CREATE', resourceType: 'V1_TEAM_SCHEDULE', resourceId: ids.teamA, idempotencyKey: key },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      // Legitimate reuse after expiry: a genuinely new schedule, not a replay or a crash.
      const second = await service.create(authUser(ids.ownerA), ids.teamA, dto, key);
      const secondId = (second as { id: string; replayed: boolean }).id;
      expect((second as { replayed: boolean }).replayed).toBe(false);
      expect(secondId).not.toBe(firstId);

      // Immediate retry of the same key: must replay the second schedule's response, never create
      // a third.
      const retry = await service.create(authUser(ids.ownerA), ids.teamA, dto, key);
      expect(retry).toMatchObject({ id: secondId, replayed: true });

      const scheduleCount = await prisma.v1TeamSchedule.count({ where: { teamId: ids.teamA, title: dto.title } });
      expect(scheduleCount).toBe(2);
    },
  );

  // P1-6 fix supersedes this test's original premise. It used to be named "CP2 regression" and
  // seeded two ACTIVE (non-expired) idempotency records sharing one create scope but carrying two
  // DIFFERENT, arbitrary `resourceId` values, to prove create()'s (now-removed) `createdAt DESC,
  // resourceId DESC` tiebreak deterministically picked a winner among them. Under the P1-6 fix
  // that scenario can no longer be constructed at all for SCHEDULE_CREATE: resourceId is now the
  // real, stable `teamId` (see create()'s own P1-6 comment), so the composite unique index
  // (actorUserId, action, resourceType, resourceId, idempotencyKey) forbids two rows from ever
  // sharing an identical scope in the first place — there is no tie left to break, and create()'s
  // replay lookup is a plain findUnique with no ordering at all. What P1-6 actually fixed, and
  // what this test proves instead: the PRE-fix code used the constant RESOURCE_TYPE string as the
  // advisory lock's resourceId (and dropped resourceId from the lookup's where-clause entirely),
  // so the exact same (actor, key) pair collided across EVERY team that actor could create a
  // schedule under. Two different teams, same actor, same Idempotency-Key must each get their own
  // independent create — never a cross-team replay or payload conflict.
  it(
    'P1-6 regression: the same actor reusing one Idempotency-Key across two different teams gets ' +
      'two independent creates, never a cross-team replay or payload collision',
    async () => {
      // teamB (unlike teamA) has no seeded membership in this suite's beforeAll — grant ownerA an
      // owner membership on it here, scoped to this one test, so create() against teamB can pass
      // its own manageable-team check.
      await prisma.v1TeamMembership.create({
        data: { teamId: ids.teamB, userId: ids.ownerA, role: 'owner', status: 'active' },
      });

      const key = 'p1-6-cross-team-key';
      const dtoForTeamA = { ...baseDto(), title: 'P1-6 team A fixture' };
      const dtoForTeamB = { ...baseDto(), title: 'P1-6 team B fixture' };

      const createdA = await service.create(authUser(ids.ownerA), ids.teamA, dtoForTeamA, key);
      expect((createdA as { replayed: boolean }).replayed).toBe(false);

      // Same actor, same Idempotency-Key, a DIFFERENT team and a DIFFERENT payload. Before the
      // fix, the advisory lock's scope was identical for both calls (RESOURCE_TYPE used as the
      // lock's resourceId regardless of team), and the lookup never filtered on resourceId at
      // all — this call could have replayed, or payload-conflicted against, team A's own record
      // despite being a wholly unrelated team/schedule.
      const createdB = await service.create(authUser(ids.ownerA), ids.teamB, dtoForTeamB, key);
      expect((createdB as { replayed: boolean }).replayed).toBe(false);
      expect((createdB as { id: string }).id).not.toBe((createdA as { id: string }).id);

      const scheduleA = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: (createdA as { id: string }).id } });
      const scheduleB = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: (createdB as { id: string }).id } });
      expect(scheduleA.teamId).toBe(ids.teamA);
      expect(scheduleB.teamId).toBe(ids.teamB);

      // Retrying team A's own create with its own key/payload must still cleanly replay team A's
      // own response — proving the fix's per-team scoping didn't break same-team replay.
      const replayA = await service.create(authUser(ids.ownerA), ids.teamA, dtoForTeamA, key);
      expect(replayA).toMatchObject({ id: (createdA as { id: string }).id, replayed: true });
    },
  );

  // W9 regression (update/cancel/reminder shape): checkReplay() now DELETES an expired
  // exact-scope idempotency record (under the already-held advisory lock) instead of merely
  // treating it as absent. Without the delete, the final `storeIdempotency` insert at the end of
  // a legitimately-reused key hits the still-present expired row's unique constraint (P2002) and
  // the whole mutation rolls back instead of succeeding. Preinsert an already-expired record for
  // each action, then drive a real, valid call through that exact (resource, key) scope and assert
  // it succeeds cleanly with exactly one live idempotency record surviving.
  it('W9 regression: an expired update idempotency record is replaced (not P2002) on legitimate key reuse', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'w9-update-create-key');
    const scheduleId = (created as { id: string }).id;
    const key = 'w9-update-expiry-key';

    await prisma.v1IdempotencyRecord.create({
      data: {
        actorUserId: ids.ownerA,
        action: 'SCHEDULE_UPDATE',
        resourceType: 'V1_TEAM_SCHEDULE',
        resourceId: scheduleId,
        idempotencyKey: key,
        payloadHash: 'stale-hash-from-a-previous-generation',
        responseStatus: 200,
        responseBody: {},
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    const result = await service.update(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0, title: 'W9 update survives expiry' }, key);
    expect(result).toMatchObject({ title: 'W9 update survives expiry', version: 1, replayed: false });

    const records = await prisma.v1IdempotencyRecord.findMany({
      where: { action: 'SCHEDULE_UPDATE', resourceType: 'V1_TEAM_SCHEDULE', resourceId: scheduleId, idempotencyKey: key },
    });
    expect(records).toHaveLength(1);
    expect(records[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('W9 regression: an expired cancel idempotency record is replaced (not P2002) on legitimate key reuse', async () => {
    const created = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'w9-cancel-create-key');
    const scheduleId = (created as { id: string }).id;
    const key = 'w9-cancel-expiry-key';

    await prisma.v1IdempotencyRecord.create({
      data: {
        actorUserId: ids.ownerA,
        action: 'SCHEDULE_CANCEL',
        resourceType: 'V1_TEAM_SCHEDULE',
        resourceId: scheduleId,
        idempotencyKey: key,
        payloadHash: 'stale-hash-from-a-previous-generation',
        responseStatus: 200,
        responseBody: {},
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    const result = await service.cancel(authUser(ids.ownerA), ids.teamA, scheduleId, { expectedVersion: 0, cancelReason: 'W9 expiry test' }, key);
    expect(result).toMatchObject({ state: 'cancelled', version: 1, replayed: false });

    const records = await prisma.v1IdempotencyRecord.findMany({
      where: { action: 'SCHEDULE_CANCEL', resourceType: 'V1_TEAM_SCHEDULE', resourceId: scheduleId, idempotencyKey: key },
    });
    expect(records).toHaveLength(1);
    expect(records[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('W9 regression: an expired reminder-trigger idempotency record is replaced (not P2002) on legitimate key reuse', async () => {
    const created = await service.create(
      authUser(ids.ownerA),
      ids.teamA,
      { ...baseDto(), rsvpDeadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString() },
      'w9-reminder-create-key',
    );
    const scheduleId = (created as { id: string }).id;
    const key = 'w9-reminder-expiry-key';

    await prisma.v1IdempotencyRecord.create({
      data: {
        actorUserId: ids.ownerA,
        action: 'SCHEDULE_REMINDER_TRIGGER',
        resourceType: 'V1_TEAM_SCHEDULE',
        resourceId: scheduleId,
        idempotencyKey: key,
        payloadHash: 'stale-hash-from-a-previous-generation',
        responseStatus: 200,
        responseBody: {},
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    const result = await service.triggerReminder(authUser(ids.ownerA), ids.teamA, scheduleId, { kind: 'rsvp_deadline' }, key);
    expect(result).toMatchObject({ kind: 'rsvp_deadline', replayed: false });

    const records = await prisma.v1IdempotencyRecord.findMany({
      where: { action: 'SCHEDULE_REMINDER_TRIGGER', resourceType: 'V1_TEAM_SCHEDULE', resourceId: scheduleId, idempotencyKey: key },
    });
    expect(records).toHaveLength(1);
    expect(records[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // P1-9 regression: a stale expectedVersion must ALWAYS report VERSION_CONFLICT, even when the
  // row has ALSO independently become terminal (or, for complete(), also hasn't ended yet) since
  // the version the caller last saw. Before the fix, update()/cancel()/complete() all checked
  // state (and complete() also checked endAt) BEFORE checking version, so a stale-version caller
  // racing a terminal transition saw SCHEDULE_TERMINAL/SCHEDULE_NOT_YET_ENDED instead of
  // VERSION_CONFLICT — violating the CAS contract that a stale version is unconditionally a
  // version conflict, never masked by whatever else changed underneath it. Each case below drives
  // a real, independent state/time change first (so the "terminal" or "not yet ended" condition
  // is genuinely true), THEN reuses the ORIGINAL (now-stale) expectedVersion.
  it(
    'P1-9 regression: a stale expectedVersion reports VERSION_CONFLICT (never SCHEDULE_TERMINAL or ' +
      'SCHEDULE_NOT_YET_ENDED) even when the row has independently become terminal in the meantime',
    async () => {
      // update(): schedule is cancelled (now terminal) by someone else; a stale-version PATCH must
      // still 409 VERSION_CONFLICT, not SCHEDULE_TERMINAL.
      const forUpdate = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'p1-9-update-create-key');
      const forUpdateId = (forUpdate as { id: string }).id;
      await service.cancel(
        authUser(ids.ownerA),
        ids.teamA,
        forUpdateId,
        { expectedVersion: 0, cancelReason: 'P1-9 fixture: make it terminal first' },
        'p1-9-update-cancel-key',
      );
      const staleUpdateError = await captureFailure(() =>
        service.update(authUser(ids.ownerA), ids.teamA, forUpdateId, { expectedVersion: 0, title: 'stale' }, 'p1-9-update-key'),
      );
      expectHttpCode(staleUpdateError, 409, 'VERSION_CONFLICT');

      // cancel(): schedule is already completed by someone else; a stale-version cancel must
      // still 409 VERSION_CONFLICT, not SCHEDULE_TERMINAL.
      const forCancel = await service.create(
        authUser(ids.ownerA),
        ids.teamA,
        { ...baseDto(), startAt: '2020-01-01T10:00:00.000Z', endAt: '2020-01-01T12:00:00.000Z' },
        'p1-9-cancel-create-key',
      );
      const forCancelId = (forCancel as { id: string }).id;
      await service.complete(authUser(ids.ownerA), ids.teamA, forCancelId, { expectedVersion: 0 }, 'p1-9-cancel-complete-key');
      const staleCancelError = await captureFailure(() =>
        service.cancel(authUser(ids.ownerA), ids.teamA, forCancelId, { expectedVersion: 0, cancelReason: 'stale' }, 'p1-9-cancel-key'),
      );
      expectHttpCode(staleCancelError, 409, 'VERSION_CONFLICT');

      // complete(): schedule was cancelled by someone else AND hasn't ended yet — both the
      // terminal-state and not-yet-ended conditions are true, but a stale-version complete() must
      // still report VERSION_CONFLICT ahead of either.
      const forComplete = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'p1-9-complete-create-key');
      const forCompleteId = (forComplete as { id: string }).id;
      await service.cancel(
        authUser(ids.ownerA),
        ids.teamA,
        forCompleteId,
        { expectedVersion: 0, cancelReason: 'P1-9 fixture: make it terminal (and still not-yet-ended)' },
        'p1-9-complete-cancel-key',
      );
      const staleCompleteError = await captureFailure(() =>
        service.complete(authUser(ids.ownerA), ids.teamA, forCompleteId, { expectedVersion: 0 }, 'p1-9-complete-key'),
      );
      expectHttpCode(staleCompleteError, 409, 'VERSION_CONFLICT');

      // complete(), second shape: the schedule is still SCHEDULED (not terminal) and its endAt is
      // still in the future (genuinely not-yet-ended) — only the version is stale. The old order
      // checked endAt before version, so this specific combination (not terminal, not yet ended,
      // but stale version) previously returned SCHEDULE_NOT_YET_ENDED instead of VERSION_CONFLICT.
      const forCompleteNotEnded = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'p1-9-complete-not-ended-create-key');
      const forCompleteNotEndedId = (forCompleteNotEnded as { id: string }).id;
      await service.update(
        authUser(ids.ownerA),
        ids.teamA,
        forCompleteNotEndedId,
        { expectedVersion: 0, title: 'P1-9 fixture: advance version without ending or cancelling' },
        'p1-9-complete-not-ended-update-key',
      );
      const staleNotYetEndedError = await captureFailure(() =>
        service.complete(authUser(ids.ownerA), ids.teamA, forCompleteNotEndedId, { expectedVersion: 0 }, 'p1-9-complete-not-ended-key'),
      );
      expectHttpCode(staleNotYetEndedError, 409, 'VERSION_CONFLICT');
    },
  );

  // W10 regression: TeamSchedulesService.complete() is the only mechanism that makes COMPLETED
  // reachable. If this mutation were ever removed (reverting to the pre-W10 state where the
  // `status=completed` filter was reachable-but-dead), this whole block fails: complete() itself
  // would not exist, or a schedule would never actually reach COMPLETED, or a completed schedule
  // would remain mutable.
  it('W10 regression: complete() transitions an ended schedule to COMPLETED, rejects before endAt, and the state is terminal', async () => {
    const notYetEnded = await service.create(authUser(ids.ownerA), ids.teamA, baseDto(), 'w10-not-ended-key');
    const notYetEndedId = (notYetEnded as { id: string }).id;
    const tooEarly = await captureFailure(() =>
      service.complete(authUser(ids.ownerA), ids.teamA, notYetEndedId, { expectedVersion: 0 }, 'w10-too-early-key'),
    );
    expectHttpCode(tooEarly, 409, 'SCHEDULE_NOT_YET_ENDED');

    const ended = await service.create(
      authUser(ids.ownerA),
      ids.teamA,
      { ...baseDto(), startAt: '2020-01-01T10:00:00.000Z', endAt: '2020-01-01T12:00:00.000Z' },
      'w10-ended-create-key',
    );
    const endedId = (ended as { id: string }).id;

    const completed = await service.complete(authUser(ids.ownerA), ids.teamA, endedId, { expectedVersion: 0 }, 'w10-complete-key');
    expect(completed).toMatchObject({ state: 'completed', version: 1, replayed: false });

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: endedId } });
    expect(row.state).toBe('COMPLETED');

    // Terminal: neither a second complete() nor an update()/cancel() can move it anywhere else.
    const secondComplete = await captureFailure(() =>
      service.complete(authUser(ids.ownerA), ids.teamA, endedId, { expectedVersion: 1 }, 'w10-complete-again-key'),
    );
    expectHttpCode(secondComplete, 409, 'SCHEDULE_TERMINAL');

    const cancelAfterComplete = await captureFailure(() =>
      service.cancel(authUser(ids.ownerA), ids.teamA, endedId, { expectedVersion: 1, cancelReason: 'should not apply' }, 'w10-cancel-after-complete-key'),
    );
    expectHttpCode(cancelAfterComplete, 409, 'SCHEDULE_TERMINAL');

    // The contract's query filter must actually surface it now that it is reachable.
    const mine = await service.mySchedule(authUser(ids.ownerA), { status: 'completed' });
    expect(mine.items.map((i: { id: string }) => i.id)).toContain(endedId);
  });
});
