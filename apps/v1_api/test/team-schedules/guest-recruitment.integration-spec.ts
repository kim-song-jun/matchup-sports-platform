import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { GuestRecruitmentService } from '../../src/team-schedules/guest-recruitment.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { holdRowLock, isStillPending } from './helpers/lock-barrier';

/**
 * Task 12 guest-recruitment lane — direct GuestRecruitmentService coverage for the concurrency
 * defects the review flagged (W2, W3, W4). The sibling HTTP contract spec
 * (team-schedules.integration-spec.ts) covers identity/deadline/idempotency/visibility; this file
 * is specifically about races between application creation and schedule
 * cancellation/recruitment closure, using a genuine Postgres row-lock barrier (see
 * ./helpers/lock-barrier.ts) rather than a bare Promise.all() — matching the review's T3
 * complaint that an un-barriered Promise.all() does not prove a race window was exercised.
 */

const ids = {
  team: '6e000000-0000-4000-8000-000000000020',
  sport: '6e000000-0000-4000-8000-000000000010',
  region: '6e000000-0000-4000-8000-000000000011',
  owner: '6e000000-0000-4000-8000-000000000001',
  outsider: '6e000000-0000-4000-8000-000000000002',
  outsiderB: '6e000000-0000-4000-8000-000000000003',
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

let scheduleCounter = 0;
async function createScheduleWithRecruitment(overrides: { closesAt?: Date } = {}) {
  scheduleCounter += 1;
  const schedule = await prisma.v1TeamSchedule.create({
    data: {
      teamId: ids.team,
      title: `Task 12 guest-recruitment race fixture ${scheduleCounter}`,
      type: 'TRAINING',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T12:00:00.000Z'),
      timezone: 'Asia/Seoul',
      state: 'SCHEDULED',
    },
  });
  const recruitment = await prisma.v1ScheduleGuestRecruitment.create({
    data: {
      scheduleId: schedule.id,
      slots: 3,
      closesAt: overrides.closesAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
      state: 'OPEN',
      visibility: 'PUBLIC',
    },
  });
  return { schedule, recruitment };
}

describe('Task 12 guest-recruitment lane — race regressions (W2/W3/W4)', () => {
  let service: GuestRecruitmentService;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 12 guest-recruitment race verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.owner, ids.outsider, ids.outsiderB].map((id) => ({
        id,
        email: `${id}@example.test`,
        phone: `010${id.slice(-8)}`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task12-guest-recruitment-football' },
      update: {},
      create: { id: ids.sport, code: 'task12-guest-recruitment-football', name: 'Task 12 Guest Recruitment Football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK12_GUEST_RECRUITMENT_REGION', name: 'Task 12 Guest Recruitment Region', level: 2 },
    });
    await prisma.v1Team.create({
      data: { id: ids.team, ownerUserId: ids.owner, sportId: sport.id, regionId: ids.region, name: 'Task 12 Guest Recruitment Team' },
    });
    await prisma.v1TeamMembership.create({
      data: { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' },
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        GuestRecruitmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { emitToManyDeferred: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(GuestRecruitmentService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  // W4 regression: a CANCELLED schedule's recruitment must stay terminal. Before the fix,
  // updateRecruitment() locked the schedule row but only ever re-read its `id`, never its
  // `state`, so a manager could PATCH { expectedVersion, state: "open" } straight after
  // cancellation and flip the just-CLOSED recruitment back to OPEN.
  it('W4 regression: rejects reopening a CANCELLED schedule\'s recruitment with 409 SCHEDULE_TERMINAL and leaves it CLOSED', async () => {
    const { schedule, recruitment } = await createScheduleWithRecruitment();

    // Mirrors TeamSchedulesService.cancel()'s exact state transition (schedule -> CANCELLED,
    // attached OPEN recruitment -> CLOSED) without depending on that service directly, keeping
    // this file's ownership scoped to GuestRecruitmentService.
    await prisma.$executeRaw`UPDATE v1_team_schedules SET state = 'CANCELLED'::"V1ScheduleState", version = version + 1 WHERE id = ${schedule.id}`;
    await prisma.$executeRaw`UPDATE v1_schedule_guest_recruitments SET state = 'CLOSED'::"V1GuestRecruitmentState", version = version + 1 WHERE schedule_id = ${schedule.id} AND state = 'OPEN'::"V1GuestRecruitmentState"`;

    const closedRecruitment = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId: schedule.id } });
    expect(closedRecruitment.state).toBe('CLOSED');

    const error = await captureFailure(() =>
      service.updateRecruitment(
        authUser(ids.owner),
        ids.team,
        schedule.id,
        { expectedVersion: closedRecruitment.version, state: 'open' },
        'w4-reopen-attempt-key',
      ),
    );
    expectHttpCode(error, 409, 'SCHEDULE_TERMINAL');

    const after = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
    expect(after.state).toBe('CLOSED');
    expect(after.version).toBe(closedRecruitment.version);
  });

  // W2 regression: createApplication() now locks the schedule row FOR UPDATE (same order as
  // cancellation: schedule, then recruitment) before re-reading state. This test forces the exact
  // interleaving the review described: an application transaction blocked on that lock while a
  // cancellation-equivalent state change commits, then proves the now-unblocked application
  // observes the terminal state instead of a stale SCHEDULED/OPEN read.
  it(
    'W2 regression: a guest application genuinely blocked on the schedule row lock observes a ' +
      'cancellation that commits while it waits, and is rejected with no row created',
    async () => {
      const { schedule, recruitment } = await createScheduleWithRecruitment();

      const holder = await holdRowLock(
        prisma,
        (tx) => tx.$queryRaw`SELECT id FROM v1_team_schedules WHERE id = ${schedule.id} FOR UPDATE`,
        async (tx) => {
          await tx.$executeRaw`UPDATE v1_team_schedules SET state = 'CANCELLED'::"V1ScheduleState", version = version + 1 WHERE id = ${schedule.id}`;
          await tx.$executeRaw`UPDATE v1_schedule_guest_recruitments SET state = 'CLOSED'::"V1GuestRecruitmentState", version = version + 1 WHERE schedule_id = ${schedule.id} AND state = 'OPEN'::"V1GuestRecruitmentState"`;
        },
      );

      const applyCall = service.createApplication(
        authUser(ids.outsider),
        ids.team,
        schedule.id,
        { displayName: 'W2 blocked applicant' },
        'w2-race-key',
      );

      // Proof of genuine contention: with the holder still sitting on the schedule row's FOR
      // UPDATE lock, the applicant's own transaction cannot even reach its state check yet.
      expect(await isStillPending(applyCall, 250)).toBe(true);

      await holder.release();

      const error = await captureFailure(() => applyCall);
      expectHttpCode(error, 409, 'SCHEDULE_TERMINAL');

      expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id } })).toBe(0);
      const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      expect(row.state).toBe('CANCELLED');
    },
  );

  // W3's originally-reported defect (an aborted-transaction P2028 on the try/catch(P2002)
  // recovery path) required a genuine concurrent INSERT collision for the same
  // (recruitmentId, userId). The W2 fix above added a schedule-then-recruitment FOR UPDATE lock
  // *before* that insert, which — as an emergent, correct side effect — now fully serializes every
  // application attempt for a given recruitment: whichever caller's transaction acquires the
  // recruitment lock first commits its insert entirely before a second caller's transaction can
  // even proceed past its own lock acquisition. That means the specific `insertedRows.length ===
  // 0` (ON CONFLICT DO NOTHING) recovery branch this fix added is, today, unreachable through any
  // public call path — a second real concurrent submission for the same (recruitment, user) no
  // longer reaches the INSERT statement while the first is still in flight; it instead observes
  // the first's already-committed row via the ordinary `existingApplication` lookup. This test
  // honestly proves what IS observable end-to-end (the caller-facing contract: concurrent
  // duplicate submissions never 500/abort and converge on exactly one row) via a genuine barrier,
  // and does not claim to exercise the ON-CONFLICT branch specifically — see the follow-up test
  // below for that.
  it(
    'W3 observable contract: two concurrent applications for the same user, forced to genuinely ' +
      'overlap at the recruitment lock, both resolve 200 and converge on exactly one row (never ' +
      'a 500/aborted-transaction)',
    async () => {
      const { schedule, recruitment } = await createScheduleWithRecruitment();

      const holder = await holdRowLock(
        prisma,
        (tx) => tx.$queryRaw`SELECT id FROM v1_schedule_guest_recruitments WHERE schedule_id = ${schedule.id} FOR UPDATE`,
      );

      const callA = service.createApplication(authUser(ids.outsider), ids.team, schedule.id, { displayName: 'Racer A' }, 'w3-race-key-a');
      const callB = service.createApplication(authUser(ids.outsider), ids.team, schedule.id, { displayName: 'Racer B' }, 'w3-race-key-b');

      const [aPending, bPending] = await Promise.all([isStillPending(callA, 250), isStillPending(callB, 250)]);
      expect(aPending).toBe(true);
      expect(bPending).toBe(true);

      await holder.release();

      const [resultA, resultB] = await Promise.all([callA, callB]);
      expect(resultA.applicationId).toBe(resultB.applicationId);
      const alreadyAppliedFlags = [resultA.alreadyApplied, resultB.alreadyApplied].sort();
      expect(alreadyAppliedFlags).toEqual([false, true]);

      expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsider } })).toBe(1);

      // CP3 regression: before the fix, whichever side of a genuine concurrent-duplicate race
      // resolved via the "someone already applied" recovery path never persisted a
      // V1IdempotencyRecord for ITS OWN Idempotency-Key — a client retry with that exact same key
      // re-ran the whole transaction from scratch instead of replaying, and could never observe
      // `replayed: true`. (The specific `INSERT ... ON CONFLICT DO NOTHING` 0-row branch the
      // review's W3/CP3 findings quote by line number is, as of the W2 fix above, unreachable
      // through this public method at all — the recruitment row's FOR UPDATE lock fully
      // serializes two concurrent createApplication() calls for the same recruitment, so the
      // loser always observes the winner's row via the ordinary pre-insert `existingApplication`
      // read, never via a live unique-constraint collision. See the "W3 SQL contract" test below
      // for a standalone proof that the ON-CONFLICT pattern itself is correct if that branch is
      // ever reachable again. This test instead proves the caller-observable contract CP3 actually
      // promises: whichever key "lost" a genuine race can be safely retried.) Identify the loser
      // (alreadyApplied: true) and retry with its own key AND its own original payload (a replay
      // must match the exact payload the key was first used with — a real client retry always
      // resends the identical request body) — this must replay, not error or silently re-derive a
      // fresh response.
      const loser = resultA.alreadyApplied ? resultA : resultB;
      const loserKey = resultA.alreadyApplied ? 'w3-race-key-a' : 'w3-race-key-b';
      const loserDisplayName = resultA.alreadyApplied ? 'Racer A' : 'Racer B';
      const retry = await service.createApplication(
        authUser(ids.outsider),
        ids.team,
        schedule.id,
        { displayName: loserDisplayName },
        loserKey,
      );
      expect(retry).toEqual({ ...loser, replayed: true });
      expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsider } })).toBe(1);
    },
  );

  // W3 SQL-contract micro-test: proves the `INSERT ... ON CONFLICT ON CONSTRAINT ... DO NOTHING
  // RETURNING` pattern guest-recruitment.service.ts's createApplication() uses is itself correct
  // under a genuine simultaneous duplicate insert — the scenario the try/catch(P2002) +
  // findUniqueOrThrow-on-the-same-tx pattern could not survive (a statement error aborts the
  // whole enclosing transaction, so the recovery SELECT on that same tx would fail with
  // "current transaction is aborted"). This does not invoke GuestRecruitmentService (see the test
  // above for why that specific branch is unreachable through the service today); it locks in the
  // underlying database contract the fix depends on.
  it('W3 SQL contract: ON CONFLICT DO NOTHING RETURNING never aborts the transaction on a genuine duplicate insert', async () => {
    const { recruitment } = await createScheduleWithRecruitment();

    const holder = await holdRowLock(prisma, (tx) =>
      tx.$queryRaw`SELECT id FROM v1_schedule_guest_recruitments WHERE id = ${recruitment.id} FOR UPDATE`,
    );

    const insertOnce = async () =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO v1_schedule_guest_applications (
            id, recruitment_id, user_id, display_name_snapshot, note, state, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), ${recruitment.id}, ${ids.outsiderB}, 'SQL contract racer', NULL,
            'PENDING'::"V1GuestApplicationState", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (recruitment_id, user_id) DO NOTHING
          RETURNING id
        `;
        if (rows.length > 0) return { created: true };
        // The transaction must still be healthy here — this is exactly what the pre-fix
        // try/catch(P2002) pattern could not guarantee.
        const winner = await tx.v1ScheduleGuestApplication.findUniqueOrThrow({
          where: { recruitmentId_userId: { recruitmentId: recruitment.id, userId: ids.outsiderB } },
        });
        return { created: false, winnerId: winner.id };
      });

    const callA = insertOnce();
    const callB = insertOnce();
    const [aPending, bPending] = await Promise.all([isStillPending(callA, 250), isStillPending(callB, 250)]);
    expect(aPending).toBe(true);
    expect(bPending).toBe(true);

    await holder.release();

    const [resultA, resultB] = await Promise.all([callA, callB]);
    const createdFlags = [resultA.created, resultB.created].sort();
    expect(createdFlags).toEqual([false, true]);
    expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsiderB } })).toBe(1);
  });
});
