import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { MockTournamentSeedService } from '../../src/tournaments/mock-seed/mock-tournament-seed.service';
import { MultiFinalsService } from '../../src/tournaments/multi-finals/multi-finals.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { StagePlanService } from '../../src/tournaments/stages/stage-plan.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'mock-seed-lk@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const admins = new AdminContextService(prisma);
const staffAccess = new TournamentStaffAccessService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), staffAccess);
const multiFinals = new MultiFinalsService(prisma, admins, games, new BracketTemplateService(prisma, admins, games));
const service = new MockTournamentSeedService(
  prisma, admins, games, new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService()), multiFinals,
  new StagePlanService(prisma, admins, new BracketTemplateService(prisma, admins, games), games),
);

/** 목업이 고르는 '전원 테스트 계정' 팀 — 팀장 1명 + 팀원 7명. */
async function seedTestTeams(count: number) {
  for (let t = 0; t < count; t += 1) {
    const userIds: string[] = [];
    for (let m = 0; m < 8; m += 1) {
      const row = await prisma.v1User.create({ data: { email: `lk-${t}-${m}@teameet.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
      userIds.push(row.id);
    }
    await prisma.v1Team.create({
      data: {
        ownerUserId: userIds[0], sportId: ids.futsalSportId, regionId: ids.regionId, name: `목업 팀 ${t + 1}`, memberCount: 8,
        memberships: { create: userIds.map((userId, m) => ({ userId, role: m === 0 ? 'owner' as const : 'member' as const })) },
      },
    });
  }
}

describe('목업 대회 — 정규리그+N개 토너먼트 (실제 DB)', () => {
  const originalFlag = process.env.V1_ENABLE_MOCK_SEED;
  beforeAll(async () => {
    process.env.V1_ENABLE_MOCK_SEED = 'true';
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    await seedTestTeams(20);
  });
  afterAll(async () => { process.env.V1_ENABLE_MOCK_SEED = originalFlag; await prisma.$disconnect(); });

  it('예선 조 편성 → 공식 결과 → 상위·하위 토너먼트 대진까지 실제 경로로 만든다', async () => {
    const result = await service.createTournament(user, { format: 'league_knockouts', teamCount: 8, status: 'in_progress', withResults: true });

    const tournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: result.tournamentId }, select: { format: true, multiFinals: true } });
    expect(tournament.format).toBe('league_knockouts');
    const groups = await prisma.v1TournamentGroup.findMany({ where: { tournamentId: result.tournamentId }, select: { name: true, phase: true, bracketTrack: true }, orderBy: { sortOrder: 'asc' } });
    expect(groups.filter((g) => g.phase === 'group').map((g) => g.name)).toEqual(['A조', 'B조']);
    expect(new Set(groups.filter((g) => g.phase !== 'group').map((g) => g.bracketTrack))).toEqual(new Set(['상위 토너먼트', '하위 토너먼트']));

    // 예선 12경기는 모두 공식 결과, 결선(각 4팀 → 3경기씩)은 아직 시작 전.
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({
      where: { tournamentId: result.tournamentId, teamMatch: { deletedAt: null } },
      select: { group: { select: { phase: true } }, teamMatch: { select: { game: { select: { currentOfficialRevisionId: true } } } } },
    });
    const preliminary = fixtures.filter((f) => f.group?.phase === 'group');
    expect(preliminary).toHaveLength(12);
    expect(preliminary.every((f) => f.teamMatch.game?.currentOfficialRevisionId)).toBe(true);
    expect(fixtures.filter((f) => f.group?.phase !== 'group' && !f.teamMatch.game?.currentOfficialRevisionId)).toHaveLength(6);
    expect(result.fixtureCount).toBe(18);
    // 팀이 정해진 사이드(예선 12경기 + 결선 첫 판 4경기)는 명단 동기화로 제출본이 된다.
    expect(result.lineupsSubmitted).toBe(32);

    // 상위 = 각 조 1·2위, 하위 = 3·4위. 앞 순번 팀이 늘 이기므로 조 안 순서가 곧 순위다.
    const registrations = await prisma.v1TournamentRegistration.findMany({ where: { tournamentId: result.tournamentId }, select: { id: true, team: { select: { name: true } } } });
    const nameOf = new Map(registrations.map((r) => [r.id, r.team.name]));
    const finals = (tournament.multiFinals as unknown as { finals: Array<{ name: string; registrationIds: string[] }> }).finals;
    expect(finals.map((f) => [f.name, f.registrationIds.map((id) => nameOf.get(id)).sort()])).toEqual([
      ['상위 토너먼트', ['목업 팀 1', '목업 팀 2', '목업 팀 5', '목업 팀 6']],
      ['하위 토너먼트', ['목업 팀 3', '목업 팀 4', '목업 팀 7', '목업 팀 8']],
    ]);
  }, 120_000);

  it('20팀 순위별 리그 목업은 등록7명·출전설정6명·공식70경기와4개결선을 만든다', async () => {
    const result = await service.createTournament(user, { format: 'ranked_leagues', teamCount: 20, status: 'completed' });
    expect(result).toMatchObject({ teamCount: 20, fixtureCount: 70, gamesCreated: 70, status: 'completed' });
    const t = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: result.tournamentId }, include: { registrations: { include: { players: true } }, competitionConfig: true } });
    expect(t.status).toBe('completed');expect(t.minPlayers).toBe(7);expect(t.maxPlayers).toBe(7);
    expect((t.competitionConfig!.lineup as { maxPlayers: number }).maxPlayers).toBe(6);
    expect(t.registrations).toHaveLength(20);expect(t.registrations.every(r => r.players.length === 7)).toBe(true);
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: t.id }, include: { group: true, teamMatch: { include: { game: true } } } });
    expect(fixtures).toHaveLength(70);expect(fixtures.every(f => f.teamMatch.game?.currentOfficialRevisionId)).toBe(true);
    expect(fixtures.filter(f => f.group?.stageKey === 'preliminary')).toHaveLength(30);
    expect(fixtures.filter(f => f.group?.stageKey === 'main')).toHaveLength(40);
  }, 180_000);
  it('단계별 목업은 기본 예선·본선을 만들고 결과 없이 이후 구성을 편집할 수 있다', async () => {
    const result = await service.createTournament(user, { format: 'staged', teamCount: 8, status: 'in_progress' });
    expect(result).toMatchObject({ format: 'staged', teamCount: 8, fixtureCount: 15, gamesCreated: 15 });
    const tournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: result.tournamentId } });
    expect(tournament.format).toBe('league_knockouts');
    const stages = new StagePlanService(prisma, admins, new BracketTemplateService(prisma, admins, games), games);
    const view = await stages.get(user, result.tournamentId);
    if (!view.config) throw new Error('단계별 목업의 기본 구성이 저장되지 않았어요.');
    expect(view.config.autoAdvance).toBe(false);
    expect(view.pools.filter(pool => pool.stageIndex === 0).every(pool => pool.assigned && !pool.started)).toBe(true);
    expect(view.pools.filter(pool => pool.stageIndex === 1).every(pool => !pool.assigned && !pool.started)).toBe(true);
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: result.tournamentId }, include: { teamMatch: { include: { game: true } } } });
    expect(fixtures).toHaveLength(15);
    expect(fixtures.every(fixture => fixture.teamMatch.game?.state === 'SCHEDULED' && !fixture.teamMatch.game.currentOfficialRevisionId)).toBe(true);
    const updated = await stages.updateStructure(user, result.tournamentId, {
      expectedRevision: view.revision, reason: '목업 생성 후 세부 설정 검증',
      plan: { ...view.config, stages: view.config.stages.map((stage, index) => index === 0 ? { ...stage, name: '예선 리그' } : stage) },
    });
    expect(updated.config?.stages[0].name).toBe('예선 리그');
  }, 120_000);
});
