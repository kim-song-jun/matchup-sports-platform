import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// settle 은 완료 판정이 참일 때 리그 행을 FOR UPDATE NOWAIT 로 잡는다. 결과 투영은 게임 행을 쥔 채
// settle 에 오고, 템플릿 교체는 리그 행 → 게임 행 순이라 예전에는 두 쪽이 교착(40P01)할 수 있었다.
// 이 스펙은 실제 두 커넥션으로 "투영이 즉시 409 로 물러나 게임 행을 놓는다"를 지킨다.
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t4-league-nowait-owner-${suiteId}`;

describe('리그 완료 잠금은 기다리지 않는다 (NOWAIT)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  const projection = new GameResultOfficialProjectionService();

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: {
        id: ownerUserId,
        email: `${ownerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      ownerUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t4-league-nowait-region-${suiteId}`, name: 'T4 리그 NOWAIT 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  async function createLeagueWithFixtures(label: string) {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `nowait-${label}-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `nowait-${label}-b-${suiteId}` } });
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: `NOWAIT ${label}`,
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId: string = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 2 });
    const teamMatchIds: string[] = fixturesRes.body.data.teamMatchIds;
    expect(teamMatchIds).toHaveLength(2);
    return { leagueId, teamMatchIds };
  }

  /** 합성 OFFICIAL 리비전만 만든다 — 투영 핸들러는 호출하지 않는다. */
  async function createOfficialRevision(teamMatchId: string, score: { home: number; away: number }, officialAt: Date) {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score,
        eventsHash: `t4-league-nowait-hash-${randomUUID()}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T4_LEAGUE_NOWAIT_TEST',
        submittedAt: officialAt,
        officialAt,
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
    return { gameId: game.id, revisionId: revision.id };
  }

  function runProjection(revisionId: string) {
    return prisma.$transaction(
      async (tx) => {
        await projection.handler({ payload: { revisionId } } as never, tx);
      },
      { timeout: 20_000 },
    );
  }

  /** 마지막 한 건만 남기고 전부 투영까지 끝낸다. */
  async function leagueWithOneFixtureLeft(label: string) {
    const { leagueId, teamMatchIds } = await createLeagueWithFixtures(label);
    const first = await createOfficialRevision(teamMatchIds[0], { home: 2, away: 1 }, new Date('2026-08-10T12:00:00.000Z'));
    await runProjection(first.revisionId);
    expect(await leagueStatus(leagueId)).toBe('in_progress');
    const last = await createOfficialRevision(teamMatchIds[1], { home: 0, away: 0 }, new Date('2026-08-17T12:00:00.000Z'));
    return { leagueId, last };
  }

  async function leagueStatus(leagueId: string) {
    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId }, select: { status: true } });
    return row.status;
  }

  it('리그 행을 다른 트랜잭션이 쥐고 있으면 마지막 결과 투영은 기다리지 않고 409 로 물러나고, 게임 행을 놓는다', async () => {
    const { leagueId, last } = await leagueWithOneFixtureLeft('overlap');

    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let signalLeagueLocked!: () => void;
    const leagueLocked = new Promise<void>((resolve) => {
      signalLeagueLocked = resolve;
    });
    // 템플릿 교체와 같은 순서: 리그 행 → 같은 게임 행.
    const batch = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${leagueId} FOR UPDATE`;
        signalLeagueLocked();
        await gate;
        const startedAt = Date.now();
        await tx.$queryRaw`SELECT id FROM "v1_games" WHERE id = ${last.gameId} FOR UPDATE`;
        return Date.now() - startedAt;
      },
      { timeout: 20_000 },
    );
    // 일괄 쪽이 먼저 실패하면 leagueLocked 가 영원히 안 열리므로 함께 경합시킨다.
    const batchSettled = batch.catch((error: unknown) => {
      signalLeagueLocked();
      throw error;
    });

    try {
      await leagueLocked;
      const startedAt = Date.now();
      const rejection = await runProjection(last.revisionId).then(
        () => null,
        (error: unknown) => error,
      );
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(rejection).toMatchObject({ response: { code: 'COMMAND_CONCURRENCY_CONFLICT' } });
      expect(String((rejection as Error).message)).not.toMatch(/deadlock|40P01/i);
      expect(await leagueStatus(leagueId)).not.toBe('completed');
    } finally {
      openGate();
      // 열린 트랜잭션이 남지 않도록 항상 끝까지 기다린다.
      const lockWaitMs = await batchSettled;
      // 투영이 게임 행을 놓았으므로 일괄 쪽은 막힘 없이 잡는다(교착이면 timeout/40P01).
      expect(lockWaitMs).toBeLessThan(5_000);
    }

    // worker 재시도: 리그 잠금이 풀린 뒤에는 완료로 전이한다.
    await runProjection(last.revisionId);
    expect(await leagueStatus(leagueId)).toBe('completed');
  });

  it('대조군 — 겹침이 없으면 마지막 결과 투영이 리그를 completed 로 옮긴다', async () => {
    const { leagueId, last } = await leagueWithOneFixtureLeft('control');
    await runProjection(last.revisionId);
    expect(await leagueStatus(leagueId)).toBe('completed');
  });
});
