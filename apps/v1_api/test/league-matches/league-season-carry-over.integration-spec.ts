import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const adminUserId = `carry-over-admin-${suiteId}`;

/**
 * 승강 확정으로 만든 새 시즌이 직전 시즌의 같은 티어에서 대표 이미지·참가비·계좌를 이어받는다(MD-QA #36·#37).
 * 티어가 서로 바뀌면(1부 값이 2부로 새면) 안 되므로 두 티어가 서로 다른 값을 갖는 시리즈로 대조한다.
 */
describe('리그 시즌 승계 — 같은 티어 값 복사', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let teamSeq = 0;

  const http = () => request(app.getHttpServer());
  const asAdmin = <T extends request.Test>(req: T): T => req.set('x-v1-user-id', adminUserId) as T;
  const createTeam = () => {
    teamSeq += 1;
    return prisma.v1Team.create({ data: { ownerUserId: adminUserId, sportId, regionId, name: `carry-${suiteId}-${teamSeq}` } });
  };

  const TIER1 = { coverImageUrl: '/uploads/2026/10/tier1.webp', entryFee: 70000, bankName: '국민은행', bankAccount: `T1-${suiteId}`, bankHolder: '일부팀' };
  const TIER2 = { coverImageUrl: '/uploads/2026/10/tier2.webp', entryFee: 50000, bankName: '신한은행', bankAccount: `T2-${suiteId}`, bankHolder: '이부팀' };

  async function officializeFixture(teamMatchId: string, score: { home: number; away: number }) {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const officialAt = new Date('2026-08-17T12:00:00.000Z');
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id, revision: 1, state: 'OFFICIAL', score, eventsHash: `carry-hash-${randomUUID()}`,
        createdByActorType: 'SYSTEM', createdBySystemActor: 'CARRY_OVER_TEST', submittedAt: officialAt, officialAt,
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
    const projection = new GameResultOfficialProjectionService();
    await prisma.$transaction(async (tx) => {
      await projection.handler({ payload: { revisionId: revision.id } } as never, tx);
    });
  }

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: { id: adminUserId, email: `${adminUserId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date(), accountStatus: 'active' },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(adminUserId, required);
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    regionId = (await prisma.v1Region.create({ data: { code: `carry-region-${suiteId}`, name: '승계 테스트 지역', level: 2 } })).id;
  });
  afterAll(async () => cleanup?.());

  it('새 시즌은 같은 티어의 이미지·참가비·계좌를 이어받고(서로 바뀌지 않음) 설정 시각은 비워 둔다', async () => {
    const teams = [await createTeam(), await createTeam(), await createTeam(), await createTeam()];
    const created = await asAdmin(http().post('/api/v1/admin/league-series')).send({
      title: `승계 ${suiteId}`, sportId, regionId, tierCount: 2,
    }).expect(201);
    const seriesId = created.body.data.id as string;
    const seeded = await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/seed`)).send({
      tiers: [
        { tier: 1, title: '승계 1부', teamIds: [teams[0].id, teams[1].id] },
        { tier: 2, title: '승계 2부', teamIds: [teams[2].id, teams[3].id] },
      ],
    }).expect(201);
    const leagueIds = (seeded.body.data.leagues as Array<{ id: string; tier: number }>).sort((a, b) => a.tier - b.tier).map((league) => league.id);

    // seedSeason 은 직전 시즌이 없어 기본값 그대로다.
    for (const id of leagueIds) {
      expect(await prisma.v1Tournament.findUniqueOrThrow({ where: { id } })).toMatchObject({
        coverImageUrl: null, entryFee: 0, bankName: null, bankAccount: null, bankHolder: null, entryFeeConfiguredAt: null,
      });
    }

    await prisma.v1Tournament.update({ where: { id: leagueIds[0] }, data: { ...TIER1, entryFeeConfiguredAt: new Date() } });
    await prisma.v1Tournament.update({ where: { id: leagueIds[1] }, data: { ...TIER2, entryFeeConfiguredAt: new Date() } });

    for (const leagueId of leagueIds) {
      const fixtures = await asAdmin(http().post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)).send({ weeksCount: 1 }).expect(201);
      for (const teamMatchId of fixtures.body.data.teamMatchIds as string[]) await officializeFixture(teamMatchId, { home: 3, away: 0 });
    }
    const preview = (await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`)).expect(201)).body.data;
    const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
      tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })));
    await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`))
      .send({ entries, ruleFingerprint: preview.ruleFingerprint }).expect(201);

    const next = await prisma.v1Tournament.findMany({ where: { kind: 'regular_league', seriesId, seasonNo: 2 }, orderBy: { tier: 'asc' } });
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ tier: 1, ...TIER1, entryFeeConfiguredAt: null });
    expect(next[1]).toMatchObject({ tier: 2, ...TIER2, entryFeeConfiguredAt: null });
    // 값 복사일 뿐 이후 독립이다 — 직전 시즌을 바꿔도 새 시즌은 그대로.
    await prisma.v1Tournament.update({ where: { id: leagueIds[0] }, data: { entryFee: 1, coverImageUrl: null } });
    expect(await prisma.v1Tournament.findUniqueOrThrow({ where: { id: next[0].id } })).toMatchObject({ entryFee: TIER1.entryFee, coverImageUrl: TIER1.coverImageUrl });
  });
});
