import {
  V1TournamentRegistrationStatus,
  V1TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createCompetitionData } from '../../prisma/seed-alpha-tournament-qa';
import {
  FUTSAL_COMPETITION_CONFIG_ID,
  runCompetitionConfigContractPhaseBackfill,
} from '../../src/tournaments/competition-config/competition-config-backfill';

/**
 * alpha 배포마다 공개 대회 일정이 비어버리던 결함의 회귀 테스트.
 *
 * 끊어졌던 사슬:
 *   QA 시드가 대회를 리셋 → 새 픽스처에 `competitionConfigVersionId` 없음
 *   → `runFixtureGameBackfill` 이 그 픽스처를 `CONFIG_MISSING` 으로 격리
 *   → `V1Game` 이 안 생김 → 공개 일정이 빈 목록
 *
 * 예전에는 `competition-config-backfill` CLI 가 나중에 그 값을 채워줬다. 그러나 그 CLI 는
 * canonical config 행이 코드 상수와 다르면 `COMPETITION_CONFIG_SEED_DRIFT` 로 하드 실패하고,
 * 실제로 2026-08-09 alpha 가 그 상태였다(#277 이 lineup.positions/formations 를 추가했고 DB
 * 행은 이전 내용) — 그래서 공개 일정이 0건이었다. 값을 아는 쪽(시드)이 픽스처를 만들 때
 * 바로 넣도록 고쳤고, 이 스펙이 그 계약을 고정한다.
 *
 * Phase 3에서는 시드 자체가 TeamMatch/Details/Game을 함께 생성한다. 두 번째 케이스는
 * 별도 legacy 백필 없이 공개 조회의 실제 Game 연결과 설정이 완성되는지 검증한다.
 */
const prisma = new PrismaService();

const id = (suffix: string) => `6b000000-0000-4000-8000-${suffix}`;

const ids = {
  user: id('000000000001'),
  sport: id('000000000002'),
  region: id('000000000003'),
  tournament: id('000000000010'),
} as const;

const SCHEDULED_AT = new Date('2026-09-01T09:00:00.000Z');

describe('alpha QA seed — 픽스처에 competitionConfigVersionId 를 직접 세팅한다', () => {
  let registrations: Awaited<ReturnType<typeof createRegistrationRows>>;

  async function createRegistrationRows() {
    const rows = [];
    for (let index = 0; index < 4; index += 1) {
      const team = await prisma.v1Team.create({
        data: {
          id: id(`00000000002${index}`),
          ownerUserId: ids.user,
          sportId: ids.sport,
          regionId: ids.region,
          name: `시드 설정 검증 팀 ${index + 1}`,
        },
      });
      rows.push(
        await prisma.v1TournamentRegistration.create({
          data: {
            id: id(`00000000003${index}`),
            tournamentId: ids.tournament,
            teamId: team.id,
            appliedByUserId: ids.user,
            status: V1TournamentRegistrationStatus.confirmed,
          },
        }),
      );
    }
    return rows;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the alpha seed fixture-config integration spec');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.user,
        email: 'alpha-seed-fixture-config@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: '풋살' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'SEED_CONFIG_REGION', name: '시드 설정 검증 지역', level: 1 },
    });

    // canonical football-v1 / futsal-v1 ACTIVE 행을 만든다 (실제 배포가 하는 것과 동일).
    await runCompetitionConfigContractPhaseBackfill(prisma);

    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: '시드 설정 검증 대회',
        status: V1TournamentStatus.in_progress,
        competitionConfigVersionId: FUTSAL_COMPETITION_CONFIG_ID,
        // 공개 일정 경로가 브래킷 발행을 전제로 하므로 함께 채운다.
        bracketPublishedAt: SCHEDULED_AT,
      },
    });

    registrations = await createRegistrationRows();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('시드가 만든 모든 픽스처에 competitionConfigVersionId 가 채워진다', async () => {
    await prisma.$transaction(async (tx) => {
      await createCompetitionData(
        tx,
        {
          id: ids.tournament,
          title: '시드 설정 검증 대회',
          status: V1TournamentStatus.in_progress,
          startsInDays: 7,
          entryFee: 0,
          hasCampaign: false,
        } as Parameters<typeof createCompetitionData>[1],
        registrations,
        SCHEDULED_AT,
        FUTSAL_COMPETITION_CONFIG_ID,
        ids.sport,
      );
    });

    const fixtures = await prisma.v1TournamentMatchDetails.findMany({
      where: { tournamentId: ids.tournament },
      select: { teamMatchId: true, teamMatch: { select: { competitionConfigVersionId: true } } },
    });

    expect(fixtures.length).toBeGreaterThan(0);
    const missing = fixtures.filter((fixture) => fixture.teamMatch.competitionConfigVersionId === null);
    expect(missing).toEqual([]);
    for (const fixture of fixtures) {
      expect(fixture.teamMatch.competitionConfigVersionId).toBe(FUTSAL_COMPETITION_CONFIG_ID);
    }
  });

  it('별도 백필 없이 모든 대회 경기의 canonical Game과 설정이 실제로 연결된다', async () => {
    const fixtures = await prisma.v1TournamentMatchDetails.findMany({
      where: { tournamentId: ids.tournament },
      select: {
        teamMatchId: true,
        teamMatch: {
          select: {
            game: { select: { sourceType: true, teamMatchId: true, competitionConfigVersionId: true } },
          },
        },
      },
    });
    expect(fixtures).toHaveLength(3);
    for (const fixture of fixtures) {
      expect(fixture.teamMatch.game).toMatchObject({
        sourceType: 'TEAM_MATCH',
        teamMatchId: fixture.teamMatchId,
        competitionConfigVersionId: FUTSAL_COMPETITION_CONFIG_ID,
      });
    }
  });

  it('다시 실행해도 경기·공식 revision ID를 보존하고 경기 양쪽에 실제 팀명을 저장한다', async () => {
    const readGames = () => prisma.v1Game.findMany({
      where: { teamMatch: { tournamentId: ids.tournament } },
      orderBy: { id: 'asc' },
      select: {
        id: true, teamMatchId: true, state: true, currentOfficialRevisionId: true,
        currentOfficialRevision: { select: { score: true } },
        sides: { orderBy: { sideKey: 'asc' }, select: { teamId: true, displayNameSnapshot: true } },
      },
    });
    const before = await readGames();
    expect(before).toHaveLength(3);
    for (const game of before) {
      expect(game.sides).toHaveLength(2);
      for (const side of game.sides) expect(side.displayNameSnapshot).toMatch(/^시드 설정 검증 팀 [1-4]$/);
    }
    await prisma.$transaction((tx) => createCompetitionData(tx, {
      id: ids.tournament, title: '시드 설정 검증 대회', status: V1TournamentStatus.in_progress,
      startsInDays: 7, entryFee: 0, hasCampaign: false,
    } as Parameters<typeof createCompetitionData>[1], registrations, SCHEDULED_AT, FUTSAL_COMPETITION_CONFIG_ID, ids.sport));
    expect(await readGames()).toEqual(before);
  });
});
