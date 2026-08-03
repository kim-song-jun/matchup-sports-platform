import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { holdRowLock, isStillPending } from './helpers/lock-barrier';

/**
 * Task 12 (team schedules) — HTTP contract spec.
 *
 * This is the one spec in the team-schedules test suite that drives requests through the real
 * Nest HTTP pipeline (guards + ValidationPipe + TransformInterceptor + AllExceptionsFilter), not
 * just the service layer directly. The two sibling specs in this directory —
 * attendance.integration-spec.ts and schedule-crud.integration-spec.ts — instantiate their
 * services with only PrismaService as a provider, which proves the CAS/idempotency/business-rule
 * logic but never actually exercises V1AuthGuard/OptionalV1AuthGuard or the global
 * forbidNonWhitelisted ValidationPipe. Several Task 12 acceptance criteria are guard/pipe-level
 * by nature and can only be caught by a real HTTP round trip:
 *   - "an anonymous guest application is rejected"      -> V1AuthGuard's 401 path
 *   - "a caller-supplied userId is rejected"             -> global ValidationPipe's 400 path
 * This file also covers guest-recruitment lane scenarios the sibling specs don't touch at all
 * (deadline enforcement, duplicate-application idempotency, visibility), a genuine concurrent
 * PATCH race on the schedule row (Promise.all, not a sequential stand-in), the cancel -> reminder
 * interaction, and a direct v1Game row-count assertion proving a MATCH-type schedule never
 * silently creates a Game.
 */

const ids = {
  sport: 'task12-final-sport',
  region: 'task12-final-region',
  teamA: 'task12-final-team-a',
  teamB: 'task12-final-team-b',
  ownerA: 'task12-final-owner-a',
  managerA: 'task12-final-manager-a',
  outsider: 'task12-final-outsider',
  teamMatchForTeamA: '12000000-0000-4000-8000-000000000030',
  teamMatchForTeamB: '12000000-0000-4000-8000-000000000031',
} as const;

function idempotencyKey(label: string): string {
  return `${label}-${randomUUID()}`;
}

