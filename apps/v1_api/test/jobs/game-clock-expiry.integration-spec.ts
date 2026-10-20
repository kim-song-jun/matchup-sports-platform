import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchRecordService } from '../../src/team-matches/team-match-record.service';
import {
  CLOCK_EXPIRY_PERIOD_MS,
  clockExpirySnapshot,
  createClockExpiryGame,
  prepareFriendlyClockRoster,
  seedClockExpiryFixture,
} from '../fixtures/game-clock-expiry.fixture';

/** #142: consume the production worker; the spec registers no handler or replacement expiry logic. */
describe('MD-QA #142 real worker game clock expiry', () => {
  const prisma = new PrismaService();
  let fixture: Awaited<ReturnType<typeof seedClockExpiryFixture>>;
  // Each case owns its game IDs; closing those fixtures prevents a failed RED from leaking into a later case.
  let caseGameIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for game clock expiry integration');
    await prisma.$connect();
    fixture = await seedClockExpiryFixture(prisma);
  });
  afterEach(async () => {
    await prisma.v1Game.updateMany({ where: { id: { in: caseGameIds } }, data: { state: 'CANCELLED' } });
    caseGameIds = [];
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function game(input: Parameters<typeof createClockExpiryGame>[1]) {
    const gameId = await createClockExpiryGame(fixture, input);
    caseGameIds.push(gameId);
    return gameId;
  }
  async function workerCycle() {
    const worker = new V1GameOperationsWorkerService(prisma);
    try {
      return await worker.processOne();
    } finally {
      await worker.shutdown();
    }
  }
  async function assertFirstPeriodEndedOnce(gameId: string) {
    const snapshot = await clockExpirySnapshot(prisma, gameId);
    expect(snapshot.game).toEqual({ state: 'LIVE', version: 2, currentOfficialRevisionId: null, lastSequence: 0 });
    expect(snapshot.periods).toHaveLength(2);
    expect(snapshot.periods[0]).toMatchObject({ number: 1, state: 'ENDED' });
    expect(snapshot.periods[0].endedAt).toBeInstanceOf(Date);
    expect(snapshot.periods[1]).toMatchObject({ number: 2, state: 'HALFTIME', startedAt: null, endedAt: null });
    expect(snapshot.endPeriodAudits).toHaveLength(1);
    expect(snapshot.revisions).toEqual([]);
    return snapshot;
  }

  it('closes an expired first period through the worker while the scheduled end remains in the future', async () => {
    // Given: authoritative play time has elapsed; the schedule is a different clock.
    const gameId = await game({ startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 60_000) });
    // When: a restarted production worker consumes one cycle without an operator/browser.
    await workerCycle();
    // Then: persisted halftime, exactly one version/audit, and no result submission or official result.
    const snapshot = await assertFirstPeriodEndedOnce(gameId);
    expect(snapshot.endPeriodAudits[0]).toMatchObject({ actorType: 'SYSTEM', actorUserId: null });
  });

  it('expires after accumulated completed pauses are subtracted exactly once', async () => {
    // Given: 55 wall-clock minutes minus 8 paused minutes exceeds the 45-minute configured period.
    const gameId = await game({
      startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 10 * 60_000),
      pausedTotalMs: 8 * 60_000,
    });
    // When:
    await workerCycle();
    // Then:
    await assertFirstPeriodEndedOnce(gameId);
  });

  it('preserves a live period whose play time is still below its configured duration', async () => {
    // Given:
    const gameId = await game({ startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS + 5 * 60_000) });
    const before = await clockExpirySnapshot(prisma, gameId);
    // When:
    await workerCycle();
    // Then:
    expect(await clockExpirySnapshot(prisma, gameId)).toEqual(before);
  });

  it('does not count accumulated paused time as play time', async () => {
    // Given: wall time exceeds duration, but 2 paused minutes leave 44 played minutes.
    const gameId = await game({
      startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 60_000),
      pausedTotalMs: 2 * 60_000,
    });
    const before = await clockExpirySnapshot(prisma, gameId);
    // When:
    await workerCycle();
    // Then:
    expect(await clockExpirySnapshot(prisma, gameId)).toEqual(before);
  });

  it('freezes the currently open pause instead of expiring from wall-clock time', async () => {
    // Given: the ongoing pause began before the play-time limit.
    const startedAt = new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 10 * 60_000);
    const gameId = await game({
      gameState: 'PAUSED', startedAt, pausedTotalMs: 2 * 60_000,
      pausedAt: new Date(startedAt.getTime() + CLOCK_EXPIRY_PERIOD_MS),
    });
    const before = await clockExpirySnapshot(prisma, gameId);
    // When:
    await workerCycle();
    // Then:
    expect(await clockExpirySnapshot(prisma, gameId)).toEqual(before);
  });

  it('does not close a scheduled game merely because its scheduled endAt has passed', async () => {
    // Given:
    const gameId = await game({
      gameState: 'SCHEDULED', startedAt: null, scheduledEndAt: new Date(Date.now() - 60_000),
    });
    const before = await clockExpirySnapshot(prisma, gameId);
    // When:
    await workerCycle();
    // Then:
    expect(await clockExpirySnapshot(prisma, gameId)).toEqual(before);
  });

  it('does not close a newly started live period merely because scheduled endAt has passed', async () => {
    // Given:
    const gameId = await game({
      startedAt: new Date(Date.now() - 5 * 60_000), scheduledEndAt: new Date(Date.now() - 60_000),
    });
    const before = await clockExpirySnapshot(prisma, gameId);
    // When:
    await workerCycle();
    // Then:
    expect(await clockExpirySnapshot(prisma, gameId)).toEqual(before);
  });

  it('preserves an already ended game including its recorded endedAt and version', async () => {
    // Given:
    const gameId = await game({ gameState: 'ENDED', startedAt: new Date(Date.now() - 2 * CLOCK_EXPIRY_PERIOD_MS) });
    const before = await clockExpirySnapshot(prisma, gameId);
    // When:
    await workerCycle();
    // Then:
    expect(await clockExpirySnapshot(prisma, gameId)).toEqual(before);
  });

  it('lets two real worker replicas commit the expired period once and survive a restarted third replica', async () => {
    // Given:
    const gameId = await game({ startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 60_000) });
    // When:
    await Promise.all([workerCycle(), workerCycle()]);
    await workerCycle();
    // Then:
    await assertFirstPeriodEndedOnce(gameId);
  });

  it('serializes an operator end-period racing the real expiry worker into one persisted transition', async () => {
    // Given: the authorized operator uses the actual service/takeover boundary.
    const gameId = await game({ startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 60_000) });
    const { takeoverToken } = await fixture.service.requestTakeover(fixture.authUser, gameId, {
      clientInstanceId: `clock-expiry-operator-${randomUUID()}`, lastSequence: 0,
    });
    const commandId = `clock-expiry-manual-${randomUUID()}`;
    // When:
    const [manual, worker] = await Promise.allSettled([
      fixture.service.executeCommand(fixture.authUser, gameId, 'end-period', commandId, {
        expectedVersion: 1, clientCommandId: commandId, takeoverToken,
        occurredAt: new Date().toISOString(), payload: {},
      }),
      workerCycle(),
    ]);
    // Then: either writer may win; a real command conflict is allowed, an unexpected failure is not.
    expect(worker.status).toBe('fulfilled');
    if (manual.status === 'rejected') {
      if (!(manual.reason instanceof HttpException)) throw manual.reason;
      expect(manual.reason.getStatus()).toBe(409);
      expect(manual.reason.getResponse()).toEqual(expect.objectContaining({
        code: expect.stringMatching(/^(VERSION_CONFLICT|COMMAND_CONCURRENCY_CONFLICT|PERIOD_NOT_STARTED)$/),
      }));
    }
    await assertFirstPeriodEndedOnce(gameId);
  });

  it('expires the real friendly start → shared-record path without manufacturing either team confirmation', async () => {
    const gameId = await game({ friendly: true, gameState: 'SCHEDULED', startedAt: null });
    const { homeSideId } = await prepareFriendlyClockRoster(fixture, gameId);
    const commandId = randomUUID();
    await fixture.service.executeCommand(fixture.authUser, gameId, 'start', commandId, {
      expectedVersion: 0, clientCommandId: commandId, takeoverToken: commandId,
      occurredAt: new Date().toISOString(), payload: {},
    });
    const ownedGame = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { teamMatchId: true } });
    if (ownedGame.teamMatchId === null) throw new Error('Clock fixture requires canonical TeamMatch ownership');
    await new TeamMatchRecordService(prisma).mutate(fixture.authUser, ownedGame.teamMatchId, {
      action: 'add', commandId: randomUUID(), expectedVersion: 0, sideId: homeSideId, minute: 1,
    });
    // Simulate elapsed real play after those production consumers have produced the hybrid state.
    await prisma.v1GamePeriod.updateMany({
      where: { gameId, number: 1 }, data: { startedAt: new Date(Date.now() - CLOCK_EXPIRY_PERIOD_MS - 60_000) },
    });
    const before = await clockExpirySnapshot(prisma, gameId);
    const record = await prisma.v1TeamMatchRecord.findUniqueOrThrow({ where: { gameId } });
    expect(before.periods[0].state).toBe('LIVE');
    expect(record.confirmations).toEqual([]);

    await workerCycle();

    const after = await clockExpirySnapshot(prisma, gameId);
    expect(after.periods[0]).toMatchObject({ state: 'ENDED', endedAt: expect.any(Date) });
    expect(after.game).toMatchObject({ state: 'LIVE', version: before.game.version + 1, currentOfficialRevisionId: null });
    expect(after.endPeriodAudits).toHaveLength(1);
    expect(after.revisions).toEqual([]);
    expect(await prisma.v1TeamMatchRecord.findUniqueOrThrow({ where: { gameId } })).toEqual(record);
  });
});
