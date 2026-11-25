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
const HOUR = 60 * 60 * 1_000;
const MIN = 60 * 1_000;

/** 위젯 홈: 진행 중 경기 / 응답 대기 / 일정을 한 번에, 위젯에서 응답 저장까지. */
describe('위젯 홈 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const userA = `wha-${tag}`; // 팀1 팀장
  const userB = `whb-${tag}`; // 팀1 팀원
  const userC = `whc-${tag}`; // 팀 없음
  const userD = `whd-${tag}`; // 팀2·3 팀장
  const users = [userA, userB, userC, userD];
  let team1: string;
  let team2: string;
  let team3: string;
  let sportId: string;
  let regionId: string;
  let configId: string;
  let previousSecret: string | undefined;
  const games: Record<string, string> = {};
  const sched: Record<string, string> = {};
  const createdTeamMatchIds: string[] = [];
  let seq = 0;

  const as = (userId: string) => ({ post: (url: string) => request(app.getHttpServer()).post(`/api/v1${url}`).set('x-v1-user-id', userId) });
  const bearer = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app.getHttpServer()).put(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
  });
  const tokenOf = async (userId: string) => (await as(userId).post('/me/widget-token').expect(201)).body.data.token as string;
  const homeOf = async (token: string) => (await bearer(token).get('/widget/home').expect(200)).body.data;

  async function makeGame(key: string, input: { startOffsetMs: number; state: 'LIVE' | 'ENDED'; policy: 'LIVE' | 'HIDDEN'; mineIsAway?: boolean; updatedAgoMs?: number }) {
    const [host, away] = input.mineIsAway ? [team2, team1] : [team1, team2];
    const teamMatch = await db.v1TeamMatch.create({
      data: {
        sportId, regionId, title: `경기-${key}-${tag}`, hostTeamId: host, approvedApplicantTeamId: away, createdByUserId: userA,
        placeName: `구장-${key}`, startAt: new Date(Date.now() + input.startOffsetMs), status: 'matched', competitionConfigVersionId: configId,
      },
    });
    createdTeamMatchIds.push(teamMatch.id);
    const creation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: host, displayNameSnapshot: `홈-${key}` },
        { sideKey: V1GameSideKey.AWAY, teamId: away, displayNameSnapshot: `원정-${key}` },
      ],
      participants: [],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: userA, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `wh-${tag}-${teamMatch.id}`,
      payloadHash: canonicalGameCommandPayloadHash(creation),
    };
    await db.$transaction((client: Prisma.TransactionClient) => app.get(GamesService).createFromSourceInTransaction(client, creation, context));
    const game = await db.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id }, include: { sides: true } });
    await db.v1Game.update({ where: { id: game.id }, data: { state: input.state, ...(input.updatedAgoMs === undefined ? {} : { updatedAt: new Date(Date.now() - input.updatedAgoMs) }) } });
    await db.v1GameVisibilityPolicy.upsert({ where: { gameId: game.id }, create: { gameId: game.id, mode: input.policy }, update: { mode: input.policy } });
    games[key] = game.id;
    return { gameId: game.id, side: (k: V1GameSideKey) => game.sides.find((s) => s.sideKey === k)!.id };
  }
  const goal = (gameId: string, sideId: string) =>
    db.v1GameEvent.create({
      data: { gameId, sequence: ++seq, clientEventId: `c-${tag}-${seq}`, payloadHash: `h-${seq}`, type: 'GOAL', sideId, period: 1, clockMs: seq * 1000, occurredAt: new Date(), actorUserId: userA, payload: {} },
    });
  const makeSchedule = async (key: string, teamId: string, offsetMs: number, extra: Partial<Prisma.V1TeamScheduleUncheckedCreateInput> = {}) => {
    const startAt = new Date(Date.now() + offsetMs);
    sched[key] = (await db.v1TeamSchedule.create({
      data: { teamId, title: `${key}-${tag}`, type: 'TRAINING', startAt, endAt: new Date(startAt.getTime() + 2 * HOUR), timezone: 'Asia/Seoul', state: 'SCHEDULED', ...extra },
    })).id;
  };

  beforeAll(async () => {
    previousSecret = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'widget-home-test-secret-0123456789abcdef';
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
    regionId = (await db.v1Region.create({ data: { code: `wh-${tag}`, name: '지역', level: 2 } })).id;
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
    await db.v1GameOperationFlag.upsert({ where: { key: 'PUBLIC_LIVE' }, create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'widget-home-integration' }, update: { value: 'on' } });

    // 일정: 마감 있는 모임 / 마감 없는 훈련 / 마감 지난 훈련 / 경기 일정 / 이미 응답한 훈련 / 완료·취소 / 남의 팀.
    await makeSchedule('deadline', team1, 3 * DAY, { type: 'EVENT', rsvpDeadlineAt: new Date(Date.now() + 1 * DAY) });
    await makeSchedule('open', team1, 2 * DAY);
    await makeSchedule('closed', team1, 4 * DAY, { rsvpDeadlineAt: new Date(Date.now() - 1 * HOUR) });
    await makeSchedule('matchType', team1, 1 * DAY, { type: 'MATCH' });
    await makeSchedule('answered', team1, 1.5 * DAY);
    await makeSchedule('done', team1, -1 * DAY, { state: 'COMPLETED' });
    await makeSchedule('cancelled', team1, 5 * DAY, { state: 'CANCELLED' });
    await makeSchedule('other', team3, 1 * DAY);
    await db.v1ScheduleAttendance.create({ data: { scheduleId: sched.answered, userId: userB, status: 'GOING' } });

    // 경기: 진행 중(우리가 원정, 우리 2골 상대 1골) / 점수 비공개 / 13시간 전 시작(너무 오래) / 방금 끝남 / 20분 전에 끝남.
    const live = await makeGame('live', { startOffsetMs: -30 * MIN, state: 'LIVE', policy: 'LIVE', mineIsAway: true });
    await goal(live.gameId, live.side('HOME'));
    await goal(live.gameId, live.side('AWAY'));
    await goal(live.gameId, live.side('AWAY'));
    const hidden = await makeGame('hidden', { startOffsetMs: -20 * MIN, state: 'LIVE', policy: 'HIDDEN' });
    await goal(hidden.gameId, hidden.side('HOME'));
    await makeGame('tooOld', { startOffsetMs: -13 * HOUR, state: 'LIVE', policy: 'LIVE' });
    await makeGame('justEnded', { startOffsetMs: -90 * MIN, state: 'ENDED', policy: 'LIVE' });
    await makeGame('endedLong', { startOffsetMs: -3 * HOUR, state: 'ENDED', policy: 'LIVE', updatedAgoMs: 20 * MIN });
  });

  afterAll(async () => {
    const gameIds = Object.values(games);
    await db.v1GameEvent.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1GameVisibilityPolicy.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1AccessToken.deleteMany({ where: { userId: { in: users } } });
    await db.v1ScheduleAttendance.deleteMany({ where: { scheduleId: { in: Object.values(sched) } } });
    await db.v1TeamSchedule.deleteMany({ where: { id: { in: Object.values(sched) } } });
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

  it('토큰 없이는 401, 팀이 없으면 빈 홈', async () => {
    await request(app.getHttpServer()).get('/api/v1/widget/home').expect(401);
    await request(app.getHttpServer()).put(`/api/v1/widget/schedules/${sched.open}/attendance`).send({ status: 'GOING' }).expect(401);
    expect(await homeOf(await tokenOf(userC))).toMatchObject({ live: [], pendingCount: 0, pending: [], schedules: [] });
  });

  it('진행 중 경기: 우리 팀 기준 점수, 가린 경기는 점수 null, 13시간 넘은 진행 중·20분 지난 끝난 경기는 빠지고 방금 끝난 경기는 남는다', async () => {
    const live = (await homeOf(await tokenOf(userB))).live as Array<{ gameId: string; state: string; score: { mine: number; opponent: number } | null; penalties: unknown }>;
    expect(new Set(live.map((g) => g.gameId))).toEqual(new Set([games.live, games.hidden, games.justEnded]));
    expect(live.find((g) => g.gameId === games.live)!.score).toEqual({ mine: 2, opponent: 1 }); // 우리가 원정
    expect(live.find((g) => g.gameId === games.hidden)!.score).toBeNull();
    const ended = live.find((g) => g.gameId === games.justEnded)!;
    expect(ended.state).toBe('ENDED');
    expect(ended.penalties).toBeNull();
    expect(live.map((g) => g.state)).toEqual(['LIVE', 'LIVE', 'ENDED']); // 진행 중이 앞
  });

  it('응답 대기: 훈련·모임 중 내가 응답 안 했고 마감 전인 것만, 마감이 가까운 순(마감 없는 것은 뒤)', async () => {
    const home = await homeOf(await tokenOf(userB));
    const ids = (home.pending as Array<{ scheduleId: string }>).map((i) => i.scheduleId);
    expect(ids).toEqual([sched.deadline, sched.open]);
    expect(home.pendingCount).toBe(2);
    expect(ids).not.toContain(sched.closed); // 마감 지남
    expect(ids).not.toContain(sched.answered); // 이미 응답
    expect(ids).not.toContain(sched.matchType); // 경기 일정은 응답 대상이 아님
    expect(ids).not.toContain(sched.other); // 남의 팀
  });

  it('일정: 가까운 순, 내 응답과 응답 가능 여부를 함께, 완료·취소·남의 팀은 없다', async () => {
    const items = (await homeOf(await tokenOf(userB))).schedules as Array<{ scheduleId: string; myResponse: string | null; canRespond: boolean; teamName: string }>;
    expect(items.map((i) => i.scheduleId)).toEqual([sched.matchType, sched.answered, sched.open, sched.deadline]);
    expect(items.find((i) => i.scheduleId === sched.answered)).toMatchObject({ myResponse: 'GOING', canRespond: true });
    expect(items.find((i) => i.scheduleId === sched.matchType)).toMatchObject({ myResponse: null, canRespond: false });
    expect(items.find((i) => i.scheduleId === sched.open)).toMatchObject({ myResponse: null, canRespond: true, teamName: `우리팀-${tag}` });
    const all = items.map((i) => i.scheduleId);
    for (const key of ['done', 'cancelled', 'other']) expect(all).not.toContain(sched[key]);
  });

  it('위젯에서 응답 저장: 참석 → 응답 대기에서 빠지고 일정에 반영, 불참으로 바꿀 수 있다', async () => {
    const token = await tokenOf(userB);
    const first = await bearer(token).put(`/widget/schedules/${sched.open}/attendance`).send({ status: 'GOING' }).expect(200);
    expect(first.body.data.status).toBe('GOING');
    const after = await homeOf(token);
    expect((after.pending as Array<{ scheduleId: string }>).map((i) => i.scheduleId)).toEqual([sched.deadline]);
    expect((after.schedules as Array<{ scheduleId: string; myResponse: string | null }>).find((i) => i.scheduleId === sched.open)!.myResponse).toBe('GOING');

    const again = await bearer(token).put(`/widget/schedules/${sched.open}/attendance`).send({ status: 'NOT_GOING' }).expect(200);
    expect(again.body.data.status).toBe('NOT_GOING');
    expect(await db.v1ScheduleAttendance.findUniqueOrThrow({ where: { scheduleId_userId: { scheduleId: sched.open, userId: userB } } })).toMatchObject({ status: 'NOT_GOING' });
  });

  it('응답 저장 거절: 마감 지난 일정·남의 팀 일정·없는 일정은 안 되고, 허용 값 밖은 400', async () => {
    const token = await tokenOf(userB);
    const closed = await bearer(token).put(`/widget/schedules/${sched.closed}/attendance`).send({ status: 'GOING' });
    expect(closed.status).toBeGreaterThanOrEqual(400);
    expect(closed.status).toBeLessThan(500);
    await bearer(token).put(`/widget/schedules/${sched.other}/attendance`).send({ status: 'GOING' }).expect(404);
    await bearer(token).put(`/widget/schedules/${randomUUID()}/attendance`).send({ status: 'GOING' }).expect(404);
    await bearer(token).put(`/widget/schedules/${sched.open}/attendance`).send({ status: 'WAITLISTED' }).expect(400);
    await bearer(await tokenOf(userD)).put(`/widget/schedules/${sched.open}/attendance`).send({ status: 'GOING' }).expect(404); // 다른 팀 팀장
  });
});
