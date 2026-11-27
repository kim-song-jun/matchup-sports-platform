import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { ScheduleAttendanceService } from '../../src/team-schedules/attendance.service';
import { resolveTeamLogoUrl } from '../../src/teams/team-logo-presets';
import { WidgetHomeService } from '../../src/widget/widget-home.service';
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
  let periodStart: Date;
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

  async function makeGame(key: string, input: { startOffsetMs: number; state: 'SCHEDULED' | 'LIVE' | 'ENDED'; policy: 'LIVE' | 'HIDDEN'; mineIsAway?: boolean; endedAgoMs?: number; bumpedNow?: boolean }) {
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
    await db.v1Game.update({ where: { id: game.id }, data: { state: input.state } });
    if (input.state === 'ENDED') {
      // 끝난 경기: 공식 결과(홈 2 : 1 원정)가 `endedAgoMs` 전에 확정됐다. 확정 시각은 리비전의 createdAt 이다.
      const officialAt = new Date(Date.now() - (input.endedAgoMs ?? 0));
      const score = { home: 2, away: 1 };
      const revision = await db.v1GameResultRevision.create({
        data: { gameId: game.id, revision: 1, state: 'OFFICIAL', score, eventsHash: `wh-${tag}-${key}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'WIDGET_HOME_TEST', submittedAt: officialAt, officialAt, createdAt: officialAt },
      });
      await db.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
      await db.v1GameOfficialFact.create({
        data: { revisionId: revision.id, gameId: game.id, revision: 1, sourceType: 'TEAM_MATCH', homeTeamId: host, awayTeamId: away, homeScore: 2, awayScore: 1, score, eventsHash: `wh-${tag}-${key}`, officialAt },
      });
      // 끝난 뒤의 갱신(정정·대진 갱신)은 `updatedAt` 만 바꾼다 — 「방금 끝남」 판단이 여기에 흔들리지 않아야 한다.
      if (input.bumpedNow) await db.v1Game.update({ where: { id: game.id }, data: { version: { increment: 1 } } });
    }
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
    await db.v1Team.update({ where: { id: team1 }, data: { memberCount: 2 } });
    await db.v1TeamProfile.create({ data: { teamId: team2, logoUrl: '/uploads/widget-opponent.png' } });
    await db.v1GameOperationFlag.upsert({ where: { key: 'PUBLIC_LIVE' }, create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'widget-home-integration' }, update: { value: 'on' } });

    // 일정: 마감 있는 모임 / 마감 없는 훈련 / 마감 지난 훈련 / 경기 일정 / 이미 응답한 훈련 / 완료·취소 / 남의 팀.
    await makeSchedule('deadline', team1, 3 * DAY, { type: 'EVENT', rsvpDeadlineAt: new Date(Date.now() + 1 * DAY) });
    await makeSchedule('open', team1, 2 * DAY, { capacity: 12 });
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
    // 친선 팀 매치: 득점이 경기 이벤트가 아니라 공유 기록에 있다(우리가 홈, 2 : 1).
    const friendly = await makeGame('friendly', { startOffsetMs: -10 * MIN, state: 'LIVE', policy: 'LIVE' });
    await db.v1TeamMatchRecord.create({
      data: {
        gameId: friendly.gameId,
        goals: [
          { id: randomUUID(), sideId: friendly.side('HOME'), ownGoal: false, participantId: null, minute: 3, subMatchId: null },
          { id: randomUUID(), sideId: friendly.side('HOME'), ownGoal: false, participantId: null, minute: 9, subMatchId: null },
          { id: randomUUID(), sideId: friendly.side('AWAY'), ownGoal: false, participantId: null, minute: 14, subMatchId: null },
        ],
      },
    });
    // 친선 팀 매치는 첫 득점을 기록하기 전까지 경기 상태가 SCHEDULED 다 — 킥오프가 지났으면(3시간 안) 진행 중 0 : 0 으로, 오래됐거나 아직 시작 전이면 안 나온다.
    await makeGame('friendlyKickedOff', { startOffsetMs: -10 * MIN, state: 'SCHEDULED', policy: 'LIVE' });
    await makeGame('friendlyStale', { startOffsetMs: -4 * HOUR, state: 'SCHEDULED', policy: 'LIVE' });
    await makeGame('friendlyFuture', { startOffsetMs: 1 * HOUR, state: 'SCHEDULED', policy: 'LIVE' });
    const hidden = await makeGame('hidden', { startOffsetMs: -20 * MIN, state: 'LIVE', policy: 'HIDDEN' });
    await goal(hidden.gameId, hidden.side('HOME'));
    await makeGame('tooOld', { startOffsetMs: -13 * HOUR, state: 'LIVE', policy: 'LIVE' });
    await makeGame('justEnded', { startOffsetMs: -90 * MIN, state: 'ENDED', policy: 'LIVE' });
    await makeGame('endedLong', { startOffsetMs: -3 * HOUR, state: 'ENDED', policy: 'LIVE', endedAgoMs: 20 * MIN });
    await makeGame('endedBumped', { startOffsetMs: -2 * DAY, state: 'ENDED', policy: 'LIVE', endedAgoMs: 2 * DAY, bumpedNow: true });
    await makeGame('endedAway', { startOffsetMs: -100 * MIN, state: 'ENDED', policy: 'LIVE', mineIsAway: true, endedAgoMs: 5 * MIN });
    await makeGame('endedHidden', { startOffsetMs: -80 * MIN, state: 'ENDED', policy: 'HIDDEN', endedAgoMs: 4 * MIN });

    // 구간: live 는 후반(2구간) 진행 중 — 1구간은 끝났고 멈춘 시간 60초. hidden 은 하프타임(다음 구간 HALFTIME).
    const period = (gameId: string, number: number, state: 'ENDED' | 'LIVE' | 'HALFTIME', extra: object = {}) =>
      db.v1GamePeriod.upsert({ where: { gameId_number: { gameId, number } }, create: { gameId, number, state, ...extra }, update: { state, ...extra } });
    periodStart = new Date(Date.now() - 12 * MIN);
    await period(games.live, 1, 'ENDED', { startedAt: new Date(Date.now() - 40 * MIN), endedAt: new Date(Date.now() - 27 * MIN) });
    await period(games.live, 2, 'LIVE', { startedAt: periodStart, pausedTotalMs: 60_000 });
    await period(games.hidden, 1, 'ENDED', { startedAt: new Date(Date.now() - 40 * MIN), endedAt: new Date(Date.now() - 8 * MIN) });
    await period(games.hidden, 2, 'HALFTIME');

    // 경기 일정: matchType 일정을 친선 경기(우리 ↔ 상대팀, 장소 `구장-friendly`)에 연결한다.
    const friendlyMatch = await db.v1TeamMatch.findFirstOrThrow({ where: { title: `경기-friendly-${tag}` } });
    await db.v1TeamSchedule.update({ where: { id: sched.matchType }, data: { teamMatchId: friendlyMatch.id } });
  });

  afterAll(async () => {
    const gameIds = Object.values(games);
    await db.v1TeamMatchRecord.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1GameEvent.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1GameVisibilityPolicy.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1AccessToken.deleteMany({ where: { userId: { in: users } } });
    await db.v1ScheduleAttendance.deleteMany({ where: { scheduleId: { in: Object.values(sched) } } });
    await db.v1TeamSchedule.deleteMany({ where: { id: { in: Object.values(sched) } } });
    await db.$executeRawUnsafe('SET session_replication_role = replica');
    await db.v1GameOfficialFact.deleteMany({ where: { gameId: { in: gameIds } } });
    await db.v1GameResultRevision.deleteMany({ where: { gameId: { in: gameIds } } });
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

  it('진행 중 경기: 우리 팀 기준 점수, 가린 경기는 점수 null, 13시간 넘은 진행 중·20분 전에 확정된 경기는 빠지고 방금 끝난 경기는 남는다(끝난 뒤 갱신돼도 옛 경기는 안 돌아온다)', async () => {
    const live = (await homeOf(await tokenOf(userB))).live as Array<{ gameId: string; state: string; score: { mine: number; opponent: number } | null; penalties: unknown }>;
    expect(new Set(live.map((g) => g.gameId))).toEqual(new Set([games.live, games.friendly, games.friendlyKickedOff, games.hidden, games.justEnded, games.endedAway, games.endedHidden]));
    expect(live.find((g) => g.gameId === games.live)!.score).toEqual({ mine: 2, opponent: 1 }); // 우리가 원정
    expect(live.find((g) => g.gameId === games.friendly)!.score).toEqual({ mine: 2, opponent: 1 }); // 친선: 공유 기록의 골
    expect(live.find((g) => g.gameId === games.friendlyKickedOff)).toMatchObject({ state: 'LIVE', score: { mine: 0, opponent: 0 } }); // 득점 전 친선
    expect(live.map((g) => g.gameId)).not.toContain(games.friendlyStale);
    expect(live.map((g) => g.gameId)).not.toContain(games.friendlyFuture);
    expect(live.find((g) => g.gameId === games.hidden)!.score).toBeNull();
    const ended = live.find((g) => g.gameId === games.justEnded)!;
    expect(ended.state).toBe('ENDED');
    expect(ended.penalties).toBeNull();
    expect((ended as { score: unknown }).score).toEqual({ mine: 2, opponent: 1 }); // 우리가 홈
    expect(live.find((g) => g.gameId === games.endedAway)!.score).toEqual({ mine: 1, opponent: 2 }); // 우리가 원정
    expect(live.find((g) => g.gameId === games.endedHidden)!.score).toBeNull(); // 가린 경기는 끝나도 점수를 안 준다
    expect(live.map((g) => g.state)).toEqual(['LIVE', 'LIVE', 'LIVE', 'LIVE', 'ENDED', 'ENDED', 'ENDED']); // 진행 중이 앞
  });

  it('진행 중 경기 부가 정보: 팀 마크(저장된 것·기본 마크), 장소, 현재 구간, 하프타임', async () => {
    const live = (await homeOf(await tokenOf(userB))).live as Array<Record<string, unknown> & { gameId: string }>;
    const running = live.find((g) => g.gameId === games.live)!;
    expect(running).toMatchObject({ venueName: '구장-live', competitionName: null, teamLogoUrl: resolveTeamLogoUrl(team1, null), opponentLogoUrl: '/uploads/widget-opponent.png' });
    expect(running.teamLogoUrl).toMatch(/^\/images\/team-logos\/team-logo-\d{2}\.jpg$/); // 로고가 비면 팀 페이지와 같은 기본 마크
    expect(running.period).toMatchObject({ number: 2, phase: 'RUNNING', pausedMs: 60_000, pausedAt: null });
    expect(new Date((running.period as { startedAt: string }).startedAt).getTime()).toBe(periodStart.getTime());
    expect(live.find((g) => g.gameId === games.hidden)!.period).toMatchObject({ number: 2, phase: 'HALFTIME', startedAt: null });
    expect(live.find((g) => g.gameId === games.friendly)!.period).toBeNull(); // 친선 팀 매치는 구간 기록이 없다
    expect(live.find((g) => g.gameId === games.justEnded)!.period).toBeNull(); // 끝난 경기
  });

  it('지난 경기: 가장 최근 공식 결과(가린 경기는 건너뛴다)와 승무패', async () => {
    const home = await homeOf(await tokenOf(userB));
    expect(home.lastResult).toMatchObject({ gameId: games.justEnded, score: { mine: 2, opponent: 1 }, penalties: null, result: 'WIN', competitionName: null, teamName: `우리팀-${tag}` });
    expect((await homeOf(await tokenOf(userC))).lastResult).toBeNull();
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
    // 경기 일정: 상대팀(저장된 마크)·장소. 훈련은 상대가 없다. 참석 인원·정원(없으면 팀원 수).
    expect(items.find((i) => i.scheduleId === sched.matchType)).toMatchObject({ opponentName: `상대팀-${tag}`, opponentLogoUrl: '/uploads/widget-opponent.png', placeName: '구장-friendly', competitionName: null });
    expect(items.find((i) => i.scheduleId === sched.open)).toMatchObject({ opponentName: null, opponentLogoUrl: null, placeName: null, goingCount: 0, capacity: 12 });
    expect(items.find((i) => i.scheduleId === sched.answered)).toMatchObject({ goingCount: 1, capacity: 2 });
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
    await bearer(token).put(`/widget/schedules/${sched.matchType}/attendance`).send({ status: 'GOING' }).expect(400); // 경기 일정은 앱에서
    await bearer(await tokenOf(userD)).put(`/widget/schedules/${sched.open}/attendance`).send({ status: 'GOING' }).expect(404); // 다른 팀 팀장
  });

  it('위젯과 앱이 거의 동시에 눌러 버전이 바뀌어도 한 번 다시 읽어 저장한다', async () => {
    await db.v1ScheduleAttendance.create({ data: { scheduleId: sched.deadline, userId: userB, status: 'MAYBE' } });
    const attendance = app.get(ScheduleAttendanceService);
    const real = attendance.setMyAttendance.bind(attendance);
    let calls = 0;
    const spy = jest.spyOn(attendance, 'setMyAttendance').mockImplementation(async (...args) => {
      calls += 1;
      // 첫 시도 직전에 앱이 먼저 저장해 버전이 올라간 상황(위젯이 읽은 버전이 낡았다).
      if (calls === 1) await db.v1ScheduleAttendance.update({ where: { scheduleId_userId: { scheduleId: sched.deadline, userId: userB } }, data: { version: { increment: 1 } } });
      return real(...args);
    });
    try {
      const done = await app.get(WidgetHomeService).setResponse(userB, sched.deadline, 'GOING');
      expect(done.status).toBe('GOING');
      expect(calls).toBe(2); // 첫 시도는 VERSION_CONFLICT, 재시도가 저장
    } finally {
      spy.mockRestore();
    }
  });
});
