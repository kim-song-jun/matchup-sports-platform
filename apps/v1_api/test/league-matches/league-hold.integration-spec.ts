import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { loadReminderGameSides } from '../../src/jobs/lineup-reminders/game-attendee-reminders';
import { isTeamMatchInHeldLeague } from '../../src/league-matches/league-hold';

const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `league-hold-owner-${suiteId}`;
const regularUserId = `league-hold-regular-${suiteId}`;

/**
 * 리그 보류(취소 대신, 2026-10-07 사용자 확정) — 상태가 '보류'가 되고 리그·경기가 공개 화면에서
 * 숨는다. 대진·결과·참가는 그대로고, 보류 해제가 직전 상태·공개 여부로 되돌린다.
 */
describe('리그 보류·보류 해제 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let leagueId: string;

  const admin = (method: 'post' | 'patch', path: string, body: object = {}, user = ownerUserId) =>
    request(app.getHttpServer())[method](`/api/v1/admin/league-matches/${leagueId}${path}`).set('x-v1-user-id', user).send(body);

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.createMany({
      data: [ownerUserId, regularUserId].map((id) => ({
        id, email: `${id}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date(), accountStatus: 'active',
      })),
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all([ownerUserId, regularUserId].map((id) => terms.acceptSignupTerms(id, required)));
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    const region = await prisma.v1Region.create({ data: { code: `league-hold-region-${suiteId}`, name: '보류 테스트 지역', level: 2 } });
    const teams = await Promise.all(['a', 'b'].map((suffix) =>
      prisma.v1Team.create({ data: { ownerUserId, sportId: sport.id, regionId: region.id, name: `league-hold-${suffix}-${suiteId}` } })));
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: `보류 테스트 리그 ${suiteId}`, sportId: sport.id, regionId: region.id,
        startsOn: new Date().toISOString(), endsOn: new Date(Date.now() + 49 * 86_400_000).toISOString(),
        teamIds: teams.map((team) => team.id),
      })
      .expect(201);
    leagueId = created.body.data.leagueId;
    await admin('post', '/fixtures', { weeksCount: 1 }).expect(201);
  });
  afterAll(async () => cleanup?.());

  it('보류하면 상태가 보류·비공개가 되고 경기는 남은 채 공개 화면에서 사라지며, 해제하면 직전 상태로 돌아온다', async () => {
    const before = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } });
    const fixtures = await prisma.v1TeamMatch.findMany({ where: { leagueId }, select: { id: true, status: true } });
    expect(fixtures.length).toBeGreaterThan(0);
    await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`).expect(200);

    const held = await admin('post', '/hold', { reason: '참가팀 사정으로 잠시 멈춤' }).expect(200);
    expect(held.body.data).toEqual({ leagueId, state: 'on_hold', isPublic: false, alreadyProcessed: false });
    expect(await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).toMatchObject({
      status: 'on_hold', isPublic: false, heldFromStatus: before.status, heldFromPublic: true,
    });
    // 남은 경기는 취소하지 않는다 — 그대로 두고 숨기기만 한다.
    expect(await prisma.v1TeamMatch.findMany({ where: { leagueId }, select: { id: true, status: true } })).toEqual(fixtures);
    await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`).expect(404);
    expect((await admin('post', '/hold', { reason: '다시' }).expect(200)).body.data.alreadyProcessed).toBe(true);
    // 보류 중에는 공개로 돌릴 수 없다 — 보류 해제가 공개도 되돌린다.
    expect((await admin('patch', '/visibility', { isPublic: true }).expect(409)).body.code).toBe('LEAGUE_ON_HOLD');
    expect((await admin('post', '/fixtures', { weeksCount: 1 }).expect(409)).body.code).toBe('LEAGUE_ON_HOLD');
    expect((await admin('post', '/fixtures/regenerate', { weeksCount: 1, reason: '보류 상태에서 재생성' }).expect(409)).body.code).toBe('LEAGUE_ON_HOLD');
    expect(await prisma.v1TeamMatch.findMany({ where: { leagueId }, select: { id: true, status: true } })).toEqual(fixtures);
    const detail = await request(app.getHttpServer()).get(`/api/v1/admin/league-matches/${leagueId}`).set('x-v1-user-id', ownerUserId).expect(200);
    expect(detail.body.data).toMatchObject({ state: 'on_hold', isPublic: false });

    const resumed = await admin('post', '/resume', {}).expect(200);
    expect(resumed.body.data).toMatchObject({ leagueId, isPublic: true, alreadyProcessed: false });
    expect(await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).toMatchObject({
      status: before.status, isPublic: true, heldFromStatus: null, heldFromPublic: null,
    });
    await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`).expect(200);
    const actions = await prisma.v1AdminActionLog.findMany({ where: { targetId: leagueId, action: { in: ['league_match.hold', 'league_match.resume'] } }, orderBy: { createdAt: 'asc' } });
    expect(actions.map((row) => row.action)).toEqual(['league_match.hold', 'league_match.resume']);
  });

  it('보류 중에는 이미 예약된 경기 알림 대상에서 빠지고, 보류를 풀면 다시 대상이 된다', async () => {
    const fixtureIds = (await prisma.v1TeamMatch.findMany({ where: { leagueId }, select: { id: true } })).map((row) => row.id);
    const remindable = async () =>
      (await loadReminderGameSides(prisma, { gte: new Date(0) })).filter((side) => fixtureIds.includes(side.teamMatchId)).length;
    expect(fixtureIds.length).toBeGreaterThan(0);
    expect(await remindable()).toBeGreaterThan(0);
    expect(await isTeamMatchInHeldLeague(prisma, fixtureIds[0])).toBe(false);

    await admin('post', '/hold', { reason: '알림 보류 확인' }).expect(200);
    expect(await remindable()).toBe(0);
    expect(await isTeamMatchInHeldLeague(prisma, fixtureIds[0])).toBe(true);

    await admin('post', '/resume', {}).expect(200);
    expect(await remindable()).toBeGreaterThan(0);
    expect(await isTeamMatchInHeldLeague(prisma, fixtureIds[0])).toBe(false);
  });

  it('보류 전에 비공개였으면 해제해도 비공개로 돌아가고, 사유 없는 보류와 일반 사용자는 거부한다', async () => {
    await admin('patch', '/visibility', { isPublic: false }).expect(200);
    await admin('post', '/hold', {}).expect(400);
    await admin('post', '/hold', { reason: '권한 없음' }, regularUserId).expect(403);
    await admin('post', '/hold', { reason: '비공개 리그 보류' }).expect(200);
    const resumed = await admin('post', '/resume').expect(200);
    expect(resumed.body.data.isPublic).toBe(false);
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).isPublic).toBe(false);
  });
});
