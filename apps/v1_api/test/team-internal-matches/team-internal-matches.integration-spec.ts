import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/** 팀 내 경기: 팀원만 읽고, 팀장·매니저만 쓰며, 공개 경기 기록에는 아무것도 남기지 않는다. */
describe('팀 내 경기 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `${name}-${tag}`;
  const owner = id('owner');
  const manager = id('manager');
  const players = Array.from({ length: 6 }, (_, i) => id(`p${i}`));
  const outsider = id('outsider');
  const otherOwner = id('other-owner');
  const noTeam = id('no-team');
  const allUsers = [owner, manager, ...players, outsider, otherOwner, noTeam];
  let teamId: string;
  let otherTeamId: string;
  let sportId: string;
  let regionId: string;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('x-v1-user-id', userId),
    post: (url: string) => request(app.getHttpServer()).post(`/api/v1${url}`).set('x-v1-user-id', userId),
    put: (url: string) => request(app.getHttpServer()).put(`/api/v1${url}`).set('x-v1-user-id', userId),
    del: (url: string) => request(app.getHttpServer()).delete(`/api/v1${url}`).set('x-v1-user-id', userId),
  });
  const base = () => `/teams/${teamId}/internal-matches`;
  const sidesOf = (ids: string[], count: number) => Array.from({ length: count }, (_, i) => ({ userIds: ids.filter((_, j) => j % count === i) }));

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.createMany({
      data: allUsers.map((userId) => ({
        id: userId, email: `${userId}@example.test`, accountStatus: 'active', onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });
    await db.v1UserProfile.createMany({ data: allUsers.map((userId) => ({ userId, nickname: `닉-${userId.slice(0, 6)}` })) });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(allUsers.map((userId) => terms.acceptSignupTerms(userId, required)));
    sportId = (await db.v1Sport.create({ data: { code: `internal-${tag}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `internal-${tag}`, name: '지역', level: 2 } })).id;
    teamId = (await db.v1Team.create({ data: { ownerUserId: owner, sportId, regionId, name: `내부팀-${tag}` } })).id;
    otherTeamId = (await db.v1Team.create({ data: { ownerUserId: otherOwner, sportId, regionId, name: `다른팀-${tag}` } })).id;
    await db.v1TeamMembership.createMany({
      data: [
        { teamId, userId: owner, role: 'owner', status: 'active' },
        { teamId, userId: manager, role: 'manager', status: 'active' },
        ...players.map((userId) => ({ teamId, userId, role: 'member' as const, status: 'active' as const })),
        { teamId: otherTeamId, userId: otherOwner, role: 'owner' as const, status: 'active' as const },
        { teamId: otherTeamId, userId: outsider, role: 'member' as const, status: 'active' as const },
      ],
    });
  });

  afterAll(async () => {
    await db.v1Team.deleteMany({ where: { id: { in: [teamId, otherTeamId] } } });
    await db.v1UserProfile.deleteMany({ where: { userId: { in: allUsers } } });
    await db.v1User.deleteMany({ where: { id: { in: allUsers } } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.delete({ where: { id: sportId } });
    await cleanup?.();
  });

  it('미리보기: 팀장은 선택한 팀원을 1팀·2팀으로 나눈 편성을 받고, 같은 seed 는 같은 결과다', async () => {
    const body = { userIds: players, teamCount: 2, seed: 3 };
    const first = await as(owner).post(`${base()}/preview`).send(body).expect(201);
    const again = await as(owner).post(`${base()}/preview`).send(body).expect(201);
    expect(first.body.data.sides.map((side: { name: string }) => side.name)).toEqual(['1팀', '2팀']);
    expect(first.body.data.sides.map((side: { players: unknown[] }) => side.players.length)).toEqual([3, 3]);
    expect(again.body.data.sides).toEqual(first.body.data.sides);
  });

  it('팀원이 아닌 사람을 고르면 400 이고, 일반 팀원은 만들 수 없다(403)', async () => {
    await as(owner).post(`${base()}/preview`).send({ userIds: [players[0], outsider], teamCount: 2 }).expect(400);
    await as(players[0]).post(base()).send({ playedAt: '2026-11-20T10:00:00.000Z', sides: sidesOf(players, 2) }).expect(403);
    await as(players[0]).post(`${base()}/preview`).send({ userIds: players, teamCount: 2 }).expect(403);
  });

  it('만들기 → 결과 기록 → 수정 → 삭제 전체 흐름(매니저), 공개 경기 기록은 늘지 않는다', async () => {
    const gamesBefore = await db.v1Game.count();
    const created = await as(manager).post(base()).send({ playedAt: '2026-11-20T10:00:00.000Z', sides: sidesOf(players, 2) }).expect(201);
    const match = created.body.data;
    expect(match.sides.map((side: { name: string; score: number | null }) => [side.name, side.score])).toEqual([['1팀', null], ['2팀', null]]);
    expect(match.canManage).toBe(true);
    const [scorer, assister] = match.sides[0].players.map((player: { userId: string }) => player.userId);

    const recorded = await as(owner).put(`${base()}/${match.id}/result`).send({
      scores: [2, 1], goals: [{ sideNumber: 1, scorerUserId: scorer, assistUserId: assister }],
    }).expect(200);
    expect(recorded.body.data.sides.map((side: { score: number }) => side.score)).toEqual([2, 1]);
    expect(recorded.body.data.goals).toHaveLength(1);
    expect(recorded.body.data.resultRecorded).toBe(true);

    const edited = await as(owner).put(`${base()}/${match.id}/result`).send({ scores: [3, 3], goals: [] }).expect(200);
    expect(edited.body.data.sides.map((side: { score: number }) => side.score)).toEqual([3, 3]);
    expect(edited.body.data.goals).toHaveLength(0);

    await as(owner).del(`${base()}/${match.id}`).expect(200);
    await as(owner).get(`${base()}/${match.id}`).expect(404);
    expect(await db.v1TeamInternalMatchPlayer.count({ where: { matchId: match.id } })).toBe(0);
    expect(await db.v1Game.count()).toBe(gamesBefore);
  });

  it('결과 검증: 점수보다 많은 득점 기록·다른 팀 선수·자기 어시스트는 422', async () => {
    const created = await as(owner).post(base()).send({ playedAt: '2026-11-21T10:00:00.000Z', sides: sidesOf(players, 2) }).expect(201);
    const match = created.body.data;
    const [a, b] = match.sides[0].players.map((player: { userId: string }) => player.userId);
    const other = match.sides[1].players[0].userId;
    const put = (payload: object) => as(owner).put(`${base()}/${match.id}/result`).send(payload);
    await put({ scores: [0, 0], goals: [{ sideNumber: 1, scorerUserId: a }] }).expect(422);
    await put({ scores: [1, 0], goals: [{ sideNumber: 1, scorerUserId: other }] }).expect(422);
    await put({ scores: [1, 0], goals: [{ sideNumber: 1, scorerUserId: a, assistUserId: a }] }).expect(422);
    await put({ scores: [1, 0], goals: [{ sideNumber: 1, scorerUserId: a, assistUserId: other }] }).expect(422);
    await put({ scores: [1], goals: [] }).expect(400);
    // 어시스트를 비우는 건 null 로 보내도 같다 — '그 팀 선수만' 오류가 아니라 정상 저장이다.
    await put({ scores: [1, 0], goals: [{ sideNumber: 1, scorerUserId: a, assistUserId: null }] }).expect(200);
    await put({ scores: [1, 0], goals: [{ sideNumber: 1, scorerUserId: a, assistUserId: b }] }).expect(200);
  });

  it('팀원은 목록·상세를 볼 수 있고, 다른 팀 사람·팀 없는 사용자는 403 이다', async () => {
    const list = await as(players[1]).get(base()).expect(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);
    const first = list.body.data.items[0];
    expect(first.sides).toHaveLength(2);
    await as(players[1]).get(`${base()}/${first.id}`).expect(200);

    for (const who of [outsider, noTeam, otherOwner]) {
      await as(who).get(base()).expect(403);
      await as(who).get(`${base()}/${first.id}`).expect(403);
      await as(who).put(`${base()}/${first.id}/result`).send({ scores: [1, 0] }).expect(403);
      await as(who).del(`${base()}/${first.id}`).expect(403);
    }
    await request(app.getHttpServer()).get(`/api/v1${base()}`).expect(401);
  });

  it('다른 팀의 경기 id 로는 읽거나 고칠 수 없다', async () => {
    const mine = (await as(owner).get(base()).expect(200)).body.data.items[0];
    await as(otherOwner).get(`/teams/${otherTeamId}/internal-matches/${mine.id}`).expect(404);
    await as(otherOwner).del(`/teams/${otherTeamId}/internal-matches/${mine.id}`).expect(404);
  });
});
