import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 경과 시간 일시정지 반영 (2026-08) — before this: `pause`/`resume` only ever
 * flipped `V1Game.state`, never touching `V1GamePeriod`, so there was no data
 * to exclude a stoppage from the elapsed-time display or `freezeCapture()`'s
 * `clockMs`. This suite proves the DB rows carry the pause bookkeeping the
 * fix relies on: `pausedAt` opens on `pause`, `resume` (and `end` while
 * paused) folds it into `pausedTotalMs` as an INCREMENT and clears
 * `pausedAt` — crucially, MULTIPLE pause/resume cycles within one period must
 * accumulate, not just remember the most recent cycle.
 */
const ids = {
  director: '66000000-0000-4000-8000-000000000001',
  sport: '66000000-0000-4000-8000-000000000010',
  region: '66000000-0000-4000-8000-000000000011',
  hostTeam: '66000000-0000-4000-8000-000000000020',
  opponentTeam: '66000000-0000-4000-8000-000000000021',
  tournament: '66000000-0000-4000-8000-000000000030',
  fixture: '66000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@pause-tracking.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('game period pause tracking — pausedTotalMs/pausedAt survive multiple pause/resume cycles', () => {
  let configId: string;
  let gameId: string;
  let takeoverToken: string;
  let version = 0;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the pause-tracking integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    configId = config.id;

    await prisma.v1User.create({
      data: {
        id: ids.director,
        email: 'pause-tracking-director@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-pause', name: 'Pause Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'PAUSE_REGION', name: 'Pause Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.director, sportId: ids.sport, regionId: ids.region, name: 'Pause Host' },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.director,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Pause Opponent',
        },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Pause tournament', competitionConfigVersionId: configId },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.director,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Pause Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Pause Opponent' },
      ],
      participants: [],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId: ids.fixture,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, 'pause-tracking-create', input)),
    );
    gameId = created.gameId;
    takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, {
        clientInstanceId: 'pause-tracking-client',
        lastSequence: 0,
      })
    ).takeoverToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function runCommand(command: 'start' | 'pause' | 'resume' | 'end') {
    const result = await service.executeCommand(authUser(ids.director), gameId, command, `pause-tracking-${command}-${version}`, {
      expectedVersion: version,
      clientCommandId: `pause-tracking-${command}-${version}`,
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = result.version;
    return result;
  }

  it('start leaves period 1 unpaused (pausedTotalMs=0, pausedAt=null)', async () => {
    await runCommand('start');
    const period = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(period.state).toBe('LIVE');
    expect(period.pausedTotalMs).toBe(0);
    expect(period.pausedAt).toBeNull();
  });

  it('pause opens a segment (pausedAt set) without touching pausedTotalMs yet', async () => {
    await runCommand('pause');
    const period = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(period.pausedAt).not.toBeNull();
    expect(period.pausedTotalMs).toBe(0);
  });

  it('resume folds the just-closed segment into pausedTotalMs and clears pausedAt', async () => {
    await sleep(30);
    await runCommand('resume');
    const period = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(period.pausedAt).toBeNull();
    expect(period.pausedTotalMs).toBeGreaterThan(0);
  });

  it('a second pause/resume cycle ADDS to pausedTotalMs — it does not overwrite the first cycle', async () => {
    const afterFirstCycle = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    const pausedTotalMsAfterFirstCycle = afterFirstCycle.pausedTotalMs;
    expect(pausedTotalMsAfterFirstCycle).toBeGreaterThan(0);

    await runCommand('pause');
    await sleep(30);
    await runCommand('resume');

    const afterSecondCycle = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(afterSecondCycle.pausedAt).toBeNull();
    // The exit proof: two real, distinct cycles accumulate — a bug that only
    // remembers the most recent cycle would leave this UNCHANGED from
    // pausedTotalMsAfterFirstCycle instead of strictly greater than it.
    expect(afterSecondCycle.pausedTotalMs).toBeGreaterThan(pausedTotalMsAfterFirstCycle);
  });

  it('ending while paused folds the still-open segment into pausedTotalMs instead of leaving pausedAt dangling', async () => {
    const beforeThirdPause = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    const pausedTotalMsBeforeThirdPause = beforeThirdPause.pausedTotalMs;

    await runCommand('pause');
    await sleep(30);
    await runCommand('end');

    const final = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(final.state).toBe('ENDED');
    expect(final.endedAt).not.toBeNull();
    // The third, still-open-at-end pause segment must ALSO be folded in —
    // otherwise this period would permanently carry a non-null pausedAt on a
    // row that can never be resumed again, and would silently undercount the
    // final pausedTotalMs by the length of that last stoppage.
    expect(final.pausedAt).toBeNull();
    expect(final.pausedTotalMs).toBeGreaterThan(pausedTotalMsBeforeThirdPause);
  });
});
