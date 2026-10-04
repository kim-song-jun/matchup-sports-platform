import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { competitionConfigFixture, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const service = new TournamentBracketService(prisma, new AdminContextService(prisma),
  new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService()));
const user = { id: competitionConfigFixture.adminUserId, email: 'task11-admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

describe('12강·8강 실제 저장 계약', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated round12 verification');
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('정식 단계를 저장하고 부전승을 경기와 구분해 재조회한다', async () => {
    const round12 = await service.createGroup(user, competitionConfigFixture.tournamentId, { name: '12강', phase: 'round12' });
    const quarter = await service.createGroup(user, competitionConfigFixture.tournamentId, { name: '8강', phase: 'quarter' });
    const registrationId = competitionConfigFixture.registrationIds[0];
    await service.createGroupTeam(user, competitionConfigFixture.tournamentId, { groupId: round12.id, registrationId, isBye: true });
    await service.createGroupTeam(user, competitionConfigFixture.tournamentId, { groupId: quarter.id, registrationId });
    const bracket = await service.getBracket(user, competitionConfigFixture.tournamentId);
    expect(bracket.groups.find((group) => group.id === round12.id)?.groupTeams[0].isBye).toBe(true);
    expect(bracket.groups.find((group) => group.id === quarter.id)?.groupTeams[0].isBye).toBe(false);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { groupId: round12.id } })).toBe(0);
    await expect(service.createFixture(user, competitionConfigFixture.tournamentId, { groupId: round12.id, round: '12강', fixtureNumber: 20, homeRegistrationId: registrationId }))
      .rejects.toMatchObject({ response: { code: 'BYE_TEAM_HAS_MATCH' } });
    expect(await prisma.v1TournamentMatchDetails.count({ where: { groupId: round12.id } })).toBe(0);
  });
});
