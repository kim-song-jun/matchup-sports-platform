import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';

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
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task12-final-football' },
      update: {},
      create: { id: ids.sport, code: 'task12-final-football', name: 'Task 12 Final Football' },
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
        closesAt: '2026-09-09T00:00:00.000Z',
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

  it('hides a MEMBERS-visibility guest recruitment from a non-member (404) while a PUBLIC one is readable anonymously', async () => {
    const memberOnlySchedule = await createSchedule();
    await createRecruitment(memberOnlySchedule.id); // default visibility: MEMBERS

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${memberOnlySchedule.id}/guest-recruitment`)
      .set('x-v1-user-id', ids.outsider)
      .expect(404);
    expect(hidden.body.code).toBe('NOT_FOUND_OR_ARCHIVED');

    const publicSchedule = await createSchedule();
    await createRecruitment(publicSchedule.id, { visibility: 'PUBLIC' });

    const visible = await request(app.getHttpServer())
      .get(`/api/v1/teams/${ids.teamA}/schedules/${publicSchedule.id}/guest-recruitment`)
      .expect(200);
    expect(visible.body.data).toMatchObject({ visibility: 'PUBLIC' });
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

  it('rejects a MATCH-type schedule missing its team-match source and one referencing an unrelated team, then never creates a V1Game row for a properly-sourced one', async () => {
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

    // The actual proof of "internal scrimmage cannot silently create a Game without an explicit
    // source": no path in the team-schedules lane ever touches GamesService or v1Game at all, so
    // creating (even a valid) MATCH-type schedule must never insert a row there.
    expect(await prisma.v1Game.count({ where: { teamMatchId: ids.teamMatchForTeamA } })).toBe(0);
  });
});
