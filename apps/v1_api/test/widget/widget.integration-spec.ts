import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const DAY = 24 * 60 * 60 * 1_000;

/** 위젯: 위젯 토큰만으로 내 팀 경기를 읽는다. 진행 중이 먼저, 점수는 공개 정책이 허용할 때만, 남의 경기·끝난 경기는 안 나온다. */
describe('위젯 내 팀 경기 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `${name}-${tag}`;
  const userA = id('wa');
  const userB = id('wb');
  const userC = id('wc');
  const userD = id('wd');
  const users = [userA, userB, userC, userD];
  let team1: string;
  let team2: string;
  let team3: string;
  let sportId: string;
  let regionId: string;
  let configId: string;
  let previousSecret: string | undefined;
  const games: Record<string, string> = {};
  const createdTeamMatchIds: string[] = [];

  const as = (userId: string) => ({
    post: (url: string) => request(app.getHttpServer()).post(`/api/v1${url}`).set('x-v1-user-id', userId),
    del: (url: string) => request(app.getHttpServer()).delete(`/api/v1${url}`).set('x-v1-user-id', userId),
  });
  const bearer = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    del: (url: string) => request(app.getHttpServer()).delete(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
  });
  const tokenOf = async (userId: string) => (await as(userId).post('/me/widget-token').expect(201)).body.data.token as string;

  async function makeGame(key: string, input: { host: string; away: string; startOffsetMs: number; state: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED'; policy?: 'LIVE' | 'HIDDEN' | 'OFFICIAL_ONLY' }) {
    const teamMatch = await db.v1TeamMatch.create({
      data: {
        sportId, regionId, title: `경기-${key}-${tag}`, hostTeamId: input.host, approvedApplicantTeamId: input.away, createdByUserId: userA,
        placeName: `구장-${key}`, startAt: new Date(Date.now() + input.startOffsetMs), status: 'matched', competitionConfigVersionId: configId,
      },
    });
    createdTeamMatchIds.push(teamMatch.id);
    const creation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: input.host, displayNameSnapshot: `홈-${key}` },
        { sideKey: V1GameSideKey.AWAY, teamId: input.away, displayNameSnapshot: `원정-${key}` },
      ],
      participants: [],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: userA, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `widget-${tag}-${teamMatch.id}`,
      payloadHash: canonicalGameCommandPayloadHash(creation),
    };
    await db.$transaction((client: Prisma.TransactionClient) => app.get(GamesService).createFromSourceInTransaction(client, creation, context));
    const game = await db.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id }, include: { sides: true } });
    await db.v1Game.update({ where: { id: game.id }, data: { state: input.state } });
    if (input.policy !== undefined) await db.v1GameVisibilityPolicy.upsert({ where: { gameId: game.id }, create: { gameId: game.id, mode: input.policy }, update: { mode: input.policy } });
    games[key] = game.id;
    return { gameId: game.id, side: (k: V1GameSideKey) => game.sides.find((s) => s.sideKey === k)!.id };
  }
  let seq = 0;
  const goal = (gameId: string, sideId: string, extra: Partial<{ reverses: string }> = {}) =>
    db.v1GameEvent.create({
      data: {
        gameId, sequence: ++seq, clientEventId: `c-${tag}-${seq}`, payloadHash: `h-${seq}`, type: 'GOAL', sideId, period: 1, clockMs: seq * 1000,
        occurredAt: new Date(), actorUserId: userA, payload: {}, ...(extra.reverses ? { reversesEventId: extra.reverses } : {}),
      },
    });

  beforeAll(async () => {
    previousSecret = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'widget-test-secret-0123456789abcdefghij';
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.createMany({
      data: users.map((userId) => ({ id: userId, email: `${userId}@example.test`, accountStatus: 'active', onboardingStatus: 'completed', phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z') })),
    });
    await db.v1UserProfile.createMany({ data: users.map((userId) => ({ userId, nickname: `닉-${userId.slice(0, 6)}` })) });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(users.map((userId) => terms.acceptSignupTerms(userId, required)));
    sportId = (await db.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `widget-${tag}`, name: '지역', level: 2 } })).id;
    const config = await db.v1CompetitionConfigVersion.findFirst({ where: { name: 'futsal-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (config === null) throw new Error('futsal-v1 preset is required');
    configId = config.id;
    team1 = (await db.v1Team.create({ data: { ownerUserId: userA, sportId, regionId, name: `우리팀-${tag}` } })).id;
    team2 = (await db.v1Team.create({ data: { ownerUserId: userD, sportId, regionId, name: `상대팀-${tag}` } })).id;
    team3 = (await db.v1Team.create({ data: { ownerUserId: userD, sportId, regionId, name: `남의팀-${tag}` } })).id;
    await db.v1TeamMembership.createMany({
      data: [
        { teamId: team1, userId: userA, role: 'owner', status: 'active' },
        { teamId: team1, userId: userB, role: 'member', status: 'active' },
        { teamId: team2, userId: userD, role: 'owner', status: 'active' },
        { teamId: team3, userId: userD, role: 'owner', status: 'active' },
      ],
    });
    await db.v1GameOperationFlag.upsert({ where: { key: 'PUBLIC_LIVE' }, create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'widget-integration' }, update: { value: 'on' } });

    // 다가오는 경기(2일 뒤), 진행 중(우리가 원정), 진행 중이지만 점수 비공개, 끝난 경기, 남의 경기.
    await makeGame('upcoming', { host: team1, away: team2, startOffsetMs: 2 * DAY, state: 'SCHEDULED', policy: 'LIVE' });
    const live = await makeGame('live', { host: team2, away: team1, startOffsetMs: -30 * 60_000, state: 'LIVE', policy: 'LIVE' });
    const hiddenLive = await makeGame('hidden', { host: team1, away: team2, startOffsetMs: -20 * 60_000, state: 'LIVE', policy: 'HIDDEN' });
    await makeGame('ended', { host: team1, away: team2, startOffsetMs: -60 * 60_000, state: 'ENDED', policy: 'LIVE' });
    await makeGame('others', { host: team3, away: team2, startOffsetMs: 1 * DAY, state: 'SCHEDULED', policy: 'LIVE' });
    // 진행 중: 상대(홈) 1골, 우리(원정) 2골 + 취소된 우리 골 1개(세지 않는다).
    await goal(live.gameId, live.side('HOME'));
    await goal(live.gameId, live.side('AWAY'));
    const reversed = await goal(live.gameId, live.side('AWAY'));
    await goal(live.gameId, live.side('AWAY'));
    await db.v1GameEvent.create({
      data: { gameId: live.gameId, sequence: ++seq, clientEventId: `c-${tag}-${seq}`, payloadHash: `h-${seq}`, type: 'CORRECTION', sideId: live.side('AWAY'), period: 1, clockMs: 9000, occurredAt: new Date(), actorUserId: userA, reversesEventId: reversed.id, payload: {} },
    });
    await goal(hiddenLive.gameId, hiddenLive.side('HOME'));
  });

  afterAll(async () => {
    const gameIds = Object.values(games);
    await db.v1GameEvent.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1GameVisibilityPolicy.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1AccessToken.deleteMany({ where: { userId: { in: users } } });
    await db.$executeRawUnsafe('SET session_replication_role = replica');
    await db.v1Game.deleteMany({ where: { id: { in: gameIds } } });
    await db.v1TeamMatch.deleteMany({ where: { id: { in: createdTeamMatchIds } } });
    await db.$executeRawUnsafe('SET session_replication_role = DEFAULT');
    await db.v1Team.deleteMany({ where: { id: { in: [team1, team2, team3] } } });
    await db.v1UserProfile.deleteMany({ where: { userId: { in: users } } });
    await db.v1User.deleteMany({ where: { id: { in: users } } });
    await db.v1Region.delete({ where: { id: regionId } });
    if (previousSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = previousSecret;
    await cleanup?.();
  });

  it('토큰은 로그인한 사람만 받고, 로그인 없이 위젯 주소를 부르면 401', async () => {
    await request(app.getHttpServer()).post('/api/v1/me/widget-token').expect(401);
    await request(app.getHttpServer()).get('/api/v1/widget/games').expect(401);
    await request(app.getHttpServer()).get('/api/v1/widget/games').set('Authorization', 'Bearer nope').expect(401);
  });

  it('진행 중 경기가 앞에, 그다음 다가오는 경기. 끝난 경기·남의 경기는 안 나온다', async () => {
    const token = await tokenOf(userB);
    const items = (await bearer(token).get('/widget/games').expect(200)).body.data.items as Array<Record<string, unknown>>;
    expect(items.map((item) => item.state)).toEqual(['LIVE', 'LIVE', 'SCHEDULED']);
    expect(new Set(items.map((item) => item.gameId))).toEqual(new Set([games.live, games.hidden, games.upcoming]));
    expect(items.map((item) => item.gameId)).not.toContain(games.ended);
    expect(items.map((item) => item.gameId)).not.toContain(games.others);
    const upcoming = items.find((item) => item.gameId === games.upcoming)!;
    expect(upcoming).toMatchObject({ teamName: `우리팀-${tag}`, opponentName: `상대팀-${tag}`, placeName: '구장-upcoming', competitionKind: 'FRIENDLY', score: null });
  });

  it('점수는 우리 팀 기준이고 취소된 골은 빼며, 공개 정책이 가린 경기는 점수를 안 준다', async () => {
    const items = (await bearer(await tokenOf(userA)).get('/widget/games').expect(200)).body.data.items as Array<{ gameId: string; score: { mine: number; opponent: number } | null }>;
    expect(items.find((item) => item.gameId === games.live)!.score).toEqual({ mine: 2, opponent: 1 }); // 우리가 원정
    expect(items.find((item) => item.gameId === games.hidden)!.score).toBeNull(); // HIDDEN 정책
    expect(items.find((item) => item.gameId === games.upcoming)!.score).toBeNull();

    await db.v1GameOperationFlag.update({ where: { key: 'PUBLIC_LIVE' }, data: { value: 'off' } }); // 운영 킬스위치
    const off = (await bearer(await tokenOf(userA)).get('/widget/games').expect(200)).body.data.items as Array<{ gameId: string; score: unknown }>;
    expect(off.find((item) => item.gameId === games.live)!.score).toBeNull();
    await db.v1GameOperationFlag.update({ where: { key: 'PUBLIC_LIVE' }, data: { value: 'on' } });
  });

  it('limit 은 1~10, 팀이 없으면 빈 목록', async () => {
    const token = await tokenOf(userA);
    expect(((await bearer(token).get('/widget/games?limit=1').expect(200)).body.data.items as unknown[]).length).toBe(1);
    await bearer(token).get('/widget/games?limit=0').expect(400);
    await bearer(token).get('/widget/games?limit=11').expect(400);
    expect((await bearer(await tokenOf(userC)).get('/widget/games').expect(200)).body.data.items).toEqual([]);
  });

  it('오래 진행 중인 경기도 삭제된 경기는 숨기고, 내 위젯 토큰은 한 번에 전부 폐기할 수 있다', async () => {
    // 시작한 지 5시간(3시간 유예 밖)이라 "다가오는" 수집이 아니라 진행 중 경로로만 잡힌다.
    const long = await makeGame('long', { host: team1, away: team2, startOffsetMs: -5 * 60 * 60_000, state: 'LIVE', policy: 'LIVE' });
    const token = await tokenOf(userA);
    const ids = async () => ((await bearer(token).get('/widget/games?limit=10').expect(200)).body.data.items as Array<{ gameId: string }>).map((item) => item.gameId);
    expect(await ids()).toContain(long.gameId);

    await db.v1TeamMatch.update({ where: { id: createdTeamMatchIds[createdTeamMatchIds.length - 1] }, data: { deletedAt: new Date() } });
    expect(await ids()).not.toContain(long.gameId);
    await db.v1Game.update({ where: { id: long.gameId }, data: { state: 'ENDED' } }); // 뒤 케이스에 영향이 없게

    const second = await tokenOf(userA);
    const revoked = (await as(userA).del('/me/widget-token').expect(200)).body.data as { revoked: number };
    expect(revoked.revoked).toBeGreaterThanOrEqual(2);
    await bearer(token).get('/widget/games').expect(401);
    await bearer(second).get('/widget/games').expect(401);
  });

  it('토큰을 폐기하면 바로 401, 캘린더 토큰으로는 위젯을 못 연다, 기기당 활성 토큰은 10개까지', async () => {
    const token = await tokenOf(userB);
    await bearer(token).get('/widget/games').expect(200);
    await bearer(token).del('/widget/token').expect(200);
    await bearer(token).get('/widget/games').expect(401);

    const feed = (await as(userB).post('/me/calendar-feed').expect(201)).body.data.feedUrl as string;
    const calendarToken = new URL(feed).pathname.split('/').pop()!.replace(/\.ics$/, '');
    await bearer(calendarToken).get('/widget/games').expect(401);

    await db.v1AccessToken.deleteMany({ where: { userId: userC } });
    for (let i = 0; i < 12; i += 1) await tokenOf(userC);
    expect(await db.v1AccessToken.count({ where: { userId: userC, kind: 'widget', revokedAt: null } })).toBe(10);
  });
});
