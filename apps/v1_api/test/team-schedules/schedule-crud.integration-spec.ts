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
      await prisma.v1IdempotencyRecord.updateMany({
        where: { action: 'SCHEDULE_CREATE', resourceType: 'V1_TEAM_SCHEDULE', resourceId: firstId, idempotencyKey: key },
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
