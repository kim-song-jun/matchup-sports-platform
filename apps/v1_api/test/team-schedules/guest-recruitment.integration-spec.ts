import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { GuestRecruitmentService } from '../../src/team-schedules/guest-recruitment.service';
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
      // FG-7 / P0-1 fix: this schedule previously relied on the Prisma schema default
      // (TEAM — private). Every race test in this file applies as `ids.outsider`/`ids.outsiderB`,
      // who hold no membership on `ids.team` — before createApplication() checked
      // schedule/recruitment visibility (P0-1), that gap didn't matter here. With the gate in
      // place, an outsider against a private schedule now correctly 404s before ever reaching the
      // state/lock/race logic these tests exist to exercise, so the schedule must be PUBLIC (the
      // recruitment below already is) for these outsider personas to be legitimately reachable.
      visibility: 'PUBLIC',
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

    // P1-4 fix: GuestRecruitmentService no longer injects NotificationsService — the new-guest-
    // application manager notification is now a durable outbox row (see createApplication()'s own
    // P1-4 comment), not an in-request NotificationsService call, so no mock provider is needed
    // here anymore.
    moduleRef = await Test.createTestingModule({
      providers: [GuestRecruitmentService, { provide: PrismaService, useValue: prisma }],
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

  // P1-5 regression: `note: dto.note ?? null` in the payload hash collapsed "omitted" (preserve
  // the existing note, per nextNote's `dto.note === undefined ? recruitment.note : dto.note`) and
  // an explicit `note: null` (clear the note) into the identical hash value. Two requests under
  // the SAME idempotencyKey with genuinely different intent must never be treated as an identical
  // replay — the second one here (note: null) must 409 IDEMPOTENCY_PAYLOAD_CONFLICT, never
  // silently replay the first's "note preserved" response. If the hash fix is reverted to
  // `dto.note ?? null`, this call incorrectly resolves 200 with `replayed: true` instead of 409.
  it(
    'P1-5 regression: reusing an Idempotency-Key with an explicit note:null is a payload conflict, ' +
      'never a silent replay of an earlier omitted-note request',
    async () => {
      const { schedule } = await createScheduleWithRecruitment();
      const key = 'p1-5-note-presence-key';

      const first = await service.updateRecruitment(
        authUser(ids.owner),
        ids.team,
        schedule.id,
        { expectedVersion: 0, slots: 5 },
        key,
      );
      expect(first).toMatchObject({ slots: 5, note: null, replayed: false });

      const error = await captureFailure(() =>
        service.updateRecruitment(authUser(ids.owner), ids.team, schedule.id, { expectedVersion: 0, slots: 5, note: null }, key),
      );
      expectHttpCode(error, 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');

      // Nothing about the recruitment itself changed — the second call never got past the
      // idempotency check.
      const after = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId: schedule.id } });
      expect(after).toMatchObject({ slots: 5, note: null, version: 1 });
    },
  );

  // P1-10 regression: reducing `slots` below the current approvedCount must be rejected outright,
  // never silently leave `approvedCount > slots` on record. If this fix is ever reverted, this call
  // succeeds 200 and the recruitment row ends up with slots=1 against 2 APPROVED applicants.
  it(
    'P1-10 regression: reducing guest-recruitment slots below the current approved-applicant ' +
      'count is rejected and mutates nothing',
    async () => {
      const { schedule, recruitment } = await createScheduleWithRecruitment();
      await prisma.v1ScheduleGuestApplication.createMany({
        data: [
          { recruitmentId: recruitment.id, userId: ids.outsider, displayNameSnapshot: 'Approved A', state: 'APPROVED' },
          { recruitmentId: recruitment.id, userId: ids.outsiderB, displayNameSnapshot: 'Approved B', state: 'APPROVED' },
        ],
      });

      const error = await captureFailure(() =>
        service.updateRecruitment(authUser(ids.owner), ids.team, schedule.id, { expectedVersion: 0, slots: 1 }, 'p1-10-slots-below-key'),
      );
      expectHttpCode(error, 409, 'GUEST_RECRUITMENT_SLOTS_BELOW_APPROVED_COUNT');

      const after = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
      expect(after.slots).toBe(recruitment.slots);
      expect(after.version).toBe(recruitment.version);
      expect(after.state).toBe('OPEN');
    },
  );

  // P1-10 regression: setting `slots` to exactly the current approvedCount must auto-transition the
  // recruitment to FILLED (server-derived, per the DTO's own comment) instead of leaving it OPEN
  // forever with no remaining room. If this fix is ever reverted, `after.state` below stays 'OPEN'.
  it(
    'P1-10 regression: setting guest-recruitment slots to exactly the approved-applicant count ' +
      'auto-transitions state to FILLED',
    async () => {
      const { schedule, recruitment } = await createScheduleWithRecruitment();
      await prisma.v1ScheduleGuestApplication.createMany({
        data: [
          { recruitmentId: recruitment.id, userId: ids.outsider, displayNameSnapshot: 'Approved A', state: 'APPROVED' },
          { recruitmentId: recruitment.id, userId: ids.outsiderB, displayNameSnapshot: 'Approved B', state: 'APPROVED' },
        ],
      });

      const result = await service.updateRecruitment(
        authUser(ids.owner),
        ids.team,
        schedule.id,
        { expectedVersion: 0, slots: 2 },
        'p1-10-slots-filled-key',
      );
      expect(result).toMatchObject({ slots: 2, state: 'FILLED', approvedCount: 2 });

      const after = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
      expect(after.state).toBe('FILLED');

      // FILLED is already fully terminal (the pre-existing guard at the top of this method) — a
      // further update attempt (even one that would free room again) must reject, not silently
      // reopen it. This is an existing, unchanged contract this fix must not disturb.
      const error = await captureFailure(() =>
        service.updateRecruitment(authUser(ids.owner), ids.team, schedule.id, { expectedVersion: 1, slots: 5 }, 'p1-10-slots-refilled-key'),
      );
      expectHttpCode(error, 409, 'GUEST_RECRUITMENT_TERMINAL');
    },
  );

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

  // FG-3 regression: exercises GuestRecruitmentService's private
  // insertApplicationOrRecoverDuplicate() DIRECTLY against a pre-seeded, already-committed
  // duplicate row — deterministically hitting the `insertedRows.length === 0` recovery branch
  // that the review found unreachable through the public createApplication() method (the W2
  // schedule/recruitment locks fully serialize concurrent public calls, so the losing caller's
  // pre-insert existence check always observes the winner first). No timing/race dependency here:
  // the row is committed and visible before this call ever starts. If the ON CONFLICT DO NOTHING
  // RETURNING recovery in that method is ever reverted to the old try/catch(P2002) +
  // findUniqueOrThrow-on-the-same-tx pattern, this call throws
  // "current transaction is aborted" instead of returning the recovered row.
  it(
    'FG-3 regression: insertApplicationOrRecoverDuplicate() recovers a genuine duplicate insert ' +
      'via ON CONFLICT DO NOTHING RETURNING, proven directly against a pre-existing committed row',
    async () => {
      const { recruitment } = await createScheduleWithRecruitment();
      await prisma.v1ScheduleGuestApplication.create({
        data: {
          recruitmentId: recruitment.id,
          userId: ids.outsiderB,
          displayNameSnapshot: 'Already here (pre-seeded, no race needed)',
          note: null,
          state: 'PENDING',
        },
      });

      const serviceWithPrivateAccess = service as unknown as {
        insertApplicationOrRecoverDuplicate: (
          tx: unknown,
          recruitmentId: string,
          userId: string,
          dto: { displayName: string; note?: string },
        ) => Promise<{ response: { alreadyApplied: boolean; displayName: string }; isNewInsert: boolean }>;
      };

      const result = await prisma.$transaction((tx) =>
        serviceWithPrivateAccess.insertApplicationOrRecoverDuplicate(tx, recruitment.id, ids.outsiderB, {
          displayName: 'Racer B (conflicting insert attempt)',
        }),
      );

      expect(result.isNewInsert).toBe(false);
      expect(result.response.alreadyApplied).toBe(true);
      expect(result.response.displayName).toBe('Already here (pre-seeded, no race needed)');
      expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsiderB } })).toBe(1);
    },
  );

  // P1-4 regression: a brand-new application must durably record its manager-notification outbox
  // row in the SAME transaction as the application insert — not a fire-and-forget
  // NotificationsService call racing the transaction's own commit. If this fix is reverted (back
  // to the old detached `emitToManyDeferred` call), this test's outbox-row assertions fail: no row
  // with this exact business key/type/payload will exist, since nothing writes it through `tx`.
  it(
    'P1-4 regression: a new guest application records a durable manager-notification outbox row ' +
      'atomically with the application, keyed by applicationId',
    async () => {
      const { schedule, recruitment } = await createScheduleWithRecruitment();

      const response = await service.createApplication(
        authUser(ids.outsider),
        ids.team,
        schedule.id,
        { displayName: 'P1-4 outbox regression applicant' },
        'p1-4-outbox-key',
      );
      expect(response.alreadyApplied).toBe(false);

      const businessKey = `guest-application:${response.applicationId}:manager-notification`;
      const outboxRows = await prisma.$queryRaw<Array<{ count: bigint; type: string; payload: unknown }>>`
        SELECT COUNT(*) AS count, MIN(type::text) AS type, MIN(payload::text) AS payload
        FROM v1_outbox_events WHERE business_key = ${businessKey}
      `;
      expect(Number(outboxRows[0].count)).toBe(1);
      expect(outboxRows[0].type).toBe('SCHEDULE_GUEST_APPLICATION_MANAGER_NOTIFICATION');
      expect(JSON.parse(outboxRows[0].payload as string)).toEqual({
        teamId: ids.team,
        scheduleId: schedule.id,
        displayName: 'P1-4 outbox regression applicant',
      });

      // A replay of the same application (alreadyApplied path) must never enqueue a second outbox
      // row for the SAME applicationId — the manager was already durably queued for notification
      // once, on the original insert.
      const replay = await service.createApplication(
        authUser(ids.outsider),
        ids.team,
        schedule.id,
        { displayName: 'P1-4 outbox regression applicant' },
        'p1-4-outbox-replay-key',
      );
      expect(replay.applicationId).toBe(response.applicationId);
      expect(replay.alreadyApplied).toBe(true);
      const outboxRowsAfterReplay = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM v1_outbox_events WHERE business_key = ${businessKey}
      `;
      expect(Number(outboxRowsAfterReplay[0].count)).toBe(1);

      // Sanity: the recruitment's applicant count reflects the one real application, confirming
      // the outbox insert didn't somehow interfere with the application write itself.
      expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id } })).toBe(1);
    },
  );

  // P1-7 regression: an archived team's guest recruitment must 404 on every mutation path
  // (create/update/apply), not just reads. Uses a dedicated, throwaway team so archiving it can
  // never affect `ids.team`'s shared fixtures used by every other test in this file.
  it(
    "P1-7 regression: an archived team's guest recruitment create/update/apply all reject with " +
      '404 NOT_FOUND_OR_ARCHIVED instead of succeeding',
    async () => {
      const archivedTeamId = 'a1000000-0000-4000-8000-000000000001';
      const archivedOwnerId = 'a1000000-0000-4000-8000-000000000002';
      await prisma.v1User.create({
        data: {
          id: archivedOwnerId,
          email: `${archivedOwnerId}@example.test`,
          phone: '01099000001', // NOT the `010${id.slice(-8)}` helper: these ids differ only in their FIRST segment, so that helper would collide with the base fixture users on the phone unique index
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
      await prisma.v1Team.create({
        data: {
          id: archivedTeamId,
          ownerUserId: archivedOwnerId,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 12 P1-7 archived team fixture',
          status: 'active',
        },
      });
      await prisma.v1TeamMembership.create({
        data: { teamId: archivedTeamId, userId: archivedOwnerId, role: 'owner', status: 'active' },
      });

      const scheduleForCreate = await prisma.v1TeamSchedule.create({
        data: {
          teamId: archivedTeamId,
          title: 'P1-7 fixture schedule (no recruitment yet)',
          type: 'TRAINING',
          startAt: new Date('2026-09-10T10:00:00.000Z'),
          endAt: new Date('2026-09-10T12:00:00.000Z'),
          timezone: 'Asia/Seoul',
          state: 'SCHEDULED',
          visibility: 'PUBLIC',
        },
      });
      const { schedule: scheduleForUpdate, recruitment } = await createScheduleWithRecruitment();
      // createScheduleWithRecruitment() always targets ids.team — move this recruitment's parent
      // schedule under the archived team instead, so update()/createApplication() below exercise
      // an archived-team schedule that already had a recruitment attached before archival (the
      // realistic "was active, later archived" sequence the review describes).
      await prisma.v1TeamSchedule.update({ where: { id: scheduleForUpdate.id }, data: { teamId: archivedTeamId } });

      // Archive the team AFTER both schedules/the recruitment already exist.
      await prisma.v1Team.update({ where: { id: archivedTeamId }, data: { status: 'archived' } });

      const createError = await captureFailure(() =>
        service.createRecruitment(
          authUser(archivedOwnerId),
          archivedTeamId,
          scheduleForCreate.id,
          { slots: 2, closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString() },
          'p1-7-create-key',
        ),
      );
      expectHttpCode(createError, 404, 'NOT_FOUND_OR_ARCHIVED');
      expect(await prisma.v1ScheduleGuestRecruitment.count({ where: { scheduleId: scheduleForCreate.id } })).toBe(0);

      const updateError = await captureFailure(() =>
        service.updateRecruitment(
          authUser(archivedOwnerId),
          archivedTeamId,
          scheduleForUpdate.id,
          { expectedVersion: 0, slots: 5 },
          'p1-7-update-key',
        ),
      );
      expectHttpCode(updateError, 404, 'NOT_FOUND_OR_ARCHIVED');
      const recruitmentAfter = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
      expect(recruitmentAfter.slots).toBe(recruitment.slots);
      expect(recruitmentAfter.version).toBe(recruitment.version);

      const applyError = await captureFailure(() =>
        service.createApplication(
          authUser(ids.outsider),
          archivedTeamId,
          scheduleForUpdate.id,
          { displayName: 'P1-7 outsider applicant' },
          'p1-7-apply-key',
        ),
      );
      expectHttpCode(applyError, 404, 'NOT_FOUND_OR_ARCHIVED');
      expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id } })).toBe(0);
    },
  );

  // P1-8 regression: a manager's own membership row is locked FOR SHARE and re-checked against
  // the LATEST committed state, so a concurrent revoke that commits WHILE a manager mutation is
  // genuinely blocked on that exact row is observed — never raced past with a stale pre-revoke
  // read. Uses a dedicated, throwaway manager membership (not `ids.owner`) so revoking it cannot
  // affect any other test in this file.
  it(
    "P1-8 regression: a manager's guest-recruitment update genuinely serializes against, and " +
      'observes, a concurrent membership revoke that commits while it is blocked on the locked ' +
      'membership row',
    async () => {
      const managerToRevokeId = 'a2000000-0000-4000-8000-000000000001';
      await prisma.v1User.create({
        data: {
          id: managerToRevokeId,
          email: `${managerToRevokeId}@example.test`,
          phone: '01099000002', // see the note above: explicit, collision-free number
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
      const membership = await prisma.v1TeamMembership.create({
        data: { teamId: ids.team, userId: managerToRevokeId, role: 'manager', status: 'active' },
      });
      const { schedule, recruitment } = await createScheduleWithRecruitment();

      // Holder: a real (uncommitted) UPDATE that revokes this exact membership row — takes the
      // same implicit row lock an ordinary UPDATE always takes, which conflicts with the
      // production code's `SELECT ... FOR SHARE` on that row (assertActiveManagerLocked).
      const holder = await holdRowLock(prisma, (tx) =>
        tx.$executeRaw`UPDATE v1_team_memberships SET status = 'removed'::"V1TeamMembershipStatus" WHERE id = ${membership.id}`,
      );

      const updateCall = service.updateRecruitment(
        authUser(managerToRevokeId),
        ids.team,
        schedule.id,
        { expectedVersion: 0, slots: 9 },
        'p1-8-race-key',
      );

      // Proof of genuine contention: with the revoke UPDATE's row lock still held (uncommitted),
      // the manager's own mutation cannot even reach its FOR SHARE membership check yet.
      expect(await isStillPending(updateCall, 250)).toBe(true);

      await holder.release();

      // Once unblocked, the mutation must observe the NOW-COMMITTED revoke, not a stale
      // pre-revoke "active manager" snapshot — this is what a plain (unlocked) read could not
      // guarantee.
      const error = await captureFailure(() => updateCall);
      expectHttpCode(error, 403, 'PERMISSION_DENIED');

      const recruitmentAfter = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
      expect(recruitmentAfter.slots).toBe(recruitment.slots);
      expect(recruitmentAfter.version).toBe(recruitment.version);
    },
  );
});
