import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import type { GamesService } from '../../src/games/games.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import type { UpdateLeagueFixtureDto } from '../../src/league-matches/dto/league-match.dto';
import {
  LeagueResultEntryReminderService,
  scheduleLeagueResultEntryReminder,
} from '../../src/jobs/league-reminders/league-result-entry-reminder.service';

const prisma = new PrismaService();

// 사용자 확정(2026-08-24): 경기 시작 +24시간, 1회. 이 상수를 그대로 재사용하면 프로덕션
// 코드의 값을 바꿔도 테스트가 조용히 계속 통과해버리는 tautology가 되므로, 여기서는
// due_at 을 직접 비교하지 않고(스케줄 함수 자체 테스트는 별도) 항상 handler를
// "이미 발화 시점이 된 것처럼" 트랜잭션 안에서 직접 호출한다 — 다른 result-escalation
// 계열 스펙(game-result-league-escalation.integration-spec.ts)과 동일한 패턴.

async function seedFixture(opts: { officialResult?: boolean; status?: 'matched' | 'cancelled' } = {}) {
  await prisma.$connect();
  const suiteId = randomUUID().slice(0, 8);
  const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
  const region = await prisma.v1Region.create({ data: { code: `t-lrer-region-${suiteId}`, name: '리마인더 테스트 지역', level: 2 } });
  const homeOwnerId = `t-lrer-home-${suiteId}`;
  const awayOwnerId = `t-lrer-away-${suiteId}`;
  const creatorAdminUserId = `t-lrer-creator-${suiteId}`;
  await prisma.v1User.createMany({
    data: [homeOwnerId, awayOwnerId, creatorAdminUserId].map((id) => ({
      id,
      email: `${id}@integration.test`,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    })),
  });
  await prisma.v1AdminUser.create({ data: { userId: creatorAdminUserId, adminRole: 'ops' } });
  const homeTeam = await prisma.v1Team.create({ data: { ownerUserId: homeOwnerId, sportId: sport.id, regionId: region.id, name: `lrer-home-${suiteId}` } });
  const awayTeam = await prisma.v1Team.create({ data: { ownerUserId: awayOwnerId, sportId: sport.id, regionId: region.id, name: `lrer-away-${suiteId}` } });
  const league = await prisma.v1League.create({
    data: {
      title: `리마인더 리그 ${suiteId}`,
      sportId: sport.id,
      regionId: region.id,
      createdByAdminUserId: (await prisma.v1AdminUser.findUniqueOrThrow({ where: { userId: creatorAdminUserId } })).id,
      startsOn: new Date(),
      endsOn: new Date(Date.now() + 7 * 86_400_000),
      tieBreakJson: { order: ['points', 'goalDifference', 'goalsFor', 'headToHead'] },
    },
  });
  const startAt = new Date();
  const teamMatch = await prisma.v1TeamMatch.create({
    data: {
      hostTeamId: homeTeam.id,
      createdByUserId: creatorAdminUserId,
      sportId: sport.id,
      regionId: region.id,
      title: `리마인더 대진 ${suiteId}`,
      placeName: '장소 미정',
      startAt,
      status: opts.status ?? 'matched',
      approvedApplicantTeamId: awayTeam.id,
      leagueId: league.id,
    },
  });
  const game = await prisma.v1Game.create({
    data: {
      sourceType: 'TEAM_MATCH',
      teamMatchId: teamMatch.id,
      competitionConfigVersionId: '22222222-2222-4222-8222-222222222222',
    },
  });
  if (opts.officialResult) {
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 2, away: 1 },
        eventsHash: `t-lrer-hash-${suiteId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T_LRER_TEST',
        submittedAt: new Date(),
        officialAt: new Date(),
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
  }
  return { teamMatchId: teamMatch.id, leagueId: league.id, gameId: game.id, startAt, creatorAdminUserId };
}

async function cleanupFixture(ctx: Awaited<ReturnType<typeof seedFixture>>) {
  await prisma.$executeRaw`DELETE FROM v1_notifications WHERE business_key LIKE ${`league-result-entry-reminder:${ctx.teamMatchId}:%`}`;
  await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE aggregate_type = 'TEAM_MATCH' AND aggregate_id = ${ctx.teamMatchId}`;
  try {
    await prisma.v1GameResultRevision.deleteMany({ where: { gameId: ctx.gameId } });
    await prisma.v1Game.deleteMany({ where: { id: ctx.gameId } });
    await prisma.v1TeamMatchApplication.deleteMany({ where: { teamMatchId: ctx.teamMatchId } });
    await prisma.v1TeamMatch.delete({ where: { id: ctx.teamMatchId } });
    await prisma.v1League.delete({ where: { id: ctx.leagueId } }).catch(() => undefined);
    // v1_admin_users는 v1_users FK가 Cascade라 유저 삭제로 함께 정리된다.
    await prisma.v1User.deleteMany({ where: { id: { in: [ctx.creatorAdminUserId] } } }).catch(() => undefined);
  } catch {
    // OFFICIAL 리비전은 "terminal result revisions are immutable" DB 트리거로 삭제 자체가
    // 막힌다(officialResult 시나리오). 이 파일은 격리된 per-file DB clone에서 도니까
    // 남는 행 자체는 무해하지만, creatorAdminUserId는 active ops admin이라 그대로 두면
    // 이후 테스트의 "전체 active owner/ops" 조회에 계속 걸려 수신자 목록을 오염시킨다 —
    // 삭제 대신 revoke해서 더 이상 수신 대상이 되지 않게 한다.
    await prisma.v1AdminUser
      .update({ where: { userId: ctx.creatorAdminUserId }, data: { status: 'revoked', revokedAt: new Date() } })
      .catch(() => undefined);
  }
}

