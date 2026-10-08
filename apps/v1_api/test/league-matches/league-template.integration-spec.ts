import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

/** KST 달력 날짜 문자열 — 서버가 그 날의 KST 벽시계로 해석한다. 과거 날짜는 422 라 항상 미래로 만든다. */
const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

describe('POST /admin/league-matches/:leagueId/fixtures/template', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let supportUserId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lstp');
    supportUserId = await h.makeAdmin('support');
  });
  afterAll(async () => cleanup?.());

  const post = (leagueId: string, body: unknown, userId = h.adminUserId) =>
    request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
      .set('x-v1-user-id', userId)
      .send(body as object);
  const statusOf = async (leagueId: string) =>
    (await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId }, select: { status: true } })).status;

  it('4팀 2회전: 자리 4개 + 빈 경기 12개, 라운드마다 일정 날짜가 맞고 리그 상태는 그대로다', async () => {
    const leagueId = await h.makeLeague();
    const dates = kstDates(6);

    const res = await post(leagueId, { teamCount: 4, legs: 2, schedule: { dates, time: '19:00' }, placeName: '마포 풋살장' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ slots: 4, fixtures: 12 });
    const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId }, orderBy: { position: 'asc' } });
    expect(slots.map((slot) => [slot.kind, slot.groupId, slot.position, slot.registrationId])).toEqual([
      ['ENTRY', null, 1, null], ['ENTRY', null, 2, null], ['ENTRY', null, 3, null], ['ENTRY', null, 4, null],
    ]);
    const fixtures = await h.prisma.v1TeamMatch.findMany({ where: { leagueId } });
    expect(fixtures).toHaveLength(12);
    expect(fixtures.every((f) => f.status === 'matched' && f.hostTeamId === null && f.approvedApplicantTeamId === null)).toBe(true);
    expect(fixtures.every((f) => f.placeName === '마포 풋살장' && f.homeSlotId !== null && f.awaySlotId !== null)).toBe(true);
    // 슬롯마다 홈 3 · 원정 3 — 2회전은 홈/원정이 서로 한 번씩이다.
    for (const slot of slots) {
      expect(fixtures.filter((f) => f.homeSlotId === slot.id)).toHaveLength(3);
      expect(fixtures.filter((f) => f.awaySlotId === slot.id)).toHaveLength(3);
    }
    // 제목의 N주차 ↔ 일정 날짜(N번째) — 라운드와 날짜가 어긋나면 여기서 잡힌다.
    for (const fixture of fixtures) {
      const round = Number(/(\d+)주차$/.exec(fixture.title)?.[1]);
      expect(fixture.startAt?.toISOString()).toBe(new Date(`${dates[round - 1]}T19:00:00+09:00`).toISOString());
    }
    expect(await statusOf(leagueId)).toBe('draft');
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId } } })).toBe(0);
  });

  it('일정은 필수다 — 없으면 400, 날짜가 모자라면 422, 과거 날짜는 422 이고 아무것도 만들지 않는다', async () => {
    const leagueId = await h.makeLeague();
    expect((await post(leagueId, { teamCount: 4, legs: 1 })).status).toBe(400);
    const few = await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(2), time: '19:00' } });
    expect(few.status).toBe(422);
    expect(few.body.code).toBe('LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT');
    const past = await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: ['2020-01-01', ...kstDates(2)], time: '19:00' } });
    expect(past.status).toBe(422);
    expect(past.body.code).toBe('LEAGUE_SCHEDULE_DATE_PAST');
    expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } })).toBe(0);
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);
  });

  it('범위 밖 팀 수(2·21)는 400, 경기 수가 240을 넘으면(17팀 2회전=272) 422 BRACKET_TEMPLATE_TOO_LARGE', async () => {
    const leagueId = await h.makeLeague();
    const schedule = { dates: kstDates(40), time: '19:00' };
    expect((await post(leagueId, { teamCount: 2, legs: 1, schedule })).status).toBe(400);
    expect((await post(leagueId, { teamCount: 21, legs: 1, schedule })).status).toBe(400);
    const tooLarge = await post(leagueId, { teamCount: 17, legs: 2, schedule });
    expect(tooLarge.status).toBe(422);
    expect(tooLarge.body.code).toBe('BRACKET_TEMPLATE_TOO_LARGE');
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);
  });

  it('대진이 이미 있으면 409 LEAGUE_FIXTURES_EXIST — 템플릿 두 번째 호출·일반 대진·완료 리그 모두', async () => {
    const body = { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } };
    const twice = await h.makeLeague();
    expect((await post(twice, body)).status).toBe(201);
    const second = await post(twice, body);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('LEAGUE_FIXTURES_EXIST');
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId: twice } })).toBe(3);

    const teamA = await h.makeTeam('lstp-a');
    const teamB = await h.makeTeam('lstp-b');
    const legacy = await h.makeLeague({ teams: [teamA, teamB], state: 'active' });
    await h.createFixture(legacy, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    expect((await post(legacy, body)).body.code).toBe('LEAGUE_FIXTURES_EXIST');

    const completed = await h.makeLeague({ teams: [teamA, teamB], state: 'completed' });
    await h.createFixture(completed, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    const done = await post(completed, body);
    expect(done.status).toBe(409);
    expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: completed } })).toBe(0);
  });

  it('보류 리그는 409 LEAGUE_ON_HOLD, support 어드민과 일반 사용자는 403', async () => {
    const body = { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } };
    const held = await h.makeLeague();
    await h.prisma.v1Tournament.update({ where: { id: held }, data: { status: 'on_hold' } });
    const res = await post(held, body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAGUE_ON_HOLD');

    const open = await h.makeLeague();
    const support = await post(open, body, supportUserId);
    expect(support.status).toBe(403);
    expect(support.body.code).toBe('PERMISSION_DENIED');
    expect((await post(open, body, 'lstp-nobody')).status).toBeGreaterThanOrEqual(401);
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId: open } })).toBe(0);
  });

  it('동시성: 같은 리그에 템플릿을 두 번 동시에 → 하나만 성공하고 경기는 한 벌만 남는다', async () => {
    const leagueId = await h.makeLeague();
    const body = { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } };
    const results = await Promise.all([post(leagueId, body), post(leagueId, body)]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(6);
    expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } })).toBe(4);
  });

  it('동시성: 템플릿과 기존 일괄 생성을 동시에 → 하나만 성공한다(리그 행 잠금이 직렬화)', async () => {
    const teamA = await h.makeTeam('lstp-c');
    const teamB = await h.makeTeam('lstp-d');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const template = post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
    const generate = request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ weeksCount: 1, schedule: { dates: kstDates(1), time: '19:00' } });
    const results = await Promise.all([template, generate]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = results.find((res) => res.status === 409);
    expect(loser?.body.code).toBe('LEAGUE_FIXTURES_EXIST');
    const slotRows = await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } });
    const fixtureRows = await h.prisma.v1TeamMatch.count({ where: { leagueId } });
    // 둘 중 한 갈래의 결과만 남는다 — 템플릿(자리 4 · 경기 6) 아니면 일괄 생성(자리 0 · 경기 1).
    expect(`${slotRows}:${fixtureRows}`).toMatch(/^(4:6|0:1)$/);
  });

  describe('replaceExisting', () => {
    const body = (overrides: Record<string, unknown> = {}) => ({
      teamCount: 5, legs: 1, schedule: { dates: kstDates(5), time: '19:00' }, replaceExisting: true, ...overrides,
    });

    it('시작 전 템플릿 대진을 취소로 접고 옛 자리를 지운 뒤 새로 만든다', async () => {
      const leagueId = await h.makeLeague();
      expect((await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } })).status).toBe(201);
      const oldSlotIds = (await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId } })).map((slot) => slot.id);

      const res = await post(leagueId, body());

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ slots: 5, fixtures: 10 });
      const fixtures = await h.prisma.v1TeamMatch.findMany({ where: { leagueId } });
      const cancelled = fixtures.filter((f) => f.status === 'cancelled');
      expect(cancelled).toHaveLength(6);
      expect(cancelled.every((f) => f.homeSlotId === null && f.awaySlotId === null)).toBe(true);
      expect(fixtures.filter((f) => f.status === 'matched')).toHaveLength(10);
      const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId } });
      expect(slots).toHaveLength(5);
      expect(slots.some((slot) => oldSlotIds.includes(slot.id))).toBe(false);
      expect((await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status).toBe('draft');
    });

    it('팀이 찬 시작 전 경기도 교체되고 그 팀의 팀 일정은 취소된다', async () => {
      const teamA = await h.makeTeam('lstp-r1');
      const teamB = await h.makeTeam('lstp-r2');
      const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
      const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

      expect((await post(leagueId, body({ teamCount: 3, schedule: { dates: kstDates(3), time: '19:00' } }))).status).toBe(201);

      expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('cancelled');
      const schedules = await h.prisma.v1TeamSchedule.findMany({ where: { teamMatchId } });
      expect(schedules).toHaveLength(2);
      expect(schedules.every((row) => row.state === 'CANCELLED')).toBe(true);
    });

    it('시작했거나 결과가 있는 경기가 하나라도 있으면 409 BRACKET_LOCKED 이고 아무것도 바뀌지 않는다', async () => {
      for (const state of ['LIVE', 'ENDED'] as const) {
        const leagueId = await h.makeLeague();
        await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
        const fixtures = await h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
        await h.prisma.v1Game.update({ where: { teamMatchId: fixtures[3].id }, data: { state } });

        const res = await post(leagueId, body());

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('BRACKET_LOCKED');
        const after = await h.prisma.v1TeamMatch.findMany({ where: { leagueId } });
        expect(after).toHaveLength(6);
        expect(after.every((f) => f.status === 'matched' && f.homeSlotId !== null)).toBe(true);
        expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } })).toBe(4);
      }
    });

    it('이전에 취소된 경기는 교체를 막지 않고 그대로 남는다', async () => {
      const leagueId = await h.makeLeague();
      await post(leagueId, { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
      const [first] = await h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${first.id}/cancel`)
        .set('x-v1-user-id', h.adminUserId)
        .send({ reason: '사전 취소' });

      const res = await post(leagueId, body({ teamCount: 3, schedule: { dates: kstDates(3), time: '19:00' } }));

      expect(res.status).toBe(201);
      expect(await h.prisma.v1TeamMatch.count({ where: { leagueId, status: 'cancelled' } })).toBe(3);
      expect(await h.prisma.v1TeamMatch.count({ where: { leagueId, status: 'matched' } })).toBe(3);
    });

    it('대조군: replaceExisting 을 안 주거나 false 면 기존 대진이 있을 때 그대로 409 LEAGUE_FIXTURES_EXIST', async () => {
      const leagueId = await h.makeLeague();
      await post(leagueId, { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
      const res = await post(leagueId, body({ teamCount: 3, replaceExisting: false }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAGUE_FIXTURES_EXIST');
    });
  });
});
