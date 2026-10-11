import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// updateFixture 의 "끝남 검사 + 쓰기" 원자성. 잠금 순서는 결과 확정 경로와 같다(게임 행 → 리그 행).
// 두 커넥션을 실제로 겹쳐 (1) 검사 시점 이후에 완료가 끼어들지 못하고 (2) 역순 교착(40P01)이 없음을 본다.
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

  /** 제3 커넥션(풀의 다른 연결)에서 `table` 의 FOR UPDATE 를 기다리는 세션이 생길 때까지 폴링한다. */
  async function waitUntilBlockedOn(table: string) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRawUnsafe<Array<{ pid: number }>>(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query ILIKE '%FOR UPDATE%' AND query ILIKE $1`,
        `%${table}%`,
      );
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`updateFixture 가 ${table} 잠금에서 막히지 않았어요(10초).`);
  }

  async function failureOf(promise: Promise<unknown>): Promise<{ code?: string; name: string; message: string }> {
    try {
      await promise;
    } catch (err) {
      const e = err as { name: string; message: string; getResponse?: () => { code?: string } };
      return { code: e.getResponse?.().code, name: e.name, message: e.message };
    }
    throw new Error('updateFixture 가 성공했어요 — 409 LEAGUE_ENDED 를 기대했어요.');
  }

  /**
   * 완료 쪽 트랜잭션 A. `lockOrder` 에 따라 게임 행부터 / 리그 행부터 잡고, 잡은 뒤 `held` 로 알리고
   * `gate` 가 열릴 때까지 쥔 채 기다린다. 열리면 리그를 completed 로 바꾸고 커밋한다.
   */
  function startCompleter(ctx: { leagueId: string; teamMatchId: string }, lockOrder: 'game-first' | 'league-first') {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let markHeld!: () => void;
    const held = new Promise<void>((resolve) => { markHeld = resolve; });
    const lockGame = (tx: Pick<PrismaService, '$queryRaw'>) => tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${ctx.teamMatchId} FOR UPDATE`;
    const lockLeague = (tx: Pick<PrismaService, '$queryRaw'>) => tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${ctx.leagueId} FOR UPDATE`;
    const done = prisma.$transaction(async (tx) => {
      if (lockOrder === 'game-first') {
        await lockGame(tx);
        markHeld();
        await gate;
        await lockLeague(tx);
      } else {
        await lockLeague(tx);
      }
      await tx.v1Tournament.update({ where: { id: ctx.leagueId }, data: { status: 'completed' } });
      if (lockOrder === 'league-first') {
        markHeld();
        await gate;
      }
    }, { timeout: 20_000, maxWait: 10_000 });
    // held 전에 A 가 실패하면 테스트가 영원히 기다리지 않게 한다.
    const heldOrFailed = Promise.race([held, done.then(() => undefined)]);
    return { release, done, held: heldOrFailed };
  }

  it('결과 확정 쪽이 게임 행을 먼저 쥔 경우 — updateFixture 는 게임 행에서 막혔다가 409 LEAGUE_ENDED 로 실패하고 시각은 그대로다', async () => {
    const ctx = await newLeagueWithFixture();
    const completer = startCompleter(ctx, 'game-first');
    try {
      await completer.held;
      const attempt = failureOf(service.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, { startsAt: NEW_START }));
      await waitUntilBlockedOn('v1_games');
      completer.release();
      await completer.done;
      const failure = await attempt;
      expect(failure).toMatchObject({ code: 'LEAGUE_ENDED' });
      expect(failure.message).not.toMatch(/deadlock|40P01|Transaction/i);
    } finally {
      completer.release();
      await completer.done.catch(() => undefined);
    }
    expect(await startAtOf(ctx.teamMatchId)).toEqual(ctx.startAtBefore);
  }, 40_000);

  it('완료 쪽이 리그 행을 먼저 쥔 경우 — updateFixture 는 리그 행에서 막혔다가 409 LEAGUE_ENDED 로 실패하고 시각은 그대로다', async () => {
    const ctx = await newLeagueWithFixture();
    const completer = startCompleter(ctx, 'league-first');
    try {
      await completer.held;
      const attempt = failureOf(service.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, { startsAt: NEW_START }));
      await waitUntilBlockedOn('v1_tournaments');
      completer.release();
      await completer.done;
      const failure = await attempt;
      expect(failure).toMatchObject({ code: 'LEAGUE_ENDED' });
      expect(failure.message).not.toMatch(/deadlock|40P01|Transaction/i);
    } finally {
      completer.release();
      await completer.done.catch(() => undefined);
    }
    expect(await startAtOf(ctx.teamMatchId)).toEqual(ctx.startAtBefore);
  }, 40_000);

  it('대조군 — 겹침 없는 진행 중 리그와 보류 리그는 수정에 성공한다', async () => {
    const running = await newLeagueWithFixture();
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: running.leagueId } })).status).toBe('in_progress');
    await service.updateFixture(actor, running.leagueId, running.teamMatchId, { startsAt: NEW_START });
    expect((await startAtOf(running.teamMatchId))?.toISOString()).toBe(NEW_START);

    const held = await newLeagueWithFixture();
    await prisma.v1Tournament.update({ where: { id: held.leagueId }, data: { status: 'on_hold' } });
    await service.updateFixture(actor, held.leagueId, held.teamMatchId, { startsAt: NEW_START });
    expect((await startAtOf(held.teamMatchId))?.toISOString()).toBe(NEW_START);
  }, 40_000);
});
