import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// updateFixture 는 게임 행을 잠그지 않고 리그 행을 FOR SHARE NOWAIT 로만 확인한다(기다리면 리그→경기 /
// 경기→리그 두 잠금 순서 중 어느 쪽과든 교착). 두 커넥션을 실제로 겹쳐 대기 없음·409·교착 없음을 본다.
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `ufer-owner-${suiteId}`;
const NEW_START = '2031-03-01T10:00:00.000Z';

describe('리그 경기 수정 vs 리그 완료 경합 (updateFixture 원자성)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let service: LeagueMatchAdminService;
  let sportId: string;
  let regionId: string;
  let seq = 0;
  const actor: V1AuthUser = { id: ownerUserId, email: `${ownerUserId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' };

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    service = app.get(LeagueMatchAdminService);
    await prisma.v1User.create({
      data: { id: ownerUserId, email: actor.email!, onboardingStatus: 'completed', phoneVerifiedAt: new Date(), accountStatus: 'active' },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(ownerUserId, required);
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `ufer-region-${suiteId}`, name: '경합 테스트 지역', level: 2 } })).id;
  });

  afterAll(async () => cleanup?.());

  /** 케이스마다 새 리그·팀·대진 1건. 간섭이 없도록 공유하지 않는다. */
  async function newLeagueWithFixture() {
    const n = ++seq;
    const teams = await Promise.all(['a', 'b'].map((s) =>
      prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `ufer-${s}${n}-${suiteId}` } })));
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: `경합 리그 ${n} ${suiteId}`, sportId, regionId,
        startsOn: new Date().toISOString(), endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: teams.map((t) => t.id),
      })
      .expect(201);
    const leagueId: string = created.body.data.leagueId;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/state`)
      .set('x-v1-user-id', ownerUserId)
      .send({ state: 'active' })
      .expect(200);
    const fixtures = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 })
      .expect(201);
    const teamMatchId: string = fixtures.body.data.teamMatchIds[0];
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, select: { id: true } });
    const before = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId }, select: { startAt: true } });
    return { leagueId, teamMatchId, gameId: game.id, startAtBefore: before.startAt };
  }

  const startAtOf = async (id: string) => (await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id }, select: { startAt: true } })).startAt;

  async function failureOf(promise: Promise<unknown>): Promise<{ code?: string; name: string; message: string }> {
    try {
      await promise;
    } catch (err) {
      const e = err as { name: string; message: string; getResponse?: () => { code?: string } };
      return { code: e.getResponse?.().code, name: e.name, message: e.message };
    }
    throw new Error('updateFixture 가 성공했어요 — 409 를 기대했어요.');
  }

  const NO_DEADLOCK = /deadlock|40P01|Transaction/i;
  const lockGame = (tx: Prisma.TransactionClient, teamMatchId: string) =>
    tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${teamMatchId} FOR UPDATE`;
  const lockLeague = (tx: Prisma.TransactionClient, leagueId: string) =>
    tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${leagueId} FOR UPDATE`;

  /** `before` 를 마친 트랜잭션을 `release()` 전까지 열어 두고, 풀리면 `after` 를 실행해 커밋한다. */
  function startHolder(before: (tx: Prisma.TransactionClient) => Promise<unknown>, after: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let markHeld!: () => void;
    const held = new Promise<void>((resolve) => { markHeld = resolve; });
    const done = prisma.$transaction(async (tx) => {
      await before(tx);
      markHeld();
      await gate;
      await after(tx);
    }, { timeout: 20_000, maxWait: 10_000 });
    return { release, done, held: Promise.race([held, done.then(() => undefined)]) };
  }

  const complete = (tx: Prisma.TransactionClient, leagueId: string) =>
    tx.v1Tournament.update({ where: { id: leagueId }, data: { status: 'completed' } });
  const statusOf = async (id: string) => (await prisma.v1Tournament.findUniqueOrThrow({ where: { id } })).status;

  it('A) 결과 확정 쪽이 게임 행을 쥐고 있어도 updateFixture 는 막히지 않고 성공하며, 이어서 완료도 교착 없이 끝난다', async () => {
    const ctx = await newLeagueWithFixture();
    const holder = startHolder(
      (tx) => lockGame(tx, ctx.teamMatchId),
      async (tx) => { await lockLeague(tx, ctx.leagueId); await complete(tx, ctx.leagueId); },
    );
    try {
      await holder.held;
      await service.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, { startsAt: NEW_START });
      expect((await startAtOf(ctx.teamMatchId))?.toISOString()).toBe(NEW_START);
      holder.release();
      await holder.done;
    } finally {
      holder.release();
      await holder.done.catch(() => undefined);
    }
    expect(await statusOf(ctx.leagueId)).toBe('completed');
  }, 40_000);

  it('B) 완료 쪽이 리그 행을 먼저 쥐면(미커밋 completed) updateFixture 는 기다리지 않고 409 COMMAND_CONCURRENCY_CONFLICT 다', async () => {
    const ctx = await newLeagueWithFixture();
    const holder = startHolder(
      async (tx) => { await lockLeague(tx, ctx.leagueId); await complete(tx, ctx.leagueId); },
      async () => undefined,
    );
    try {
      await holder.held;
      const started = Date.now();
      const failure = await failureOf(service.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, { startsAt: NEW_START }));
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(failure).toMatchObject({ code: 'COMMAND_CONCURRENCY_CONFLICT' });
      expect(failure.message).not.toMatch(NO_DEADLOCK);
      expect(await startAtOf(ctx.teamMatchId)).toEqual(ctx.startAtBefore);
      holder.release();
      await holder.done;
    } finally {
      holder.release();
      await holder.done.catch(() => undefined);
    }
    expect(await statusOf(ctx.leagueId)).toBe('completed');
  }, 40_000);

  it('C) 리그 행 → 게임 행 순서로 잡는 일괄 경로가 리그 행을 쥔 동안 updateFixture 는 즉시 409 이고, 일괄 경로는 막힘 없이 커밋된다', async () => {
    const ctx = await newLeagueWithFixture();
    const holder = startHolder(
      (tx) => lockLeague(tx, ctx.leagueId),
      (tx) => lockGame(tx, ctx.teamMatchId),
    );
    try {
      await holder.held;
      const started = Date.now();
      const failure = await failureOf(service.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, { startsAt: NEW_START }));
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(failure).toMatchObject({ code: 'COMMAND_CONCURRENCY_CONFLICT' });
      expect(failure.message).not.toMatch(NO_DEADLOCK);
      expect(await startAtOf(ctx.teamMatchId)).toEqual(ctx.startAtBefore);
      holder.release();
      await holder.done;
    } finally {
      holder.release();
      await holder.done.catch(() => undefined);
    }
  }, 40_000);

  it('D) 이미 완료가 커밋된 리그는 409 LEAGUE_ENDED 이고 시각은 그대로다', async () => {
    const ctx = await newLeagueWithFixture();
    await prisma.v1Tournament.update({ where: { id: ctx.leagueId }, data: { status: 'completed' } });
    const failure = await failureOf(service.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, { startsAt: NEW_START }));
    expect(failure).toMatchObject({ code: 'LEAGUE_ENDED' });
    expect(await startAtOf(ctx.teamMatchId)).toEqual(ctx.startAtBefore);
  }, 40_000);

  it('E) 대조군 — 겹침 없는 진행 중 리그와 보류 리그는 수정에 성공한다', async () => {
    const running = await newLeagueWithFixture();
    expect(await statusOf(running.leagueId)).toBe('in_progress');
    await service.updateFixture(actor, running.leagueId, running.teamMatchId, { startsAt: NEW_START });
    expect((await startAtOf(running.teamMatchId))?.toISOString()).toBe(NEW_START);

    const held = await newLeagueWithFixture();
    await prisma.v1Tournament.update({ where: { id: held.leagueId }, data: { status: 'on_hold' } });
    await service.updateFixture(actor, held.leagueId, held.teamMatchId, { startsAt: NEW_START });
    expect((await startAtOf(held.teamMatchId))?.toISOString()).toBe(NEW_START);
  }, 40_000);
});