/** owner/ops(active) 는 수신, support·suspended·revoked·계정비활성 ops는 제외되는 것을 검증하기 위한 admin 세트. */
async function seedAdminRoster(suiteId: string) {
  const activeOwnerId = `t-lrer-admin-owner-${suiteId}`;
  const activeOpsId = `t-lrer-admin-ops-${suiteId}`;
  const supportId = `t-lrer-admin-support-${suiteId}`;
  const suspendedOpsId = `t-lrer-admin-suspended-${suiteId}`;
  const revokedOpsId = `t-lrer-admin-revoked-${suiteId}`;
  const inactiveAccountOpsId = `t-lrer-admin-inactive-${suiteId}`;
  const allIds = [activeOwnerId, activeOpsId, supportId, suspendedOpsId, revokedOpsId, inactiveAccountOpsId];
  await prisma.v1User.createMany({
    data: allIds.map((id) => ({ id, email: `${id}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' })),
  });
  await prisma.v1User.update({ where: { id: inactiveAccountOpsId }, data: { accountStatus: 'suspended' } });
  await prisma.v1AdminUser.createMany({
    data: [
      { userId: activeOwnerId, adminRole: 'owner', status: 'active' },
      { userId: activeOpsId, adminRole: 'ops', status: 'active' },
      { userId: supportId, adminRole: 'support', status: 'active' },
      { userId: suspendedOpsId, adminRole: 'ops', status: 'suspended' },
      { userId: revokedOpsId, adminRole: 'ops', status: 'active', revokedAt: new Date() },
      { userId: inactiveAccountOpsId, adminRole: 'ops', status: 'active' },
    ],
  });
  return { activeOwnerId, activeOpsId, supportId, suspendedOpsId, revokedOpsId, inactiveAccountOpsId, allIds };
}

async function cleanupAdminRoster(roster: Awaited<ReturnType<typeof seedAdminRoster>>) {
  await prisma.v1User.deleteMany({ where: { id: { in: roster.allIds } } });
}

async function recipientsFor(teamMatchId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ recipientUserId: string }>>`
    SELECT recipient_user_id AS "recipientUserId" FROM v1_notifications
    WHERE business_key LIKE ${`league-result-entry-reminder:${teamMatchId}:recipient:%`}
  `;
  return rows.map((r) => r.recipientUserId);
}

describe('LeagueResultEntryReminderService — 리그 결과 미입력 24시간 리마인더', () => {
  afterAll(async () => prisma.$disconnect());

  it('결과 미입력(not_entered) 대진은 active owner/ops 전원에게 알리고, support·정지·해촉·계정비활성 admin은 제외한다', async () => {
    const service = new LeagueResultEntryReminderService();
    const ctx = await seedFixture();
    const suiteId = randomUUID().slice(0, 8);
    const roster = await seedAdminRoster(suiteId);
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: ctx.startAt.toISOString() } } as never, tx);
      });

      const recipients = (await recipientsFor(ctx.teamMatchId)).filter((id) => roster.allIds.includes(id) || id === ctx.creatorAdminUserId);
      expect(recipients.sort()).toEqual([ctx.creatorAdminUserId, roster.activeOwnerId, roster.activeOpsId].sort());

      const row = await prisma.$queryRaw<Array<{ deepLink: string; title: string }>>`
        SELECT deep_link AS "deepLink", title FROM v1_notifications
        WHERE business_key = ${`league-result-entry-reminder:${ctx.teamMatchId}:recipient:${roster.activeOpsId}`}
      `;
      expect(row).toHaveLength(1);
      expect(row[0].deepLink).toBe(`/admin/league-matches/${ctx.leagueId}`);
      expect(row[0].title).toBe('리그 경기 결과가 아직 입력되지 않았어요');
    } finally {
      await cleanupAdminRoster(roster);
      await cleanupFixture(ctx);
    }
  });

  it('공식 결과가 이미 확정된 대진은 알리지 않는다', async () => {
    const service = new LeagueResultEntryReminderService();
    const ctx = await seedFixture({ officialResult: true });
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: ctx.startAt.toISOString() } } as never, tx);
      });
      expect(await recipientsFor(ctx.teamMatchId)).toHaveLength(0);
    } finally {
      await cleanupFixture(ctx);
    }
  });

  it('취소된 대진은 결과가 미입력이어도 알리지 않는다', async () => {
    const service = new LeagueResultEntryReminderService();
    const ctx = await seedFixture({ status: 'cancelled' });
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: ctx.startAt.toISOString() } } as never, tx);
      });
      // creatorAdminUserId(ops, active)가 이미 있으므로 "받을 사람이 없어서"가 아니라
      // 취소 가드 자체가 no-op 시켰음을 확인한다.
      expect(await recipientsFor(ctx.teamMatchId)).toHaveLength(0);
    } finally {
      await cleanupFixture(ctx);
    }
  });

  it('시작 시각을 바꾸면(updateFixture) 리마인더가 새 세대로 재스케줄되고, 옛 세대는 스스로 no-op 한다', async () => {
    const service = new LeagueResultEntryReminderService();
    const ctx = await seedFixture();
    const adminContext = new AdminContextService(prisma);
    // updateFixture()는 this.games/this.notifications를 전혀 쓰지 않는다 — 실제 타입 대신
    // 빈 스텁을 넣어 무거운 DI 그래프 구성 없이 실제 프로덕션 메서드를 그대로 호출한다.
    const leagueAdmin = new LeagueMatchAdminService(prisma, adminContext, {} as GamesService, {} as NotificationsService);
    const actor: V1AuthUser = { id: ctx.creatorAdminUserId, email: null, accountStatus: 'active', onboardingStatus: 'completed' };

    try {
      // 대진 생성 시점에 이미 스케줄된 것으로 간주 — 첫 세대(원래 startAt) 리마인더.
      await prisma.$transaction((tx) => scheduleLeagueResultEntryReminder(tx, { teamMatchId: ctx.teamMatchId, startAt: ctx.startAt }));

      const newStartAt = new Date(ctx.startAt.getTime() + 3 * 60 * 60 * 1_000); // 3시간 뒤로 변경
      const updated = await leagueAdmin.updateFixture(actor, ctx.leagueId, ctx.teamMatchId, {
        startsAt: newStartAt.toISOString(),
      } as UpdateLeagueFixtureDto);
      expect(updated.startAt.toISOString()).toBe(newStartAt.toISOString());

      const outboxRows = await prisma.$queryRaw<Array<{ businessKey: string; availableAt: Date }>>`
        SELECT business_key AS "businessKey", available_at AS "availableAt" FROM v1_outbox_events
        WHERE aggregate_type = 'TEAM_MATCH' AND aggregate_id = ${ctx.teamMatchId}
        ORDER BY available_at ASC
      `;
      expect(outboxRows).toHaveLength(2);
      const [oldGen, newGen] = outboxRows;
      expect(oldGen.businessKey).toBe(`league-result-entry-reminder:${ctx.teamMatchId}:${ctx.startAt.toISOString()}`);
      expect(newGen.businessKey).toBe(`league-result-entry-reminder:${ctx.teamMatchId}:${newStartAt.toISOString()}`);
      expect(Math.abs(newGen.availableAt.getTime() - oldGen.availableAt.getTime() - 3 * 60 * 60 * 1_000)).toBeLessThan(1_000);

      // 옛 세대가 발화하면(예: 재시도로 뒤늦게 처리) 이미 시작 시각이 바뀌었으니 no-op.
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: ctx.startAt.toISOString() } } as never, tx);
      });
      expect(await recipientsFor(ctx.teamMatchId)).toHaveLength(0);

      // 새 세대가 발화하면 현재 startAt과 일치하므로 정상적으로 알린다.
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: newStartAt.toISOString() } } as never, tx);
      });
      expect(await recipientsFor(ctx.teamMatchId)).toEqual([ctx.creatorAdminUserId]);
    } finally {
      await cleanupFixture(ctx);
    }
  });
});
