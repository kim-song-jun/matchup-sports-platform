import {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSourceType,
  V1IdentityActorType,
  V1VisibilityMode,
} from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { purgeTournamentGameAggregates } from '../../prisma/seed-alpha-tournament-qa';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';

/**
 * alpha 배포가 통째로 막힌 결함의 재현·회귀 테스트.
 *
 * `deploy/deploy-alpha.sh` 는 매 배포마다 `prisma/seed-alpha-tournament-qa.ts` 를 돌리고,
 * 그 시드는 `v1Tournament.deleteMany()` 로 QA 대회를 리셋한다. Game 도메인이 올라오기
 * 전에는 Game 행이 하나도 없어서 그냥 통과했지만, 대진표 생성/백필로 Game 이 생긴 뒤로는
 * `V1Game.tournamentFixture` 의 `onDelete: Restrict` 에 걸려
 * `Foreign key constraint violated on: v1_games_tournament_fixture_id_fkey` 로 죽는다.
 *
 * 실제로 2026-08-08 alpha 에서 #275·#276·#277·#278·#280 배포가 연속으로 이 지점에서
 * 실패했고, alpha 는 #274 릴리스에 묶였다.
 *
 * 첫 케이스는 **purge 없이는 삭제가 불가능하다는 것 자체를 단언한다** — 이게 없으면
 * 두 번째 케이스가 "원래 그냥 되는 일" 을 검증하는 공허한 테스트가 된다.
 */
const prisma = new PrismaService();

const id = (suffix: string) => `6a000000-0000-4000-8000-${suffix}`;

const ids = {
  user: id('000000000001'),
  sport: id('000000000002'),
  region: id('000000000003'),

  tournament: id('000000000010'),
  fixture: id('000000000011'),
  game: id('000000000012'),
  revision: id('000000000013'),

  otherTournament: id('000000000020'),
  otherFixture: id('000000000021'),
  otherGame: id('000000000022'),

  officialTournament: id('000000000030'),
  officialFixture: id('000000000031'),
  officialGame: id('000000000032'),
  officialRevision: id('000000000033'),
} as const;

const NOW = new Date('2026-08-08T00:00:00.000Z');

async function createTournamentWithGame(
  tournamentId: string,
  fixtureId: string,
  gameId: string,
  configId: string,
  title: string,
): Promise<void> {
  await prisma.v1Tournament.create({
    data: { id: tournamentId, sportId: ids.sport, title, competitionConfigVersionId: configId },
  });
  await prisma.v1TournamentFixture.create({
    data: { id: fixtureId, tournamentId, round: 'group', fixtureNumber: 1, competitionConfigVersionId: configId },
  });
  await prisma.v1Game.create({
    data: {
      id: gameId,
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      tournamentFixtureId: fixtureId,
      competitionConfigVersionId: configId,
    },
  });
  await prisma.v1GameVisibilityPolicy.create({
    data: { gameId, mode: V1VisibilityMode.LIVE },
  });
}

