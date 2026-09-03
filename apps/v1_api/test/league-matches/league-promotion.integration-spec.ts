import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// Task 153 승강 확정 경로의 통합 계약.
//
// 이 경로는 그동안 통합 테스트가 0건이었다 — 순수 함수(calculatePromotions)와 프론트
// 상태 전이만 유닛으로 덮여 있었고, `preview → commit → 다음 시즌 생성` 이 실제 DB 와
// 함께 돌아간 적이 없었다. 그 사각지대에서 alpha 실측으로 드러난 결함이 아래 케이스들이다:
//
//   - 경기가 한 건도 없는 draft 시즌에서 preview·commit 이 그대로 성공했다.
//     (전원 0승0무0패 동률이라 강등 대상이 tie-break 순서로 정해졌다)
//   - 동시 확정 경합에서 진 요청이 409 가 아니라 500 을 받았다.
//   - preview 이후 규칙을 바꾸면, 어드민이 손대지도 않은 팀이 override 로 기록됐다.
//   - 다음 시즌에 1팀만 남는 티어가 실제로 만들어졌다(대진 생성이 영구히 거부되는 죽은 리그).
//
// 순수 함수 유닛으로는 어느 것도 잡을 수 없다 — 전부 DB 상태·HTTP 계약에 걸린 결함이다.
const suiteId = randomUUID().slice(0, 8);
const adminUserId = `t153-promotion-admin-${suiteId}`;

