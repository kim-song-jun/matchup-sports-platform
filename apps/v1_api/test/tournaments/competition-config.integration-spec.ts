import { AdminContextService } from '../../src/common/admin-context.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import {
  competitionConfigContentHash,
  FOOTBALL_V1_CONFIG,
  FUTSAL_V1_CONFIG,
  validateCompetitionConfig,
} from '../../src/tournaments/competition-config/competition-config';
import {
  baselineStandingExpectation,
  competitionConfigFixture,
  deterministicStandingOrder,
  exerciseCompetitionConfigChange,
  seedCompetitionConfigFixture,
} from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const adminContext = new AdminContextService(prisma);
const bracketService = new TournamentBracketService(prisma, adminContext);

const authUser = {
  id: competitionConfigFixture.adminUserId,
  email: 'task11-admin@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

function writeInvalidCompetitionConfig(section: 'lineup' | 'result' | 'tieBreak') {
  const invalid = {
    lineup: { minPlayers: 12, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: 3 },
    result: { tournamentScorerPolicy: 'invented', teamMatchScorerPolicy: 'optional_with_warning',
      mvpMin: 0, mvpMax: 1 },
    tieBreak: { points: { win: 3, draw: 1, loss: 0 }, order: ['points'], seededDraw: 'sha256-v1' },
  };
  return prisma.v1CompetitionConfigVersion.create({
    data: {
      sportCode: 'football', name: `invalid-${section}`, version: 1,
      periods: FOOTBALL_V1_CONFIG.periods, events: FOOTBALL_V1_CONFIG.events,
      lineup: FOOTBALL_V1_CONFIG.lineup, result: FOOTBALL_V1_CONFIG.result,
      tieBreak: FOOTBALL_V1_CONFIG.tieBreak, visibility: FOOTBALL_V1_CONFIG.visibility,
      contentHash: `invalid-${section}`, [section]: invalid[section],
    },
  });
}

function assertCompetitionConfigSourceSupported(sourceType: 'team_match' | 'tournament') {
  return prisma.$queryRaw`
    SELECT v1_assert_competition_config_source_supported(
      ${sourceType}, ${competitionConfigFixture.tournamentId}, ${'basketball'}
    )
  `;
}

describe('Task 11 competition configuration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 11 integration verification');
    }
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, authUser);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PIN: preserves the current points, goal-difference, goals-for standings contract', async () => {
    await bracketService.recalculateStandings(authUser, competitionConfigFixture.tournamentId);
    const standings = await prisma.v1TournamentStanding.findMany({
      where: { groupId: competitionConfigFixture.groupId },
      orderBy: { position: 'asc' },
    });

    expect(
      standings.map((standing) => ({
        registrationIndex: competitionConfigFixture.registrationIds.findIndex(
          (registrationId) => registrationId === standing.registrationId,
        ),
        points: standing.points,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        position: standing.position,
      })),
    ).toEqual(baselineStandingExpectation);
  });

  it('PIN: preserves ordinary TeamMatch creation fields without requiring a caller-supplied config', async () => {
    const created = await prisma.v1TeamMatch.create({
      data: {
        id: competitionConfigFixture.teamMatchId,
        hostTeamId: competitionConfigFixture.teamIds[0],
        createdByUserId: competitionConfigFixture.adminUserId,
        sportId: competitionConfigFixture.soccerSportId,
        regionId: competitionConfigFixture.regionId,
        title: 'Task 11 ordinary match',
        placeName: 'Task 11 venue',
        startAt: competitionConfigFixture.now,
        status: 'recruiting',
      },
    });

    expect({
      id: created.id,
      sportId: created.sportId,
      title: created.title,
      status: created.status,
      competitionConfigVersionId: created.competitionConfigVersionId,
    }).toEqual({
      id: competitionConfigFixture.teamMatchId,
      sportId: competitionConfigFixture.soccerSportId,
      title: 'Task 11 ordinary match',
      status: 'recruiting',
      competitionConfigVersionId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('persists immutable football and futsal v1 presets with deterministic content hashes', async () => {
    expect(validateCompetitionConfig(FOOTBALL_V1_CONFIG)).toEqual(FOOTBALL_V1_CONFIG);
    expect(validateCompetitionConfig(FUTSAL_V1_CONFIG)).toEqual(FUTSAL_V1_CONFIG);

    const presets = await prisma.v1CompetitionConfigVersion.findMany({
      where: { name: { in: ['football-v1', 'futsal-v1'] } },
      orderBy: { sportCode: 'asc' },
    });
    expect(
      presets.map((preset) => ({
        sportCode: preset.sportCode,
        name: preset.name,
        version: preset.version,
        contentHash: preset.contentHash,
      })),
    ).toEqual([
      {
        sportCode: 'football',
        name: 'football-v1',
        version: 1,
        contentHash: competitionConfigContentHash(FOOTBALL_V1_CONFIG),
      },
      {
        sportCode: 'futsal',
        name: 'futsal-v1',
        version: 1,
        contentHash: competitionConfigContentHash(FUTSAL_V1_CONFIG),
      },
    ]);
  });

  it('uses the frozen deterministic tie-break sequence instead of registration insertion order', () => {
    expect(deterministicStandingOrder()).toEqual([
      competitionConfigFixture.registrationIds[2],
      competitionConfigFixture.registrationIds[1],
      competitionConfigFixture.registrationIds[0],
    ]);
  });

  it('rejects invalid config documents with a named database error', async () => {
    await expect(
      prisma.v1CompetitionConfigVersion.create({
        data: {
          sportCode: 'football',
          name: 'invalid-task11-config',
          version: 1,
          periods: [],
          events: ['GOAL'],
          lineup: FOOTBALL_V1_CONFIG.lineup,
          result: FOOTBALL_V1_CONFIG.result,
          tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
          visibility: FOOTBALL_V1_CONFIG.visibility,
          contentHash: 'invalid-task11-config-hash',
        },
      }),
    ).rejects.toThrow('COMPETITION_CONFIG_INVALID');
  });

  it('rejects invalid lineup configuration', async () => {
    await expect(writeInvalidCompetitionConfig('lineup')).rejects.toThrow(
      'COMPETITION_CONFIG_INVALID',
    );
  });

  it('rejects invalid tie-break configuration', async () => {
    await expect(writeInvalidCompetitionConfig('tieBreak')).rejects.toThrow(
      'COMPETITION_CONFIG_INVALID',
    );
  });

  it('rejects invalid scorer configuration', async () => {
    await expect(writeInvalidCompetitionConfig('result')).rejects.toThrow(
      'COMPETITION_CONFIG_INVALID',
    );
  });

  it('rejects tournament source backfill failure', async () => {
    await expect(assertCompetitionConfigSourceSupported('tournament')).rejects.toThrow(
      'COMPETITION_CONFIG_SOURCE_UNSUPPORTED',
    );
  });

  it('rejects TeamMatch source backfill failure', async () => {
    await expect(assertCompetitionConfigSourceSupported('team_match')).rejects.toThrow(
      'COMPETITION_CONFIG_SOURCE_UNSUPPORTED',
    );
  });

  it('rejects unsupported sport writes instead of inferring a fallback preset', async () => {
    await expect(
      prisma.$queryRaw`SELECT v1_competition_config_for_sport(NULL)`,
    ).rejects.toThrow('COMPETITION_CONFIG_SPORT_REQUIRED');

    const unsupportedSportId = '00000000-0000-4000-8000-000000000099';
    const unsupportedTeamId = '00000000-0000-4000-8000-000000000098';
    await prisma.v1Sport.create({
      data: { id: unsupportedSportId, code: 'basketball', name: '농구', sortOrder: 99 },
    });
    await prisma.v1Team.create({
      data: {
        id: unsupportedTeamId,
        ownerUserId: competitionConfigFixture.adminUserId,
        sportId: unsupportedSportId,
        regionId: competitionConfigFixture.regionId,
        name: 'Task 11 unsupported team',
      },
    });

    await expect(
      prisma.v1TeamMatch.create({
        data: {
          hostTeamId: unsupportedTeamId,
          createdByUserId: competitionConfigFixture.adminUserId,
          sportId: unsupportedSportId,
          regionId: competitionConfigFixture.regionId,
          title: 'Unsupported sport match',
          placeName: 'Task 11 venue',
          startAt: competitionConfigFixture.now,
        },
      }),
    ).rejects.toThrow('COMPETITION_CONFIG_SPORT_UNSUPPORTED');
  });

  it('blocks update and delete of a version already pinned by a persisted source', async () => {
    await expect(
      prisma.v1CompetitionConfigVersion.update({
        where: { id: '11111111-1111-4111-8111-111111111111' },
        data: { status: 'RETIRED' },
      }),
    ).rejects.toThrow('COMPETITION_CONFIG_VERSION_IN_USE');
    await expect(
      prisma.v1CompetitionConfigVersion.delete({
        where: { id: '11111111-1111-4111-8111-111111111111' },
      }),
    ).rejects.toThrow('COMPETITION_CONFIG_VERSION_IN_USE');
  });

  it('creates a new version and requires impact confirmation before config-driven recalculation', async () => {
    const result = await exerciseCompetitionConfigChange(prisma, bracketService, authUser);
    expect(result.createdVersion).toBe(2);
    expect(result.preview).toMatchObject({
      changed: false,
      confirmationRequired: true,
      requestedCompetitionConfigVersionId: result.changed.currentCompetitionConfigVersionId,
      impact: { completedFixtureCount: 3, requiresRecalculation: true },
    });
    expect(result.pinnedBeforeConfirmation).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.changed).toMatchObject({
      changed: true,
      confirmationRequired: false,
      currentCompetitionConfigVersionId: result.preview.requestedCompetitionConfigVersionId,
    });
    expect(result.topPoints).toEqual([5, 5]);
  });
});