describe('Task 12 team schedules — HTTP contract (guest-recruitment identity/deadline, cancel/reminder/Game safety, real concurrency)', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.createMany({
      data: [ids.ownerA, ids.managerA, ids.outsider].map((id) => ({
        id,
        email: `${id}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        // V1AuthGuard's global phone-verification write gate (fail-closed by default — see
        // apps/v1_api/src/verification/phone-verification-access.ts) blocks every mutation for an
        // unverified account. The sibling service-level specs never hit this because they call
        // the service directly, bypassing V1AuthGuard entirely; this spec drives real HTTP
        // requests through the guard, so every mutating actor needs phoneVerifiedAt set.
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });
    // V1AuthGuard's terms-reconsent gate (TERMS_RECONSENT_REQUIRED) blocks every mutation for an
    // account that hasn't accepted the currently-required signup terms — every DB-seeded V1User
    // starts with zero v1ManagedTermsConsentEvent rows, and the baseline migration always ships
    // required signup terms documents. Mirrors the pattern in
    // test/integration/phone-verification-write-gate.e2e-spec.ts.
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentSignupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentSignupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      [ids.ownerA, ids.managerA, ids.outsider].map((id) =>
        termsService.acceptSignupTerms(id, requiredDocumentIds),
      ),
    );
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'football' },
      update: {},
      create: { id: ids.sport, code: 'football', name: 'Task 12 Final Football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK12_FINAL_REGION', name: 'Task 12 Final Region', level: 2 },
    });
    await prisma.v1Team.create({
      data: { id: ids.teamA, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 12 Final Team A' },
    });
    // Same physical user owns both teams — only hostTeamId/approvedApplicantTeamId matter for the
    // cross-team teamMatchId ownership check, so a second distinct owner persona isn't needed.
    await prisma.v1Team.create({
      data: { id: ids.teamB, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 12 Final Team B' },
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamA, userId: ids.managerA, role: 'manager', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatchForTeamA,
        hostTeamId: ids.teamA,
        createdByUserId: ids.ownerA,
        sportId: sport.id,
        regionId: ids.region,
        title: 'Task 12 final team A match',
        placeName: 'Task 12 final ground A',
        startAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    // Unrelated to teamA on both hostTeamId and approvedApplicantTeamId — the fixture for the
    // TEAM_MATCH_NOT_FOUND_FOR_TEAM cross-team ownership check.
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatchForTeamB,
        hostTeamId: ids.teamB,
        createdByUserId: ids.ownerA,
        sportId: sport.id,
        regionId: ids.region,
        title: 'Task 12 final team B match',
        placeName: 'Task 12 final ground B',
        startAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => cleanupApp?.());

  async function createSchedule(overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('create-schedule'))
      .send({
        title: 'Task 12 final fixture schedule',
        type: 'TRAINING',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
        timezone: 'Asia/Seoul',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  async function createRecruitment(scheduleId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${scheduleId}/guest-recruitment`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('create-recruitment'))
      .send({
        slots: 3,
        // L2 fix: this must stay relative to "now", never a fixed near-term date. The original
        // literal '2026-09-09T00:00:00.000Z' made every test below that calls createRecruitment()
        // without overriding closesAt silently start failing with 409
        // GUEST_RECRUITMENT_DEADLINE_PASSED the instant that date passes in real wall-clock time
        // (a CI run becomes flaky-forever on a fixed calendar date, not a real regression). The
        // ONE test that intentionally proves deadline rejection still passes its own explicit
        // past `closesAt` override below and is unaffected by this default.
        closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; scheduleId: string };
  }

  it('rejects a guest application submitted after the recruitment deadline and creates no row', async () => {
    const schedule = await createSchedule();
    const recruitment = await createRecruitment(schedule.id, { closesAt: '2020-01-01T00:00:00.000Z' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('x-v1-user-id', ids.outsider)
      .set('idempotency-key', idempotencyKey('deadline'))
      .send({ displayName: 'Deadline tester' })
      .expect(409);
    expect(response.body.code).toBe('GUEST_RECRUITMENT_DEADLINE_PASSED');

    expect(
      await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsider } }),
    ).toBe(0);
  });

  it('replays the identical response for a duplicate application under the same Idempotency-Key instead of double-applying', async () => {
    const schedule = await createSchedule();
    const recruitment = await createRecruitment(schedule.id);
    const key = idempotencyKey('replay');

    const first = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('x-v1-user-id', ids.outsider)
      .set('idempotency-key', key)
      .send({ displayName: 'Replay tester' })
      .expect(200);
    expect(first.body.data).toMatchObject({ alreadyApplied: false, replayed: false });

    const second = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('x-v1-user-id', ids.outsider)
      .set('idempotency-key', key)
      .send({ displayName: 'Replay tester' })
      .expect(200);
    expect(second.body.data).toEqual({ ...first.body.data, replayed: true });

    expect(
      await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsider } }),
    ).toBe(1);
  });

  it('short-circuits a duplicate application sent under a fresh Idempotency-Key with alreadyApplied:true, never creating a second row', async () => {
    const schedule = await createSchedule();
    const recruitment = await createRecruitment(schedule.id);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('x-v1-user-id', ids.outsider)
      .set('idempotency-key', idempotencyKey('dup-a'))
      .send({ displayName: 'Second-key tester' })
      .expect(200);
    expect(first.body.data.alreadyApplied).toBe(false);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('x-v1-user-id', ids.outsider)
      .set('idempotency-key', idempotencyKey('dup-b'))
      .send({ displayName: 'Second-key tester, retried' })
      .expect(200);
    expect(second.body.data).toMatchObject({ applicationId: first.body.data.applicationId, alreadyApplied: true });

    expect(
      await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id, userId: ids.outsider } }),
    ).toBe(1);
  });

  it('rejects an anonymous guest application with 401 and creates no row', async () => {
    const schedule = await createSchedule();
    const recruitment = await createRecruitment(schedule.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('idempotency-key', idempotencyKey('anon'))
      .send({ displayName: 'Ghost applicant' })
      .expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');

    expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id } })).toBe(0);
  });

  it('rejects a caller-supplied userId field on a guest application with 400 VALIDATION_ERROR and creates no row', async () => {
    const schedule = await createSchedule();
    const recruitment = await createRecruitment(schedule.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment/applications`)
      .set('x-v1-user-id', ids.outsider)
      .set('idempotency-key', idempotencyKey('spoof'))
      .send({ displayName: 'Identity spoofer', userId: ids.managerA })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');

    expect(await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: recruitment.id } })).toBe(0);
  });

  it('hides a MEMBERS-visibility guest recruitment from a non-member (404) while a PUBLIC one on a PUBLIC schedule is readable anonymously', async () => {
    const memberOnlySchedule = await createSchedule();
    await createRecruitment(memberOnlySchedule.id); // default visibility: MEMBERS

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${memberOnlySchedule.id}/guest-recruitment`)
      .set('x-v1-user-id', ids.outsider)
      .expect(404);
    expect(hidden.body.code).toBe('NOT_FOUND_OR_ARCHIVED');

    const publicScheduleWithPublicRecruitment = await createSchedule({ visibility: 'PUBLIC' });
    await createRecruitment(publicScheduleWithPublicRecruitment.id, { visibility: 'PUBLIC' });

    const visible = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${publicScheduleWithPublicRecruitment.id}/guest-recruitment`)
      .expect(200);
    expect(visible.body.data).toMatchObject({ visibility: 'PUBLIC' });
  });

  // W8-B regression: GuestRecruitmentService.getRecruitment() now gates on the PARENT schedule's
  // own visibility BEFORE it ever looks at the recruitment's own visibility. Before the fix, a
  // PUBLIC-visibility recruitment attached to a TEAM (private, membership-required) schedule was
  // readable by any anonymous caller who merely knew the scheduleId — the parent's own privacy was
  // bypassed entirely, since the dedicated endpoint only ever checked `recruitment.visibility`. If
  // this parent-visibility gate is ever reverted, the anonymous/non-member GETs below flip from
  // 404 back to 200.
  it(
    'W8-B regression: neither an anonymous caller nor a non-member can read a PUBLIC-visibility ' +
      'guest recruitment attached to a private (TEAM-visibility) schedule',
    async () => {
      const privateSchedule = await createSchedule(); // default visibility: TEAM (private)
      await createRecruitment(privateSchedule.id, { visibility: 'PUBLIC' });

      const anonymous = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${privateSchedule.id}/guest-recruitment`)
        .expect(404);
      expect(anonymous.body.code).toBe('NOT_FOUND_OR_ARCHIVED');

      const nonMember = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${privateSchedule.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.outsider)
        .expect(404);
      expect(nonMember.body.code).toBe('NOT_FOUND_OR_ARCHIVED');

      // A real member can still see it — this is a visibility gate, not data loss.
      const member = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${privateSchedule.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.managerA)
        .expect(200);
      expect(member.body.data).toMatchObject({ visibility: 'PUBLIC' });
    },
  );

  // CP4 regression: for a non-member on a private (TEAM-visibility) schedule, "no recruitment
  // attached at all" and "the schedule does not exist at all" must be indistinguishable — both
  // 404 NOT_FOUND_OR_ARCHIVED. Before the fix, a private schedule that existed but had no
  // recruitment returned the distinct `GUEST_RECRUITMENT_NOT_FOUND` code to a non-member, a
  // one-bit "this schedule id exists" existence leak. If this collapse is ever reverted, the two
  // response codes asserted equal below diverge.
  it(
    'CP4 regression: a non-member gets the identical 404 code for "private schedule with no ' +
      'recruitment" and "schedule does not exist at all" — existence stays hidden',
    async () => {
      const privateScheduleNoRecruitment = await createSchedule(); // default visibility: TEAM, no recruitment attached
      const trulyMissingScheduleId = randomUUID();

      const noRecruitmentResponse = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${privateScheduleNoRecruitment.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.outsider)
        .expect(404);
      const trulyMissingResponse = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${trulyMissingScheduleId}/guest-recruitment`)
        .set('x-v1-user-id', ids.outsider)
        .expect(404);

      expect(noRecruitmentResponse.body.code).toBe('NOT_FOUND_OR_ARCHIVED');
      expect(trulyMissingResponse.body.code).toBe('NOT_FOUND_OR_ARCHIVED');
      expect(noRecruitmentResponse.body.code).toBe(trulyMissingResponse.body.code);

      // A real member, by contrast, legitimately CAN distinguish the two — existence is not a
      // secret from active members. This is what proves the collapse above is a genuine
      // non-member-scoped existence-hiding rule, not just "this route always returns one code".
      const memberSeesRealGap = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${privateScheduleNoRecruitment.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.managerA)
        .expect(404);
      expect(memberSeesRealGap.body.code).toBe('GUEST_RECRUITMENT_NOT_FOUND');
    },
  );

  // W8-A regression: schedule detail must not leak a MEMBERS-only recruitment just because the
  // PARENT schedule itself is PUBLIC. Before the fix, TeamSchedulesService.detail() authorized
  // solely against the parent's own visibility and then unconditionally attached the full
  // recruitment (note/state/slots/counts) — contradicting GuestRecruitmentService's own MEMBERS
  // rule for the identical child resource reached through its dedicated endpoint. If this
  // redaction is ever reverted, `detail.body.data.guestRecruitment` below becomes non-null again.
  it('redacts a MEMBERS-visibility guest recruitment from schedule detail when the parent schedule itself is PUBLIC', async () => {
    const publicSchedule = await createSchedule({ visibility: 'PUBLIC' });
    await createRecruitment(publicSchedule.id); // default visibility: MEMBERS

    const anonymousDetail = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${publicSchedule.id}`)
      .expect(200);
    expect(anonymousDetail.body.data.visibility).toBe('PUBLIC');
    expect(anonymousDetail.body.data.guestRecruitment).toBeNull();

    const outsiderDetail = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${publicSchedule.id}`)
      .set('x-v1-user-id', ids.outsider)
      .expect(200);
    expect(outsiderDetail.body.data.guestRecruitment).toBeNull();

    // A real member can still see it — this is a redaction rule, not data loss.
    const memberDetail = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${publicSchedule.id}`)
      .set('x-v1-user-id', ids.managerA)
      .expect(200);
    expect(memberDetail.body.data.guestRecruitment).not.toBeNull();
  });

  it('resolves a real concurrent PATCH race on the same expectedVersion to exactly one 200 and one 409 VERSION_CONFLICT', async () => {
    const schedule = await createSchedule();

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('race-a'))
        .send({ expectedVersion: 0, title: 'Race winner A' }),
      request(app.getHttpServer())
        .patch(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}`)
        .set('x-v1-user-id', ids.managerA)
        .set('idempotency-key', idempotencyKey('race-b'))
        .send({ expectedVersion: 0, title: 'Race winner B' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    expect(winner.body.data.version).toBe(1);
    expect(loser.body.code).toBe('VERSION_CONFLICT');

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(row.version).toBe(1);
  });

  // T3 regression: the test above issues two concurrent PATCH requests via Promise.all(), but per
  // the review, that alone does not prove the requests actually overlapped at the row-lock level
  // — the two HTTP requests could simply have executed sequentially (Express/Nest's request
  // handling and the DB connection pool do not guarantee true simultaneity) and the test would
  // still pass. This test forces the exact contention with a real Postgres row lock: an external
  // holder acquires the same schedule row's FOR UPDATE lock TeamSchedulesService.update() itself
  // takes, proves both concurrent PATCHes are genuinely blocked on it, then releases and asserts
  // the same one-winner-one-conflict outcome. If update() ever stops locking the schedule row
  // before its CAS check, the "still pending" assertions below flip to false.
  it(
    'T3 regression: the schedule row lock genuinely serializes a concurrent PATCH race — proven ' +
      'with a deterministic barrier, not a lucky Promise.all() overlap',
    async () => {
      const schedule = await createSchedule();

      const holder = await holdRowLock(prisma, (tx) =>
        tx.$queryRaw`SELECT id FROM v1_team_schedules WHERE id = ${schedule.id} FOR UPDATE`,
      );

      const callA = request(app.getHttpServer())
        .patch(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('barrier-race-a'))
        .send({ expectedVersion: 0, title: 'Barrier race winner A' });
      const callB = request(app.getHttpServer())
        .patch(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}`)
        .set('x-v1-user-id', ids.managerA)
        .set('idempotency-key', idempotencyKey('barrier-race-b'))
        .send({ expectedVersion: 0, title: 'Barrier race winner B' });

      const [aPending, bPending] = await Promise.all([isStillPending(callA, 250), isStillPending(callB, 250)]);
      expect(aPending).toBe(true);
      expect(bPending).toBe(true);

      await holder.release();

      const [a, b] = await Promise.all([callA, callB]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = a.status === 200 ? a : b;
      expect(winner.body.data.version).toBe(1);

      const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      expect(row.version).toBe(1);
    },
  );

  it('cancel blocks any new reminder trigger and never deletes the schedule row', async () => {
    const schedule = await createSchedule({ rsvpDeadlineAt: '2026-09-09T00:00:00.000Z' });

    const reminder = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/reminders`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('reminder-before-cancel'))
      .send({ kind: 'rsvp_deadline' })
      .expect(200);
    const businessKey = `schedule:${schedule.id}:reminder:rsvp_deadline`;
    const outboxBefore = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM v1_outbox_events WHERE business_key = ${businessKey}
    `;
    expect(Number(outboxBefore[0].count)).toBe(1);
    expect(reminder.body.data.jobId).toBeTruthy();

    // The frozen contract (docs/api/global-contract.md) specifies 200 for this route.
    // TeamSchedulesController.cancel() now carries an explicit @HttpCode(200) — asserting the
    // contracted 200 here (not NestJS's unmarked-@Post() default of 201) is what actually
    // catches a regression back to the default.
    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/cancel`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('cancel'))
      .send({ expectedVersion: 0, cancelReason: 'Task 12 final HTTP spec cancel test' })
      .expect(200);
    expect(cancelled.body.data).toMatchObject({ state: 'cancelled', version: 1 });

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/reminders`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('reminder-after-cancel'))
      .send({ kind: 'rsvp_deadline' })
      .expect(409);
    expect(blocked.body.code).toBe('SCHEDULE_TERMINAL');

    const outboxAfter = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM v1_outbox_events WHERE business_key = ${businessKey}
    `;
    expect(Number(outboxAfter[0].count)).toBe(1);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}`)
      .set('x-v1-user-id', ids.ownerA)
      .expect(200);
    expect(detail.body.data.state).toBe('CANCELLED');

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(row.state).toBe('CANCELLED');
  });

  // W5 regression: the `guest_recruitment_close` reminder branch previously enqueued a reminder
  // regardless of the parent schedule's or the recruitment's own terminal state — only the
  // `rsvp_deadline` branch (covered by the "cancel blocks any new reminder trigger" test above)
  // checked `schedule.state`. Drives both terminal paths for real: (1) cancelling the schedule
  // (which closes its attached OPEN recruitment in the same transaction) must reject a subsequent
  // guest-close reminder trigger with `SCHEDULE_TERMINAL`, and (2) closing a recruitment WITHOUT
  // cancelling its parent schedule must independently reject the same trigger with
  // `GUEST_RECRUITMENT_TERMINAL`. If either guard is ever reverted, the corresponding `.expect(409)`
  // below flips to 200 and a stray outbox row is created.
  it(
    'W5 regression: a guest_recruitment_close reminder trigger is rejected 409 once the ' +
      'schedule is cancelled, and separately once only the recruitment is closed',
    async () => {
      const cancelledCase = await createSchedule();
      await createRecruitment(cancelledCase.id);
      await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${cancelledCase.id}/cancel`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('w5-cancel'))
        .send({ expectedVersion: 0, cancelReason: 'W5 regression: cancel path' })
        .expect(200);

      const afterCancel = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${cancelledCase.id}/reminders`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('w5-cancel-reminder'))
        .send({ kind: 'guest_recruitment_close' })
        .expect(409);
      expect(afterCancel.body.code).toBe('SCHEDULE_TERMINAL');

      const businessKeyCancelled = `schedule:${cancelledCase.id}:reminder:guest_recruitment_close`;
      const outboxAfterCancel = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM v1_outbox_events WHERE business_key = ${businessKeyCancelled}
      `;
      expect(Number(outboxAfterCancel[0].count)).toBe(0);

      const closedRecruitmentCase = await createSchedule();
      await createRecruitment(closedRecruitmentCase.id);
      await request(app.getHttpServer())
        .patch(`/api/v1/teams/${ids.teamA}/schedules/${closedRecruitmentCase.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('w5-close-recruitment'))
        .send({ expectedVersion: 0, state: 'closed' })
        .expect(200);

      const afterClose = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${closedRecruitmentCase.id}/reminders`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('w5-close-reminder'))
        .send({ kind: 'guest_recruitment_close' })
        .expect(409);
      expect(afterClose.body.code).toBe('GUEST_RECRUITMENT_TERMINAL');

      const businessKeyClosed = `schedule:${closedRecruitmentCase.id}:reminder:guest_recruitment_close`;
      const outboxAfterClose = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM v1_outbox_events WHERE business_key = ${businessKeyClosed}
      `;
      expect(Number(outboxAfterClose[0].count)).toBe(0);
    },
  );

  it('rejects a MATCH-type schedule missing its team-match source and one referencing an unrelated team, then never creates a V1Game row for a properly-sourced one', async () => {
    // T2 regression: the total v1Game count is captured up front (not filtered to one
    // teamMatchId) so the assertion at the end genuinely proves "this request created no Game
    // anywhere", not just "no Game happens to carry this one specific teamMatchId" — a regression
    // that created a Game with a NULL or different linkage would previously have slipped past the
    // original, narrowly-filtered assertion.
    const gamesBefore = await prisma.v1Game.count();

    const noSource = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('match-no-source'))
      .send({
        title: 'Task 12 final MATCH without source',
        type: 'MATCH',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
        timezone: 'Asia/Seoul',
      })
      .expect(422);
    expect(noSource.body.code).toBe('SCHEDULE_MATCH_SOURCE_REQUIRED');

    const crossTeam = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('match-cross-team'))
      .send({
        title: 'Task 12 final MATCH cross-team',
        type: 'MATCH',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
        timezone: 'Asia/Seoul',
        teamMatchId: ids.teamMatchForTeamB,
      })
      .expect(404);
    expect(crossTeam.body.code).toBe('TEAM_MATCH_NOT_FOUND_FOR_TEAM');

    const sourced = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('match-sourced'))
      .send({
        title: 'Task 12 final MATCH properly sourced',
        type: 'MATCH',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
        timezone: 'Asia/Seoul',
        teamMatchId: ids.teamMatchForTeamA,
      })
      .expect(201);
    expect(sourced.body.data.teamMatchId).toBe(ids.teamMatchForTeamA);

    // T2 regression: the scenario the comment actually names — "internal scrimmage" — is a
    // TRAINING-type schedule with no teamMatchId at all, never a MATCH-type schedule (which the
    // three requests above already cover). Drive that exact shape for real, then assert the
    // GLOBAL v1Game count is unchanged across this entire test (not just "no Game happens to
    // reference teamMatchForTeamA") — this is what actually proves the reviewer's invariant:
    // creating any Task 12 schedule, of any type, never silently creates a Game through any
    // linkage. A regression that created a Game via, say, `teamMatchId: null` or an unrelated
    // aggregate would previously have slipped past a count filtered to one specific
    // teamMatchId; it cannot slip past a global before/after count.
    const internalScrimmage = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('internal-scrimmage'))
      .send({
        title: 'Task 12 final internal scrimmage (no team match source)',
        type: 'TRAINING',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
        timezone: 'Asia/Seoul',
      })
      .expect(201);
    expect(internalScrimmage.body.data.teamMatchId).toBeNull();

    const gamesAfter = await prisma.v1Game.count();
    expect(gamesAfter).toBe(gamesBefore);

    // Belt-and-suspenders on the one relation a Game can ever carry (`teamMatchId`, the schema's
    // only schedule-adjacent linkage — V1Game has no direct scheduleId at all): still explicitly
    // confirm no Game references the specific team match this test's MATCH-type schedule used.
    expect(await prisma.v1Game.count({ where: { teamMatchId: ids.teamMatchForTeamA } })).toBe(0);
  });
});
