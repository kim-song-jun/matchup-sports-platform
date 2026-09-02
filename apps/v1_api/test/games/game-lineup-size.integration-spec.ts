import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * `GamesService.saveLineup` — 대회 경기 라인업 저장 경로의 회귀 스펙.
 *
 * **Task 163 이후 이 스펙이 지키는 것은 게이트가 아니라 "게이트가 없다" 는 계약이다.**
 *
 * 예전엔 저장 시 선발 인원(min~max)과 골키퍼 정확히 1명을 강제했다. 정본 §3 이 선발/후보
 * 구분 자체를 없앴으므로(명단에 있으면 뛴 것이다) 제출 시점에 셀 "선발" 이 없고,
 * **어떤 인원·골키퍼 구성이 와도 저장이 성공해야 한다.** 인원이 안 맞으면 경기는 그대로
 * 시작되고 운영 콘솔에서 조정한다.
 *
 * 이 스펙을 지우지 않고 뒤집은 이유: 게이트는 되살리기 쉽다(원래 자리에 다시 넣으면
 * 그만이다). 그때 이 스펙이 red 로 말한다. 규칙을 없앤 것이 **결정이었다는 사실**을
 * 코드가 기억하게 하는 자리다 — 되살리려면 정본 §3 의 사용자 확정부터 뒤집어야 한다.
 *
 * `minPlayers`/`maxPlayers` 를 DB 에 핀된 `futsal-v1` config 에서 런타임에 읽는 것은
 * 그대로다 — "그 수를 넘겨도 통과한다" 를 보이려면 그 수가 무엇인지 알아야 한다.
 */

const ids = {
  platformOpsUser: '6b000000-0000-4000-8000-000000000001',
  sport: '6b000000-0000-4000-8000-000000000010',
  region: '6b000000-0000-4000-8000-000000000011',
  hostTeam: '6b000000-0000-4000-8000-000000000020',
  opponentTeam: '6b000000-0000-4000-8000-000000000021',
  tournament: '6b000000-0000-4000-8000-000000000030',
  fixture: '6b000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOpsUser, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

function starters(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    displayNameSnapshot: `Lineup size participant ${index + 1}`,
    jerseyNumber: index + 1,
    ...(index === 0 ? { position: 'GOLEIRO' } : {}),
    started: true,
  }));
}