describe('alpha QA seed teardown — purgeTournamentGameAggregates', () => {
  let configId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the alpha seed teardown integration suite');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.user,
        email: 'alpha-seed-teardown@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'Teardown Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TEARDOWN_REGION', name: 'Teardown Region', level: 1 },
    });

    await runCompetitionConfigContractPhaseBackfill(prisma);
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
    });
    configId = config.id;

    await createTournamentWithGame(ids.tournament, ids.fixture, ids.game, configId, 'Teardown Target');

    // Restrict 로 게임 삭제를 막는 자식들 — 실제 alpha 데이터가 갖는 모양 그대로 채운다.
    await prisma.v1GameEvent.create({
      data: {
        gameId: ids.game,
        sequence: 1,
        clientEventId: 'teardown-event-1',
        payloadHash: 'hash-1',
        type: V1GameEventType.GOAL,
        period: 1,
        clockMs: 1000,
        occurredAt: NOW,
        actorUserId: ids.user,
        payload: { type: 'GOAL' },
      },
    });
    await prisma.v1GameResultRevision.create({
      data: {
        id: ids.revision,
        gameId: ids.game,
        revision: 1,
        // purge 가 지울 수 있는 건 non-terminal revision 뿐이다 (DB 트리거가 terminal 을 잠근다).
        state: V1GameResultRevisionState.DRAFT,
        score: { home: 1, away: 0 },
        eventsHash: 'events-hash-1',
        // v1_result_revision_actor_ck: USER 이면 user_id 가 있고 system_actor 는 null 이어야 한다.
        createdByActorType: V1IdentityActorType.USER,
        createdByUserId: ids.user,
      },
    });
    // v1_game_official_facts 는 일부러 만들지 않는다: 그 테이블의 삽입 트리거가
    // OFFICIAL revision + official_at + 양쪽 side/team 까지 요구해서, 이 테스트의 주제
    // (대회 삭제를 막는 FK 사슬)와 무관한 셋업이 비대해진다. purge 는 이 테이블도
    // 지우며(구현 참조), 여기서 검증하는 사슬은 game -> event/revision/policy 다.
    // Game -> Revision 자기참조 FK (Restrict). purge 가 이걸 먼저 끊지 않으면 revision 을 못 지운다.
    await prisma.v1Game.update({
      where: { id: ids.game },
      data: { currentOfficialRevisionId: ids.revision },
    });

    // 범위 확인용 — purge 대상이 아닌 다른 대회의 게임.
    await createTournamentWithGame(
      ids.otherTournament,
      ids.otherFixture,
      ids.otherGame,
      configId,
      'Teardown Bystander',
    );

    // 공식 결과가 확정된 대회 — DB 가 불변으로 잠근 케이스.
    await createTournamentWithGame(
      ids.officialTournament,
      ids.officialFixture,
      ids.officialGame,
      configId,
      'Teardown Official',
    );
    await prisma.v1GameResultRevision.create({
      data: {
        id: ids.officialRevision,
        gameId: ids.officialGame,
        revision: 1,
        state: V1GameResultRevisionState.OFFICIAL,
        officialAt: NOW,
        score: { home: 2, away: 2 },
        eventsHash: 'events-hash-official',
        createdByActorType: V1IdentityActorType.USER,
        createdByUserId: ids.user,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('proves the blocker is real: deleting the tournament without purging first violates the game FK', async () => {
    let caught: unknown;
    try {
      await prisma.v1Tournament.deleteMany({ where: { id: { in: [ids.tournament] } } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(String((caught as Error).message)).toContain('v1_games_tournament_fixture_id_fkey');

    // 대회는 그대로 살아 있어야 한다 (삭제가 아예 일어나지 않았음).
    await expect(
      prisma.v1Tournament.count({ where: { id: ids.tournament } }),
    ).resolves.toBe(1);
  });

  it('purges the game aggregate so the tournament delete succeeds, and leaves other tournaments alone', async () => {
    const purged = await prisma.$transaction(async (tx) =>
      purgeTournamentGameAggregates(tx, [ids.tournament]),
    );
    expect(purged).toEqual({ games: 1, fixtures: 1 });

    await prisma.v1Tournament.deleteMany({ where: { id: { in: [ids.tournament] } } });

    await expect(prisma.v1Tournament.count({ where: { id: ids.tournament } })).resolves.toBe(0);
    await expect(prisma.v1Game.count({ where: { id: ids.game } })).resolves.toBe(0);
    await expect(prisma.v1GameEvent.count({ where: { gameId: ids.game } })).resolves.toBe(0);
    await expect(prisma.v1GameResultRevision.count({ where: { gameId: ids.game } })).resolves.toBe(0);
    await expect(prisma.v1GameVisibilityPolicy.count({ where: { gameId: ids.game } })).resolves.toBe(0);

    // 범위: 다른 대회의 게임은 손대지 않는다.
    await expect(prisma.v1Game.count({ where: { id: ids.otherGame } })).resolves.toBe(1);
    await expect(prisma.v1Tournament.count({ where: { id: ids.otherTournament } })).resolves.toBe(1);
  });

  it('refuses loudly — never silently — when a tournament has an immutable official result', async () => {
    await expect(
      prisma.$transaction(async (tx) => purgeTournamentGameAggregates(tx, [ids.officialTournament])),
    ).rejects.toThrow(/공식 결과/);

    // 트랜잭션이 통째로 롤백돼 아무것도 지워지지 않아야 한다 — 부분 삭제는 최악이다.
    await expect(prisma.v1Game.count({ where: { id: ids.officialGame } })).resolves.toBe(1);
    await expect(
      prisma.v1GameResultRevision.count({ where: { id: ids.officialRevision } }),
    ).resolves.toBe(1);
    await expect(
      prisma.v1GameVisibilityPolicy.count({ where: { gameId: ids.officialGame } }),
    ).resolves.toBe(1);
  });
});
