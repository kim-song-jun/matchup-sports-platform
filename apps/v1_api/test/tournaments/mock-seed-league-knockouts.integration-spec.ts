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
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'mock-seed-lk@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const admins = new AdminContextService(prisma);
const staffAccess = new TournamentStaffAccessService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), staffAccess);
const multiFinals = new MultiFinalsService(prisma, admins, games, new BracketTemplateService(prisma, admins, games));
const service = new MockTournamentSeedService(
  prisma, admins, games, new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService()), multiFinals,
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
    await seedTestTeams(8);
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
});