describe('GamesService.saveLineup 은 인원·골키퍼를 검증하지 않는다 (Task 163)', () => {
  let pinnedMinPlayers: number;
  let pinnedMaxPlayers: number;
  let gameId: string;
  let hostSideId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');
    }
    const lineup = config.lineup as { minPlayers: number; maxPlayers: number };
    pinnedMinPlayers = lineup.minPlayers;
    pinnedMaxPlayers = lineup.maxPlayers;

    await prisma.v1User.create({
      data: {
        id: ids.platformOpsUser,
        email: 'game-lineup-size-platform-ops@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    // platform_ops (non-support admin) can act on any tournament-fixture
    // lineup without a per-tournament staff assignment row
    // (GamesService.resolveActor's `eligibleAdmin` branch) — keeps this
    // fixture minimal, matching the "guest-only, no membership rows" spirit
    // of the sibling team-match-lineup-size spec.
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOpsUser, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Lineup size futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'GAME_LINEUP_SIZE_REGION', name: 'Lineup size region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOpsUser, sportId: ids.sport, regionId: ids.region, name: 'Lineup size host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOpsUser, sportId: ids.sport, regionId: ids.region, name: 'Lineup size opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Lineup size tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Lineup size host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Lineup size opponent' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('game-lineup-size-source', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** 매 저장이 리비전을 올리므로, 다음 저장 전에 **최신 리비전을 다시 읽는다.** */
  async function latestRevision() {
    const lineup = await prisma.v1GameLineup.findFirst({
      where: { gameId, sideId: hostSideId },
      orderBy: { revision: 'desc' },
    });
    return lineup?.revision ?? 0;
  }

  it('핀된 maxPlayers 를 넘겨도 저장된다 — 인원 상한을 막지 않는다', async () => {
    expect(pinnedMaxPlayers).toBeGreaterThan(0);

    const overCapCount = pinnedMaxPlayers + 1;
    const saved = await games.saveLineup(
      authUser(ids.platformOpsUser),
      gameId,
      hostSideId,
      'idem-game-lineup-over-cap-ok',
      {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-over-cap-ok',
        participants: starters(overCapCount),
      },
    );
    expect(saved).toEqual(expect.objectContaining({ gameId }));
    expect(await prisma.v1GameParticipant.count({ where: { lineupId: saved.lineupId } })).toBe(overCapCount);
  });

  it('골키퍼가 없어도, 둘이어도 저장된다 — 골키퍼 수를 막지 않는다', async () => {
    // 골키퍼 0명: `starters()` 가 첫 항목에 붙이는 포지션을 떼어낸다.
    const noGoalkeeper = starters(pinnedMinPlayers).map((participant) => ({
      displayNameSnapshot: participant.displayNameSnapshot,
      jerseyNumber: participant.jerseyNumber,
    }));
    const savedNone = await games.saveLineup(
      authUser(ids.platformOpsUser),
      gameId,
      hostSideId,
      'idem-game-lineup-gk-none-ok',
      {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-gk-none-ok',
        participants: noGoalkeeper,
      },
    );
    expect(savedNone).toEqual(expect.objectContaining({ gameId }));

    // 골키퍼 2명.
    const twoGoalkeepers = starters(pinnedMinPlayers).map((participant, index) =>
      index === 1 ? { ...participant, position: 'GOLEIRO' } : participant,
    );
    const savedTwo = await games.saveLineup(
      authUser(ids.platformOpsUser),
      gameId,
      hostSideId,
      'idem-game-lineup-gk-two-ok',
      {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-gk-two-ok',
        participants: twoGoalkeepers,
      },
    );
    expect(savedTwo).toEqual(expect.objectContaining({ gameId }));
  });

  it('핀된 minPlayers 미만이어도 저장된다 — 인원 하한을 막지 않는다', async () => {
    expect(pinnedMinPlayers).toBeGreaterThan(0);
    const belowMinCount = pinnedMinPlayers - 1;

    const saved = await games.saveLineup(
      authUser(ids.platformOpsUser),
      gameId,
      hostSideId,
      'idem-game-lineup-below-min-ok',
      {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-below-min-ok',
        participants: starters(belowMinCount),
      },
    );
    expect(saved).toEqual(expect.objectContaining({ gameId }));
    expect(await prisma.v1GameParticipant.count({ where: { lineupId: saved.lineupId } })).toBe(belowMinCount);
  });

  /**
   * 인원 게이트는 없앴지만 **`position` 은 여전히 검증한다** — 없앤 것과 안 없앤 것을
   * 구분하는 자리다.
   *
   * `position` 은 클라이언트가 보내는 자유 문자열이라, 마이그레이션이 정리한 후보 센티널
   * `'BENCH'` 가 다음 저장 요청으로 그대로 다시 들어올 수 있다. 그러면 마이그레이션이
   * 한 일이 조용히 되돌아간다. 'BENCH' 만 막으면 `'벤치'`·오타는 그대로 들어오므로
   * **대회 설정 카탈로그에 있는 값만** 통과시킨다.
   */
  it('폐기한 BENCH 센티널을 position 으로 보내면 400 으로 거부한다', async () => {
    const withSentinel = starters(pinnedMinPlayers).map((participant, index) =>
      index === 1 ? { ...participant, position: 'BENCH' } : participant,
    );
    await expect(
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-bench-sentinel', {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-bench-sentinel',
        participants: withSentinel,
      }),
    ).rejects.toMatchObject({ response: { code: 'LINEUP_POSITION_INVALID' } });
  });

  it('카탈로그에 없는 다른 문자열도 400 이다 — 센티널 하나만 막는 게 아니다', async () => {
    const withUnknown = starters(pinnedMinPlayers).map((participant, index) =>
      index === 1 ? { ...participant, position: '벤치' } : participant,
    );
    await expect(
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-unknown-position', {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-unknown-position',
        participants: withUnknown,
      }),
    ).rejects.toMatchObject({ response: { code: 'LINEUP_POSITION_INVALID' } });
  });

  it('카탈로그에 있는 포지션은 그대로 저장된다 (풋살 FIXO)', async () => {
    const withCatalogPosition = starters(pinnedMinPlayers).map((participant, index) =>
      index === 1 ? { ...participant, position: 'FIXO' } : participant,
    );
    const saved = await games.saveLineup(
      authUser(ids.platformOpsUser),
      gameId,
      hostSideId,
      'idem-game-lineup-catalog-position',
      {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-catalog-position',
        participants: withCatalogPosition,
      },
    );
    const rows = await prisma.v1GameParticipant.findMany({
      where: { lineupId: saved.lineupId },
      select: { position: true },
    });
    expect(rows.map((row) => row.position).sort()).toEqual(['FIXO', 'GOLEIRO', null].sort());
  });

  it('옛 클라이언트가 보낸 started 는 무시된다 — 400 이 아니라 200 이고 값은 안 쓰인다', async () => {
    const withStartedFalse = starters(pinnedMinPlayers).map((participant, index) => ({
      ...participant,
      started: index !== 0, // 첫 명단원을 '후보' 로 보내 본다
    }));
    const saved = await games.saveLineup(
      authUser(ids.platformOpsUser),
      gameId,
      hostSideId,
      'idem-game-lineup-started-ignored',
      {
        expectedVersion: await latestRevision(),
        clientCommandId: 'idem-game-lineup-started-ignored',
        participants: withStartedFalse,
      },
    );
    // 400 이 아니라 저장된다. 그리고 보낸 false 가 **행에 남지 않는다** —
    // 명단에 있으면 뛴 것이므로 저장은 언제나 true 다(정본 §3).
    const rows = await prisma.v1GameParticipant.findMany({
      where: { lineupId: saved.lineupId },
      select: { started: true },
    });
    expect(rows).toHaveLength(pinnedMinPlayers);
    expect(rows.every((row) => row.started === true)).toBe(true);
  });
});