describe('리그 승강 확정 (Task 153)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.create({
      data: {
        id: adminUserId,
        email: `${adminUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      adminUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });

    // 대진 생성이 종목별 경기 설정을 요구한다(COMPETITION_CONFIG_REQUIRED) — 백필 CLI 가
    // 시드하는 futsal-v1 프리셋에 걸리도록 code 를 'futsal' 로 둔다.
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t153-promotion-region-${suiteId}`, name: 'T153 승강 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  const http = () => request(app.getHttpServer());
  const asAdmin = <T extends request.Test>(req: T): T => req.set('x-v1-user-id', adminUserId) as T;

  let teamSeq = 0;
  async function createTeam(label: string) {
    teamSeq += 1;
    return prisma.v1Team.create({
      data: { ownerUserId: adminUserId, sportId, regionId, name: `t153-${label}-${suiteId}-${teamSeq}` },
    });
  }

  /**
   * league-completion-projection.integration-spec.ts 와 같은 "합성 OFFICIAL 리비전" 패턴.
   * 실제 GameResultOfficialProjectionService.handler 를 그대로 태워, 리그 자동 completed
   * 전이까지 프로덕션 경로로 재현한다.
   */
  async function officializeFixture(teamMatchId: string, score: { home: number; away: number }) {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const officialAt = new Date('2026-08-17T12:00:00.000Z');
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score,
        eventsHash: `t153-promotion-hash-${randomUUID()}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T153_PROMOTION_TEST',
        submittedAt: officialAt,
        officialAt,
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
    const projection = new GameResultOfficialProjectionService();
    await prisma.$transaction(async (tx) => {
      await projection.handler({ payload: { revisionId: revision.id } } as never, tx);
    });
  }

  /** 시리즈 생성 + 시즌1 시딩. 리그는 아직 draft(대진 0건)다. */
  async function seedSeries(title: string, tierTeams: string[][]) {
    const createRes = await asAdmin(http().post('/api/v1/admin/league-series')).send({
      title: `${title} ${suiteId}`,
      sportId,
      regionId,
      tierCount: tierTeams.length,
    });
    expect(createRes.status).toBe(201);
    const seriesId = createRes.body.data.id as string;

    const seedRes = await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/seed`)).send({
      tiers: tierTeams.map((teamIds, index) => ({
        tier: index + 1,
        title: `${title} ${index + 1}부`,
        teamIds,
      })),
    });
    expect(seedRes.status).toBe(201);
    const leagueIds = (seedRes.body.data.leagues as Array<{ id: string; tier: number }>)
      .sort((a, b) => a.tier - b.tier)
      .map((league) => league.id);
    return { seriesId, leagueIds };
  }

  /** 리그의 대진을 만들고 전부 공식 확정해 completed 로 만든다. */
  async function finishLeague(leagueId: string) {
    const fixturesRes = await asAdmin(http().post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)).send({
      weeksCount: 1,
    });
    expect(fixturesRes.status).toBe(201);
    const teamMatchIds = fixturesRes.body.data.teamMatchIds as string[];
    // 1승/1패가 갈려야 순위가 동률이 아니게 된다 — 승강 경계가 실제 경기 결과로 정해지는지
    // 확인하려면 순위표가 tie-break 가 아니라 승점으로 갈려야 한다.
    for (const teamMatchId of teamMatchIds) {
      await officializeFixture(teamMatchId, { home: 3, away: 0 });
    }
    const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.state).toBe('completed');
  }

  describe('시즌 종료 게이트', () => {
    it('경기가 한 건도 없는 draft 시즌은 preview 가 409 로 막힌다', async () => {
      const teams = [await createTeam('gate-a'), await createTeam('gate-b'), await createTeam('gate-c'), await createTeam('gate-d')];
      const { seriesId } = await seedSeries('게이트', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);

      const res = await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`));

      // 기존 게이트(pendingFixtures > 0)는 대진이 0건이면 공허하게 통과했다.
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAGUE_SEASON_NOT_FINISHED');
    });

    it('대진은 있지만 결과가 미확정이면 preview 가 409 로 막힌다', async () => {
      const teams = [await createTeam('pend-a'), await createTeam('pend-b'), await createTeam('pend-c'), await createTeam('pend-d')];
      const { seriesId, leagueIds } = await seedSeries('미확정', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) {
        await asAdmin(http().post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)).send({ weeksCount: 1 });
      }

      const res = await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAGUE_SEASON_NOT_FINISHED');
    });

    it('시즌 번호가 int4 범위를 넘으면 500 이 아니라 400 이다', async () => {
      const teams = [await createTeam('int4-a'), await createTeam('int4-b')];
      const { seriesId } = await seedSeries('범위', [[teams[0].id, teams[1].id]]);

      const res = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/3000000000/promotions/preview`),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('LEAGUE_SEASON_NO_INVALID');
    });
  });

  describe('preview → commit → 다음 시즌', () => {
    it('시즌이 끝나면 승강을 계산하고, 확정 시 다음 시즌 리그와 참가 팀이 생긴다', async () => {
      const teams = [
        await createTeam('flow-a1'), await createTeam('flow-a2'),
        await createTeam('flow-b1'), await createTeam('flow-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('정상흐름', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      expect(previewRes.status).toBe(201);
      const preview = previewRes.body.data;
      expect(preview.alreadyDecided).toBe(false);
      expect(preview.ruleFingerprint).toMatch(/^[0-9a-f]{64}$/);

      // 기본 규칙(20% 올림, 최소 1팀) · 티어당 2팀:
      // 1부는 승격 없이 강등 1, 2부는 강등 없이 승격 1.
      const tier1 = preview.tiers.find((t: { tier: number }) => t.tier === 1);
      const tier2 = preview.tiers.find((t: { tier: number }) => t.tier === 2);
      expect(tier1).toMatchObject({ promoteCount: 0, relegateCount: 1, skippedByMajorityGuard: false });
      expect(tier2).toMatchObject({ promoteCount: 1, relegateCount: 0, skippedByMajorityGuard: false });

      // 승강 대상은 실제 경기 결과 순위를 따른다 — 각 리그의 꼴찌가 강등, 1위가 승격.
      const relegated = tier1.entries.find((e: { computedKind: string }) => e.computedKind === 'relegated');
      const promoted = tier2.entries.find((e: { computedKind: string }) => e.computedKind === 'promoted');
      expect(relegated.position).toBe(2);
      expect(promoted.position).toBe(1);

      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );
      const commitRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
      ).send({ entries, ruleFingerprint: preview.ruleFingerprint });

      expect(commitRes.status).toBe(201);
      expect(commitRes.body.data).toMatchObject({ seasonNo: 1, nextSeasonNo: 2, decidedCount: 4, overriddenCount: 0 });

      // 다음 시즌 리그가 티어별로 생기고, 승강 결과대로 팀이 배치돼야 한다.
      const nextLeagues = await prisma.v1League.findMany({
        where: { seriesId, seasonNo: 2 },
        orderBy: { tier: 'asc' },
        include: { teams: { select: { teamId: true } } },
      });
      expect(nextLeagues).toHaveLength(2);

      // dual-write — 승강으로 만든 다음 시즌 리그에도 통합 축 거울이 함께 생겨야 한다.
      // 안 생기면 그 리그는 read-swap 뒤 **에러 없이 화면에서 사라진다**(운영자는 "새 시즌
      // 리그가 안 보인다"고만 말할 수 있다). 이 경로는 리그를 만드는 세 자리 중 하나다 —
      // `docs/ops/read-swap-preflight.md` 9절 참고.
      const nextMirrors = await prisma.v1Tournament.findMany({
        where: { id: { in: nextLeagues.map((league) => league.id) } },
        orderBy: { tier: 'asc' },
      });
      expect(nextMirrors).toHaveLength(2);
      expect(nextMirrors.every((mirror) => mirror.kind === 'regular_league')).toBe(true);
      // 값까지 리그와 같아야 한다 — 행만 있고 값이 비면 화면이 잘못 그려진다.
      expect(nextMirrors.map((mirror) => mirror.tier)).toEqual(nextLeagues.map((league) => league.tier));
      expect(nextMirrors.map((mirror) => mirror.seasonNo)).toEqual(
        nextLeagues.map((league) => league.seasonNo),
      );
      expect(nextMirrors.every((mirror) => mirror.regionId !== null)).toBe(true);
      const nextTier1TeamIds = nextLeagues[0].teams.map((t) => t.teamId).sort();
      const nextTier2TeamIds = nextLeagues[1].teams.map((t) => t.teamId).sort();
      // 1부: 잔류 1팀 + 2부에서 승격한 1팀
      expect(nextTier1TeamIds).toEqual(
        [tier1.entries.find((e: { computedKind: string }) => e.computedKind === 'stayed').teamId, promoted.teamId].sort(),
      );
      // 2부: 잔류 1팀 + 1부에서 강등한 1팀
      expect(nextTier2TeamIds).toEqual(
        [tier2.entries.find((e: { computedKind: string }) => e.computedKind === 'stayed').teamId, relegated.teamId].sort(),
      );

      // 감사 추적: 규칙대로 확정했으므로 override 는 하나도 없어야 한다.
      const promotions = await prisma.v1LeaguePromotion.findMany({ where: { fromLeagueId: { in: leagueIds } } });
      expect(promotions).toHaveLength(4);
      expect(promotions.every((row) => row.overriddenByAdmin === false)).toBe(true);
      expect(promotions.every((row) => row.decidedByAdminUserId !== null)).toBe(true);

      // 같은 시즌 재확정은 멱등하게 409 로 막힌다.
      const again = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
      ).send({ entries, ruleFingerprint: preview.ruleFingerprint });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('PROMOTION_ALREADY_DECIDED');

      // 공개 순위표에 확정된 승강 상태가 드러난다(User Scenario 4).
      // V1LeaguePromotion 은 이전까지 쓰기만 하고 읽는 코드가 없었다.
      const standingsRes = await http().get(`/api/v1/league-matches/${leagueIds[0]}/standings`);
      expect(standingsRes.status).toBe(200);
      expect(standingsRes.body.data.promotionDecided).toBe(true);
      expect(standingsRes.body.data.tierLabel).toBe('1부');
      const relegatedRow = standingsRes.body.data.standings.find(
        (row: { teamId: string }) => row.teamId === relegated.teamId,
      );
      expect(relegatedRow.promotionKind).toBe('relegated');
      expect(relegatedRow.promotionToTierLabel).toBe('2부');
    });

    it('preview 이후 규칙이 바뀌면 commit 이 409 로 막힌다', async () => {
      const teams = [
        await createTeam('rule-a1'), await createTeam('rule-a2'),
        await createTeam('rule-b1'), await createTeam('rule-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('규칙변경', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      const preview = previewRes.body.data;
      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );

      // 어드민이 결정은 손대지 않고 규칙만 바꾼다.
      const patchRes = await asAdmin(http().patch(`/api/v1/admin/league-series/${seriesId}`)).send({
        promotionRule: { mode: 'fixed', fixedCount: 1, minSlots: 1 },
      });
      expect(patchRes.status).toBe(200);

      const commitRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
      ).send({ entries, ruleFingerprint: preview.ruleFingerprint });

      // 이 가드가 없으면 서버가 새 규칙으로 다시 계산한 computedKind 와 어긋나
      // 어드민이 손대지도 않은 팀이 overriddenByAdmin=true 로 박제된다.
      expect(commitRes.status).toBe(409);
      expect(commitRes.body.code).toBe('PROMOTION_RULE_CHANGED');
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(0);
    });

    it('다음 시즌에 1팀만 남는 티어가 생기면 확정이 422 로 막힌다', async () => {
      const teams = [
        await createTeam('small-a1'), await createTeam('small-a2'),
        await createTeam('small-b1'), await createTeam('small-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('소규모', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      const preview = previewRes.body.data;
      const tier2 = preview.tiers.find((t: { tier: number }) => t.tier === 2);

      // 2부 잔류 팀을 불참 처리하면 다음 시즌 2부는 1부에서 강등된 1팀만 남는다.
      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );
      const stayedInTier2 = tier2.entries.find((e: { computedKind: string }) => e.computedKind === 'stayed');
      const withdrawn = entries.map((entry: { teamId: string }) =>
        entry.teamId === stayedInTier2.teamId
          ? { ...entry, kind: 'withdrawn', overrideNote: '다음 시즌 불참 통보' }
          : entry,
      );

      const commitRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
      ).send({ entries: withdrawn, ruleFingerprint: preview.ruleFingerprint });

      // 1팀 리그는 대진 생성이 영구히 422 라 시작도 종료도 못 하는 죽은 리그가 된다.
      expect(commitRes.status).toBe(422);
      expect(commitRes.body.code).toBe('PROMOTION_NEXT_SEASON_TIER_TOO_SMALL');
      // 확정이 막혔으므로 승강 이력도 다음 시즌 리그도 생기면 안 된다.
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(0);
      expect(await prisma.v1League.count({ where: { seriesId, seasonNo: 2 } })).toBe(0);
    });

    it('계산 결과를 뒤집으면서 사유를 안 주면 400 — 계산대로 두는 항목은 사유가 필요 없다', async () => {
      // D9: 규칙대로 나온 결과는 규칙이 곧 설명이다. **운영자가 뒤집은 항목**만 그 팀에게
      // 시즌 티어가 달라지는 조치라, 나중에 "왜 우리가 강등됐나" 를 답할 수 있어야 한다.
      const teams = [
        await createTeam('note-a1'), await createTeam('note-a2'),
        await createTeam('note-b1'), await createTeam('note-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('사유-계산대로', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const preview = (
        await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`))
      ).body.data;
      const entries = preview.tiers.flatMap(
        (tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
          tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );

      // 계산대로만 보내면 통과해야 한다 — 사유를 전부에게 요구하는 가드와 구분한다.
      const asComputed = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
      ).send({ entries, ruleFingerprint: preview.ruleFingerprint });
      expect(asComputed.status).toBe(201);
    });

    it('사유 없이 계산 결과를 뒤집으면 400 이고 아무것도 확정되지 않는다', async () => {
      const teams = [
        await createTeam('note2-a1'), await createTeam('note2-a2'),
        await createTeam('note2-b1'), await createTeam('note2-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('사유-뒤집기', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const preview = (
        await asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`))
      ).body.data;
      const entries = preview.tiers.flatMap(
        (tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
          tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );
      // 계산이 'stayed' 라고 한 팀을 사유 없이 'withdrawn' 으로 뒤집는다.
      const stayed = entries.find((entry: { kind: string }) => entry.kind === 'stayed');
      expect(stayed).toBeDefined();
      const flipped = entries.map((entry: { teamId: string }) =>
        entry.teamId === stayed.teamId ? { ...entry, kind: 'withdrawn' } : entry,
      );

      const res = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
      ).send({ entries: flipped, ruleFingerprint: preview.ruleFingerprint });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PROMOTION_OVERRIDE_NOTE_REQUIRED');
      // 막혔으면 승강 이력도 다음 시즌 리그도 없어야 한다.
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(0);
      expect(await prisma.v1League.count({ where: { seriesId, seasonNo: 2 } })).toBe(0);
    });

    it('동시에 확정하면 한 건만 성공하고 나머지는 500 이 아니라 409 를 받는다', async () => {
      const teams = [
        await createTeam('race-a1'), await createTeam('race-a2'),
        await createTeam('race-b1'), await createTeam('race-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('경합', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      const preview = previewRes.body.data;
      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );

      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          asAdmin(http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`)).send({
            entries,
            ruleFingerprint: preview.ruleFingerprint,
          }),
        ),
      );
      const statuses = results.map((res) => res.status).sort();

      // 선착 확인(findFirst)과 createMany 사이의 틈에서 unique 제약에 걸린 요청이
      // P2002 를 그대로 흘려 500 이 됐었다 — 진 쪽도 선착 확인과 같은 409 를 받아야 한다.
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(3);
      expect(statuses).not.toContain(500);

      // 경합이 데이터를 망가뜨리지 않았는지 — 승강 이력도 다음 시즌 리그도 정확히 한 벌.
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(4);
      expect(await prisma.v1League.count({ where: { seriesId, seasonNo: 2 } })).toBe(2);
    });
  });

  describe('가용성 실패와 응답의 진실성', () => {
    // alpha 실측(2026-08-23, 동시 8건): 201 을 받은 요청이 하나도 없는데 다음 시즌은
    // 정확히 한 벌 생성됐다 — 503 을 받은 요청 중 하나가 실제로는 커밋에 성공한 것이다.
    // Prisma 인터랙티브 트랜잭션은 커밋 이후에도 래퍼 타임아웃을 던질 수 있다.
    // 그대로 두면 어드민이 "실패했구나" 로 읽는데 실제로는 확정이 끝나 있다.
    it('트랜잭션이 가용성 오류로 실패해도 이력이 남았으면 503 이 아니라 409 로 답한다', async () => {
      const teams = [
        await createTeam('avail-a1'), await createTeam('avail-a2'),
        await createTeam('avail-b1'), await createTeam('avail-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('가용성', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      const preview = previewRes.body.data;
      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );

      // 재현해야 하는 것은 "커밋은 끝났는데 래퍼가 터진" 순간이다. 이미 확정된 시즌으로
      // 시작하면 commitPromotions 의 사전 체크(findFirst)가 트랜잭션에 닿기도 전에 409 를
      // 내버려서 이 경로를 전혀 타지 않는다 — 그러면 테스트가 아무것도 증명하지 못한다.
      // 그래서 아직 확정되지 않은 시즌에서, 트랜잭션을 **실제로 수행한 뒤** 예외를 던진다.
      const prismaService = app.get(PrismaService) as unknown as {
        $transaction: (...args: unknown[]) => Promise<unknown>;
      };
      const original = prismaService.$transaction.bind(prismaService);
      let ran = false;
      prismaService.$transaction = async (...args: unknown[]) => {
        if (ran) return original(...(args as [never]));
        ran = true;
        await original(...(args as [never])); // 여기서 승강 이력이 실제로 저장된다.
        throw Object.assign(
          new Error('Transaction API error: Unable to start a transaction in the given time.'),
          { code: 'P2028' },
        );
      };

      try {
        const res = await asAdmin(
          http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
        ).send({ entries, ruleFingerprint: preview.ruleFingerprint });

        // 503(= 아무 일도 없었다)이 아니라, 사실대로 409 여야 한다.
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PROMOTION_ALREADY_DECIDED');
      } finally {
        prismaService.$transaction = original as never;
      }

      // 그리고 실제로 저장돼 있어야 한다 — 409 가 사실이라는 근거.
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(4);
    });

    it('이력이 없는 상태에서 가용성 오류가 나면 그대로 503 이다 — 없는 성공을 지어내지 않는다', async () => {
      const teams = [
        await createTeam('avail2-a1'), await createTeam('avail2-a2'),
        await createTeam('avail2-b1'), await createTeam('avail2-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('가용성2', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      const preview = previewRes.body.data;
      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );

      const prismaService = app.get(PrismaService) as unknown as {
        $transaction: (...args: unknown[]) => Promise<unknown>;
      };
      const original = prismaService.$transaction.bind(prismaService);
      prismaService.$transaction = async () => {
        throw Object.assign(
          new Error('Transaction API error: Unable to start a transaction in the given time.'),
          { code: 'P2028' },
        );
      };

      try {
        const res = await asAdmin(
          http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
        ).send({ entries, ruleFingerprint: preview.ruleFingerprint });

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('SERVICE_TEMPORARILY_BUSY');
      } finally {
        prismaService.$transaction = original as never;
      }
      // 실제로 아무것도 안 생겼는지 확인 — 거짓 409 를 냈다면 여기서 드러난다.
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(0);
    });
  });

  describe('감사 로그가 확정 트랜잭션에 묶여 있는가', () => {
    // 근본 원인 회귀 가드. logAdminAction 에 tx 를 넘기지 않으면 this.prisma 로 떨어져
    // **트랜잭션을 점유한 채 풀에서 두 번째 커넥션을 잡는다** — 동시 N 건이면 커넥션 2N 개가
    // 필요해지고 풀 크기를 넘는 순간 전원이 서로를 기다리는 자기 교착에 빠진다
    // (alpha 실측: 동시 6건이 한 건도 성공하지 못했다).
    //
    // 커넥션 점유는 테스트로 직접 재기 어렵지만, tx 를 안 넘겼을 때 함께 깨지는 성질이
    // 하나 더 있다 — 롤백된 확정의 감사 로그가 살아남는다. 그걸 잡으면 원인도 함께 잡힌다.
    it('확정이 롤백되면 감사 로그도 남지 않는다', async () => {
      const teams = [
        await createTeam('audit-a1'), await createTeam('audit-a2'),
        await createTeam('audit-b1'), await createTeam('audit-b2'),
      ];
      const { seriesId, leagueIds } = await seedSeries('감사롤백', [
        [teams[0].id, teams[1].id],
        [teams[2].id, teams[3].id],
      ]);
      for (const leagueId of leagueIds) await finishLeague(leagueId);

      const previewRes = await asAdmin(
        http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/preview`),
      );
      const preview = previewRes.body.data;
      const entries = preview.tiers.flatMap((tier: { entries: Array<{ teamId: string; tier: number; computedKind: string }> }) =>
        tier.entries.map((entry) => ({ teamId: entry.teamId, fromTier: entry.tier, kind: entry.computedKind })),
      );

      const before = await prisma.v1AdminActionLog.count({
        where: { action: 'league_series.commit_promotions', targetId: seriesId },
      });

      // 트랜잭션 본문은 끝까지 수행하되(감사 로그 기록 포함) 커밋 직전에 실패시킨다.
      const prismaService = app.get(PrismaService) as unknown as {
        $transaction: (...args: unknown[]) => Promise<unknown>;
      };
      const original = prismaService.$transaction.bind(prismaService);
      let armed = true;
      prismaService.$transaction = async (...args: unknown[]) => {
        if (!armed) return original(...(args as [never]));
        armed = false;
        const fn = args[0] as (tx: unknown) => Promise<unknown>;
        return original(async (tx: unknown) => {
          await fn(tx);
          throw new Error('T153_FORCED_ROLLBACK');
        }, args[1] as never);
      };

      try {
        await asAdmin(
          http().post(`/api/v1/admin/league-series/${seriesId}/seasons/1/promotions/commit`),
        ).send({ entries, ruleFingerprint: preview.ruleFingerprint });
      } finally {
        prismaService.$transaction = original as never;
      }

      // 확정이 롤백됐으니 승강 이력도, 감사 로그도 늘어나면 안 된다.
      expect(await prisma.v1LeaguePromotion.count({ where: { fromLeagueId: { in: leagueIds } } })).toBe(0);
      const after = await prisma.v1AdminActionLog.count({
        where: { action: 'league_series.commit_promotions', targetId: seriesId },
      });
      expect(after).toBe(before);
    });
  });

  describe('하위호환 — 단발 리그', () => {
    it('시리즈에 속하지 않은 리그는 티어가 없고 공개 목록·순위표에도 티어가 붙지 않는다', async () => {
      const teamA = await createTeam('solo-a');
      const teamB = await createTeam('solo-b');
      const createRes = await asAdmin(http().post('/api/v1/admin/league-matches')).send({
        title: `단발 리그 ${suiteId}`,
        sportId,
        regionId,
        startsOn: new Date('2026-09-01T00:00:00.000Z').toISOString(),
        endsOn: new Date('2026-09-30T00:00:00.000Z').toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
      expect(createRes.status).toBe(201);
      const leagueId = createRes.body.data.leagueId as string;

      const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
      expect(league.seriesId).toBeNull();
      expect(league.tier).toBeNull();
      expect(league.seasonNo).toBeNull();

      const standingsRes = await http().get(`/api/v1/league-matches/${leagueId}/standings`);
      expect(standingsRes.body.data.tierLabel).toBeNull();
      expect(standingsRes.body.data.promotionDecided).toBe(false);

      const detailRes = await http().get(`/api/v1/league-matches/${leagueId}`);
      expect(detailRes.body.data.tierLabel).toBeNull();
    });
  });
});
