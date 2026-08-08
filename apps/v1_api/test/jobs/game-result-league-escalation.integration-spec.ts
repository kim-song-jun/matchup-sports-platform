import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GameResultSubmittedEscalationService } from '../../src/jobs/result-escalation/game-result-submitted-escalation.service';

const prisma = new PrismaService();

// suiteId는 파일 전체가 아니라 seedLeagueSubmittedRevision 호출마다(=테스트마다) 새로 뽑는다.
// 이 파일은 두 테스트가 같은 격리 DB 클론을 공유하므로(isolated-integration-environment는
// 파일 단위로 클론한다), 파일 레벨 상수를 썼다면 두 번째 테스트가 첫 번째 테스트의 region
// code/user id와 충돌해 UNIQUE 제약 위반으로 깨진다.
async function seedLeagueSubmittedRevision(submittedAt: Date, opts: { asLeague: boolean } = { asLeague: true }) {
  await prisma.$connect();
  const suiteId = randomUUID().slice(0, 8);
  const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
  const region = await prisma.v1Region.create({ data: { code: `t4-esc-region-${suiteId}`, name: '에스컬레이션 테스트 지역', level: 2 } });
  const homeOwnerId = `t4-esc-home-${suiteId}`;
  const awayOwnerId = `t4-esc-away-${suiteId}`;
  const adminUserId = `t4-esc-admin-${suiteId}`;
  await prisma.v1User.createMany({
    data: [homeOwnerId, awayOwnerId, adminUserId].map((id) => ({ id, email: `${id}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' })),
  });
  await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'ops' } });
  const homeTeam = await prisma.v1Team.create({ data: { ownerUserId: homeOwnerId, sportId: sport.id, regionId: region.id, name: `esc-home-${suiteId}` } });
  const awayTeam = await prisma.v1Team.create({ data: { ownerUserId: awayOwnerId, sportId: sport.id, regionId: region.id, name: `esc-away-${suiteId}` } });

  let seriesId: string | null = null;
  if (opts.asLeague) {
    const series = await prisma.v1TeamMatchSeries.create({
      data: {
        title: `에스컬레이션 리그 ${suiteId}`,
        sportId: sport.id,
        regionId: region.id,
        createdByAdminUserId: (await prisma.v1AdminUser.findUniqueOrThrow({ where: { userId: adminUserId } })).id,
        startsOn: new Date(),
        endsOn: new Date(Date.now() + 7 * 86_400_000),
        tieBreakJson: { order: ['points', 'goalDifference', 'goalsFor', 'headToHead'] },
      },
    });
    seriesId = series.id;
  }
  const teamMatch = await prisma.v1TeamMatch.create({
    data: {
      hostTeamId: homeTeam.id,
      createdByUserId: adminUserId,
      sportId: sport.id,
      regionId: region.id,
      title: `에스컬레이션 대진 ${suiteId}`,
      placeName: '장소 미정',
      startAt: new Date(),
      status: 'matched',
      approvedApplicantTeamId: awayTeam.id,
      seriesId,
    },
  });
  const game = await prisma.v1Game.create({
    data: {
      sourceType: 'TEAM_MATCH',
      teamMatchId: teamMatch.id,
      competitionConfigVersionId: '22222222-2222-4222-8222-222222222222',
    },
  });
  const revision = await prisma.v1GameResultRevision.create({
    data: {
      gameId: game.id,
      revision: 1,
      state: 'SUBMITTED',
      score: { home: 2, away: 1 },
      eventsHash: `t4-esc-hash-${suiteId}`,
      createdByActorType: 'USER',
      createdByUserId: homeOwnerId,
      submittedAt,
    },
  });
  return { revisionId: revision.id, homeOwnerId, awayOwnerId, adminUserId, teamMatch };
}

async function cleanupLeagueSubmittedRevision(ctx: Awaited<ReturnType<typeof seedLeagueSubmittedRevision>>) {
  const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: ctx.teamMatch.id } });
  // v1_result_escalations/v1_outbox_events는 revision을 FK로 참조한다(v1_result_escalations_revision_fk
  // 등) — 핸들러가 만든 큐 행을 먼저 지우지 않으면 revision 삭제가 FK 위반으로 실패한다.
  await prisma.$executeRaw`DELETE FROM v1_result_escalations WHERE result_revision_id IN (SELECT id FROM v1_game_result_revisions WHERE game_id = ${game.id})`;
  await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE aggregate_type = 'GAME' AND aggregate_id = ${game.id}`;
  await prisma.$executeRaw`DELETE FROM v1_notifications WHERE business_key LIKE ${`result-review:%`} AND target_id = ${ctx.teamMatch.id}`;
  await prisma.v1GameResultRevision.deleteMany({ where: { gameId: game.id } });
  await prisma.v1Game.deleteMany({ where: { teamMatchId: ctx.teamMatch.id } });
  await prisma.v1TeamMatchApplication.deleteMany({ where: { teamMatchId: ctx.teamMatch.id } });
  const teamMatch = await prisma.v1TeamMatch.findUnique({ where: { id: ctx.teamMatch.id } });
  await prisma.v1TeamMatch.delete({ where: { id: ctx.teamMatch.id } });
  if (teamMatch?.seriesId) await prisma.v1TeamMatchSeries.delete({ where: { id: teamMatch.seriesId } }).catch(() => undefined);
}

describe('GameResultSubmittedEscalationService — 리그 12시간 에스컬레이션', () => {
  afterAll(async () => prisma.$disconnect());

  it('seriesId가 있는 팀매치는 12시간 뒤 due_at인 ESCALATION 행 1개만 생기고, escalationHandler가 원정+홈+admin 3명에게 알림을 보낸다', async () => {
    const service = new GameResultSubmittedEscalationService();
    const submittedAt = new Date(Date.now() - 13 * 60 * 60 * 1_000); // 13시간 전 -> 12h 임계값 지남
    const ctx = await seedLeagueSubmittedRevision(submittedAt);
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { revisionId: ctx.revisionId } } as never, tx);
        await service.escalationHandler({ payload: { revisionId: ctx.revisionId } } as never, tx);
      });

      const escalationRows = await prisma.$queryRaw<Array<{ kind: string; dueAt: Date }>>`
        SELECT kind::text as kind, due_at as "dueAt" FROM v1_result_escalations WHERE result_revision_id = ${ctx.revisionId}
      `;
      expect(escalationRows).toHaveLength(1);
      expect(escalationRows[0].kind).toBe('ESCALATION');
      const expectedDueAt = submittedAt.getTime() + 12 * 60 * 60 * 1_000;
      expect(Math.abs(escalationRows[0].dueAt.getTime() - expectedDueAt)).toBeLessThan(1_000);

      const notifications = await prisma.$queryRaw<Array<{ recipientUserId: string }>>`
        SELECT recipient_user_id as "recipientUserId" FROM v1_notifications
        WHERE business_key LIKE ${`result-review:${ctx.revisionId}:league-escalation:%`}
      `;
      expect(notifications.map((n) => n.recipientUserId).sort()).toEqual(
        [ctx.homeOwnerId, ctx.awayOwnerId, ctx.adminUserId].sort(),
      );
    } finally {
      await cleanupLeagueSubmittedRevision(ctx);
    }
  });

  it('seriesId가 없는(일반) 팀매치는 기존 48시간 임계값과 0건 리그알림 동작이 그대로 유지된다', async () => {
    const service = new GameResultSubmittedEscalationService();
    const submittedAt = new Date(Date.now() - 1_000);
    const ctx = await seedLeagueSubmittedRevision(submittedAt, { asLeague: false });
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { revisionId: ctx.revisionId } } as never, tx);
      });
      const escalationRows = await prisma.$queryRaw<Array<{ kind: string; dueAt: Date }>>`
        SELECT kind::text as kind, due_at as "dueAt" FROM v1_result_escalations WHERE result_revision_id = ${ctx.revisionId} ORDER BY kind
      `;
      expect(escalationRows).toHaveLength(2); // REMINDER + ESCALATION, 기존 그대로
      const escalation = escalationRows.find((r) => r.kind === 'ESCALATION')!;
      const expectedDueAt = submittedAt.getTime() + 48 * 60 * 60 * 1_000;
      expect(Math.abs(escalation.dueAt.getTime() - expectedDueAt)).toBeLessThan(1_000);
    } finally {
      await cleanupLeagueSubmittedRevision(ctx);
    }
  });
});
