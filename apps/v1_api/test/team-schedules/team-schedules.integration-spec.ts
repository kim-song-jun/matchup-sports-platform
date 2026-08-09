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
  ownerA: 'task12-final-owner-a',
  managerA: 'task12-final-manager-a',
  outsider: 'task12-final-outsider',
  // 매치 ↔ 팀일정 연동(레인 schedule) 이후 이 스케줄 create() 경로는 teamMatchId가 어느 팀
  // 소유든 상관없이 항상 거부한다 — 아래 "rejects every direct MATCH-type schedule creation
  // attempt" 테스트가 이 id를 payload에 실어 그 거부를 증명하는 용도로만 쓴다.
  teamMatchForTeamA: '12000000-0000-4000-8000-000000000030',
} as const;

function idempotencyKey(label: string): string {
  return `${label}-${randomUUID()}`;
}

// FG-6 / P0-1 / P0-2: existence-leak regressions must compare the ENTIRE error response body —
// code, message, and (via supertest's `.expect(status)`) status — between an "exists but hidden"
// case and a "does not exist" case, never just `.code`. AllExceptionsFilter's error envelope
// (http-exception.filter.ts) includes `requestId` and `timestamp`, which legitimately differ on
// every request and must be excluded from the comparison; every other field (`status`,
// `statusCode`, `code`, `message`, `details`) must be byte-identical.
function stripVolatileFields(body: Record<string, unknown>): Record<string, unknown> {
  const { requestId, timestamp, ...rest } = body;
  return rest;
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
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamA, userId: ids.managerA, role: 'manager', status: 'active' },
      ],
    });
    // 매치 ↔ 팀일정 연동(레인 schedule) 이후 이 스케줄 create() 경로는 teamMatchId를 아예 읽지
    // 않으므로 소유권 검증용 fixture는 더 이상 필요 없다 — teamMatchForTeamA는 payload에 실어
    // "어떤 teamMatchId를 보내도 거부된다"는 것만 증명하는 용도로 남긴다.
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
    // FG-7 fix: this outsider-facing test must use a fixture the outsider can actually reach
    // (PUBLIC schedule + PUBLIC recruitment) — createSchedule()/createRecruitment() default to
    // TEAM/MEMBERS (private), so before the P0-1 fix this outsider POST only "worked" (reaching
    // the deadline check at all) because createApplication() never checked visibility. With that
    // gate in place, an outsider against the private default fixture now 404s before ever
    // reaching the deadline check — see the dedicated P0-1 regression test below for that gate
    // itself.
    const schedule = await createSchedule({ visibility: 'PUBLIC' });
    const recruitment = await createRecruitment(schedule.id, {
      visibility: 'PUBLIC',
      closesAt: '2020-01-01T00:00:00.000Z',
    });

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
    // FG-7 fix: PUBLIC/PUBLIC fixture — see the deadline test above for why.
    const schedule = await createSchedule({ visibility: 'PUBLIC' });
    const recruitment = await createRecruitment(schedule.id, { visibility: 'PUBLIC' });
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
    // FG-7 fix: PUBLIC/PUBLIC fixture — see the deadline test above for why.
    const schedule = await createSchedule({ visibility: 'PUBLIC' });
    const recruitment = await createRecruitment(schedule.id, { visibility: 'PUBLIC' });

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
      // FG-6 fix: comparing `.code` alone would still pass if the two bodies differed in
      // `message` (or any other field) — a real existence leak that a code-only comparison
      // cannot catch. Compare the entire response body (excluding only the two fields that
      // legitimately vary per-request: `requestId` and `timestamp`).
      expect(stripVolatileFields(noRecruitmentResponse.body)).toEqual(stripVolatileFields(trulyMissingResponse.body));

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

  // P0-2 regression: on a PUBLIC schedule (so the CP4 collapse above, which is about the
  // *parent* schedule's visibility, does not apply), a non-member must get an IDENTICAL 404 for
  // "no recruitment attached at all" and "a recruitment exists but is MEMBERS-only". Before the
  // fix these returned different codes (GUEST_RECRUITMENT_NOT_FOUND vs NOT_FOUND_OR_ARCHIVED),
  // a one-bit "a hidden recruitment exists" leak. If GuestRecruitmentService.getRecruitment()
  // ever reintroduces a distinct code for the hidden-MEMBERS branch, the comparison below diverges.
  it(
    'P0-2 regression: on a PUBLIC schedule, a non-member gets an IDENTICAL 404 for "no ' +
      'recruitment" and "a hidden MEMBERS-only recruitment"',
    async () => {
      const publicNoRecruitment = await createSchedule({ visibility: 'PUBLIC' });
      const publicWithHiddenRecruitment = await createSchedule({ visibility: 'PUBLIC' });
      await createRecruitment(publicWithHiddenRecruitment.id); // default visibility: MEMBERS

      const noRecruitmentResponse = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${publicNoRecruitment.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.outsider)
        .expect(404);
      const hiddenRecruitmentResponse = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${publicWithHiddenRecruitment.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.outsider)
        .expect(404);

      expect(hiddenRecruitmentResponse.body.code).toBe('GUEST_RECRUITMENT_NOT_FOUND');
      expect(stripVolatileFields(hiddenRecruitmentResponse.body)).toEqual(stripVolatileFields(noRecruitmentResponse.body));

      // A real member, by contrast, legitimately CAN see the real gap between the two.
      const memberSeesRealGap = await request(app.getHttpServer())
        .get(`/api/v1/teams/${ids.teamA}/schedules/${publicWithHiddenRecruitment.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.managerA)
        .expect(200);
      expect(memberSeesRealGap.body.data).toMatchObject({ visibility: 'MEMBERS' });
    },
  );

  // P0-1 regression: createApplication() previously never checked schedule.visibility or
  // recruitment.visibility at all — only existence + team_id — so an outsider could successfully
  // POST a guest application to a private (non-PUBLIC) schedule's recruitment, or to a
  // MEMBERS-only recruitment on an otherwise-PUBLIC schedule, even though the matching GET (the
  // W8-B/P0-2 tests above) 404s for both. Proves both shapes 404 identically to the corresponding
  // "does not exist" case, AND that no application row is ever created.
  it(
    "P0-1 regression: an outsider's guest application POST is rejected — identically to a " +
      'truly-missing schedule/recruitment — for a private schedule and for a MEMBERS-only ' +
      'recruitment on a PUBLIC schedule',
    async () => {
      const privateSchedule = await createSchedule(); // default visibility: TEAM (private)
      const privateRecruitment = await createRecruitment(privateSchedule.id); // default: MEMBERS, OPEN
      const missingScheduleId = randomUUID();

      const privateResponse = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${privateSchedule.id}/guest-recruitment/applications`)
        .set('x-v1-user-id', ids.outsider)
        .set('idempotency-key', idempotencyKey('p0-1-private'))
        .send({ displayName: 'Outsider on private schedule' })
        .expect(404);
      const missingResponse = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${missingScheduleId}/guest-recruitment/applications`)
        .set('x-v1-user-id', ids.outsider)
        .set('idempotency-key', idempotencyKey('p0-1-missing'))
        .send({ displayName: 'Outsider on missing schedule' })
        .expect(404);

      expect(privateResponse.body.code).toBe('NOT_FOUND_OR_ARCHIVED');
      expect(stripVolatileFields(privateResponse.body)).toEqual(stripVolatileFields(missingResponse.body));
      expect(
        await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: privateRecruitment.id } }),
      ).toBe(0);

      // Same defect, second shape: a PUBLIC schedule whose recruitment is explicitly MEMBERS-only,
      // compared against a PUBLIC schedule with no recruitment attached at all.
      const publicSchedule = await createSchedule({ visibility: 'PUBLIC' });
      const membersOnlyRecruitment = await createRecruitment(publicSchedule.id); // default: MEMBERS
      const publicWithNoRecruitment = await createSchedule({ visibility: 'PUBLIC' });

      const hiddenRecruitmentResponse = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${publicSchedule.id}/guest-recruitment/applications`)
        .set('x-v1-user-id', ids.outsider)
        .set('idempotency-key', idempotencyKey('p0-1-hidden-recruitment'))
        .send({ displayName: 'Outsider on hidden recruitment' })
        .expect(404);
      const noRecruitmentAtAllResponse = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${publicWithNoRecruitment.id}/guest-recruitment/applications`)
        .set('x-v1-user-id', ids.outsider)
        .set('idempotency-key', idempotencyKey('p0-1-no-recruitment'))
        .send({ displayName: 'Outsider on schedule with no recruitment' })
        .expect(404);

      expect(hiddenRecruitmentResponse.body.code).toBe('GUEST_RECRUITMENT_NOT_FOUND');
      expect(stripVolatileFields(hiddenRecruitmentResponse.body)).toEqual(
        stripVolatileFields(noRecruitmentAtAllResponse.body),
      );
      expect(
        await prisma.v1ScheduleGuestApplication.count({ where: { recruitmentId: membersOnlyRecruitment.id } }),
      ).toBe(0);

      // A real member CAN apply to the MEMBERS-only recruitment — this is an outsider-scoped
      // visibility gate, not a universal block on applying.
      const memberApplies = await request(app.getHttpServer())
        .post(`/api/v1/teams/${ids.teamA}/schedules/${publicSchedule.id}/guest-recruitment/applications`)
        .set('x-v1-user-id', ids.managerA)
        .set('idempotency-key', idempotencyKey('p0-1-member-applies'))
        .send({ displayName: 'Manager applying as guest' })
        .expect(200);
      expect(memberApplies.body.data.alreadyApplied).toBe(false);
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
  // holder acquires a lock on the same schedule row TeamSchedulesService.update() itself locks,
  // proves both concurrent PATCHes are genuinely blocked on it, then releases and asserts the
  // same one-winner-one-conflict outcome.
  //
  // FG-4 fix: the holder previously took `FOR UPDATE` — the SAME lock mode update()'s own
  // trailing `UPDATE v1_team_schedules SET ... WHERE id=... AND version=...` CAS statement
  // implicitly takes (any UPDATE that doesn't touch key columns takes `FOR NO KEY UPDATE`, which
  // still conflicts with another `FOR UPDATE` holder). That meant this test passed even with
  // update()'s OWN explicit `lockSchedule()` (`SELECT ... FOR UPDATE`) deleted entirely — the
  // "still pending" assertions below would stay true regardless, because the final bare UPDATE
  // alone was enough to block behind a `FOR UPDATE` holder. `FOR KEY SHARE` is the weakest lock
  // mode that still conflicts with an explicit `FOR UPDATE` (what lockSchedule() takes) while NOT
  // conflicting with an ordinary non-key-column `UPDATE`'s implicit `FOR NO KEY UPDATE` (what the
  // trailing CAS statement takes) — so if lockSchedule()'s explicit lock is ever removed, this
  // holder no longer blocks anything and the "still pending" assertions correctly flip to false,
  // catching the regression instead of silently continuing to pass for the wrong reason.
  it(
    'T3 regression: the schedule row lock genuinely serializes a concurrent PATCH race — proven ' +
      'with a deterministic barrier, not a lucky Promise.all() overlap',
    async () => {
      const schedule = await createSchedule();

      const holder = await holdRowLock(prisma, (tx) =>
        tx.$queryRaw`SELECT id FROM v1_team_schedules WHERE id = ${schedule.id} FOR KEY SHARE`,
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
    // P1-2 fix: the business key now embeds the schedule's rsvpDeadlineAt value (see
    // team-schedules.service.ts's triggerReminder) so a genuinely rescheduled deadline gets its
    // own outbox row instead of being silently swallowed by a stale key's `ON CONFLICT DO NOTHING`.
    const businessKey = `schedule:${schedule.id}:reminder:rsvp_deadline:2026-09-09T00:00:00.000Z`;
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

  // P1-5 regression: `@IsOptional()` treats `null` exactly like an omitted field and skips every
  // other validator on that property — so a real HTTP PATCH body carrying `{"state": null}`
  // previously sailed straight through class-validator and was resolved server-side as CLOSED
  // (`dto.state === undefined ? recruitment.state : dto.state === 'open' ? 'OPEN' : 'CLOSED'`).
  // This drives an actual request through the real ValidationPipe (this file's whole reason to
  // exist, per its own docblock) — the sibling `guest-recruitment.integration-spec.ts` calls
  // GuestRecruitmentService directly and cannot observe DTO-level validation at all. If the DTO
  // fix is ever reverted to plain `@IsOptional()`, this request stops 400ing and instead succeeds,
  // silently closing the recruitment.
  it(
    'P1-5 regression: an explicit null `state` in a guest-recruitment PATCH is rejected 400, never ' +
      'silently treated as CLOSED',
    async () => {
      const schedule = await createSchedule();
      const recruitment = await createRecruitment(schedule.id);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/guest-recruitment`)
        .set('x-v1-user-id', ids.ownerA)
        .set('idempotency-key', idempotencyKey('p1-5-null-state'))
        .send({ expectedVersion: 0, state: null })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');

      const after = await prisma.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
      expect(after.state).toBe('OPEN');
      expect(after.version).toBe(0);
    },
  );

  // 매치 ↔ 팀일정 연동(레인 schedule): MATCH 타입 스케줄은 이제 TeamMatchesService가 트랜잭션
  // 안에서만 만든다 — 이 공개 POST 경로로는 MATCH 타입 자체가 항상 거부되고(SCHEDULE_MATCH_TYPE_
  // SYSTEM_ONLY), teamMatchId 필드는 CreateScheduleDto에서 아예 제거돼 어떤 요청에 실려 있든
  // forbidNonWhitelisted에 의해 400으로 거부된다. 이전에 이 자리에 있던 "제대로 소싱된 MATCH는
  // 201로 성공한다" 시나리오는 더 이상 성립하지 않는다.
  it('rejects every direct MATCH-type schedule creation attempt (system-only) and any teamMatchId field on the payload, and never creates a V1Game row', async () => {
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
    expect(noSource.body.code).toBe('SCHEDULE_MATCH_TYPE_SYSTEM_ONLY');

    const withTeamMatchId = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('match-with-team-match-id'))
      .send({
        title: 'Task 12 final MATCH with a teamMatchId payload field',
        type: 'MATCH',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
        timezone: 'Asia/Seoul',
        teamMatchId: ids.teamMatchForTeamA,
      })
      .expect(400);
    expect(withTeamMatchId.body.code).toBe('VALIDATION_ERROR');

    // The scenario the T2 regression comment actually names — "internal scrimmage" — is a
    // TRAINING-type schedule with no teamMatchId at all. Drive that exact shape for real, then
    // assert the GLOBAL v1Game count is unchanged across this entire test — this is what proves
    // the invariant: creating any Task 12 schedule never silently creates a Game.
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
    // confirm no Game references the team match this test tried (and failed) to source from.
    expect(await prisma.v1Game.count({ where: { teamMatchId: ids.teamMatchForTeamA } })).toBe(0);
  });

  // FG-9 fix: attendance.integration-spec.ts and schedule-crud.integration-spec.ts only ever call
  // ScheduleAttendanceService/TeamSchedulesService methods directly — never through the real HTTP
  // pipeline. Deleting ScheduleAttendanceController or MyScheduleController from their module's
  // `controllers` array, or deleting the `POST .../complete` route/decorator entirely, would not
  // fail a single test in this suite before this block existed. These three smoke tests drive the
  // actual routes through the real Nest HTTP pipeline (guards + ValidationPipe +
  // TransformInterceptor), proving each one is genuinely wired.
  it('PUT .../attendance/me is wired: 200 on success, 401 anonymous, 422 missing Idempotency-Key', async () => {
    const schedule = await createSchedule();

    const missingKey = await request(app.getHttpServer())
      .put(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/attendance/me`)
      .set('x-v1-user-id', ids.managerA)
      .send({ status: 'GOING', expectedVersion: 0 })
      .expect(422);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const anonymous = await request(app.getHttpServer())
      .put(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/attendance/me`)
      .set('idempotency-key', idempotencyKey('attendance-anon'))
      .send({ status: 'GOING', expectedVersion: 0 })
      .expect(401);
    expect(anonymous.body.code).toBe('UNAUTHENTICATED');

    const success = await request(app.getHttpServer())
      .put(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/attendance/me`)
      .set('x-v1-user-id', ids.managerA)
      .set('idempotency-key', idempotencyKey('attendance-ok'))
      .send({ status: 'GOING', expectedVersion: 0 })
      .expect(200);
    expect(success.body.data).toMatchObject({ status: 'GOING', version: 0 });

    const row = await prisma.v1ScheduleAttendance.findUniqueOrThrow({
      where: { scheduleId_userId: { scheduleId: schedule.id, userId: ids.managerA } },
    });
    expect(row.status).toBe('GOING');
  });

  it('POST .../complete is wired: 200 on a real transition, and the default POST 201 regression would be caught here too', async () => {
    const schedule = await createSchedule({
      startAt: '2020-01-01T10:00:00.000Z',
      endAt: '2020-01-01T12:00:00.000Z',
    });

    const missingKey = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/complete`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ expectedVersion: 0 })
      .expect(422);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    // The frozen contract specifies 200 for this route (mirrors the `cancel` HTTP-200 regression
    // test above) — if the `@HttpCode(200)` decorator is ever removed, this becomes NestJS's
    // unmarked-@Post() default of 201 and this `.expect(200)` fails.
    const completed = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/complete`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('complete-http'))
      .send({ expectedVersion: 0 })
      .expect(200);
    expect(completed.body.data).toMatchObject({ state: 'completed', version: 1 });

    const row = await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(row.state).toBe('COMPLETED');
  });

  it('GET /me/schedule is wired: 401 anonymous, 200 with the caller\'s own schedules including a just-completed one', async () => {
    const anonymous = await request(app.getHttpServer()).get('/api/v1/me/schedule').expect(401);
    expect(anonymous.body.code).toBe('UNAUTHENTICATED');

    const schedule = await createSchedule({
      startAt: '2020-01-01T10:00:00.000Z',
      endAt: '2020-01-01T12:00:00.000Z',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamA}/schedules/${schedule.id}/complete`)
      .set('x-v1-user-id', ids.ownerA)
      .set('idempotency-key', idempotencyKey('complete-for-me-schedule'))
      .send({ expectedVersion: 0 })
      .expect(200);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/me/schedule')
      .query({ status: 'completed' })
      .set('x-v1-user-id', ids.ownerA)
      .expect(200);
    expect(mine.body.data.items.map((item: { id: string }) => item.id)).toContain(schedule.id);
  });
});
