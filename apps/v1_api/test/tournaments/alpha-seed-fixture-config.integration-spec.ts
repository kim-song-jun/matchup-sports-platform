import {
  V1TournamentFixtureStatus,
  V1TournamentRegistrationStatus,
  V1TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createCompetitionData } from '../../prisma/seed-alpha-tournament-qa';
import {
  FUTSAL_COMPETITION_CONFIG_ID,
  runCompetitionConfigContractPhaseBackfill,
} from '../../src/tournaments/competition-config/competition-config-backfill';
import { runFixtureGameBackfill } from '../../src/games/migration/fixture-game-backfill';

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
 * 두 번째 케이스가 핵심이다: 첫 케이스만 있으면 "필드가 채워졌다"는 것만 보고 **그래서 공개
 * 일정이 실제로 채워지는가**는 검증하지 못한다.
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
      );
    });

    const fixtures = await prisma.v1TournamentFixture.findMany({
      where: { tournamentId: ids.tournament },
      select: { id: true, competitionConfigVersionId: true },
    });

    expect(fixtures.length).toBeGreaterThan(0);
    const missing = fixtures.filter((fixture) => fixture.competitionConfigVersionId === null);
    expect(missing).toEqual([]);
    for (const fixture of fixtures) {
      expect(fixture.competitionConfigVersionId).toBe(FUTSAL_COMPETITION_CONFIG_ID);
    }
  });

  it('그 결과 fixture-game 백필이 하나도 격리하지 않고 실제로 V1Game 을 만든다 — 공개 일정이 비지 않는 이유', async () => {
    // `completed` 픽스처의 Game 생성은 이 백필의 몫이 아니다 — Task 10
    // (`game-result-backfill`)이 소유하고, 이 백필은 이미 있는 Game 에 period/policy 만
    // 보강한다. 그러니 기대치는 "완료되지 않은 픽스처 수" 다.
    const backfillOwnedCount = await prisma.v1TournamentFixture.count({
      where: {
        tournamentId: ids.tournament,
        status: { not: V1TournamentFixtureStatus.completed },
      },
    });
    expect(backfillOwnedCount).toBeGreaterThan(0);

    const result = await runFixtureGameBackfill(prisma, { mode: 'apply' });

    // 이 대회의 픽스처가 CONFIG_MISSING 으로 격리되면 안 된다 (수정 전의 실제 증상).
    const quarantinedHere = result.quarantine.filter((entry) => entry.reason === 'CONFIG_MISSING');
    expect(quarantinedHere).toEqual([]);
    expect(result.counts.gamesCreated).toBeGreaterThan(0);

    const gamesForTournament = await prisma.v1Game.count({
      where: { tournamentFixture: { tournamentId: ids.tournament } },
    });
    expect(gamesForTournament).toBe(backfillOwnedCount);
  });
});
