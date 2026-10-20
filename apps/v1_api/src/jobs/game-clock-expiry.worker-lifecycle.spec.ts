import { Logger } from '@nestjs/common';
import { GameClockExpiryService } from './game-clock-expiry.service';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';
import { CLOCK_TEST_NOW, clockLifecycleDatabase, deferredClockGate } from './game-clock-expiry.worker-lifecycle.fixture';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('MD-QA #142 — actual clock worker lifecycle and bounded persistence', () => {
  let errors: string[];
  let expectedErrors: string[];
  beforeEach(() => {
    jest.useFakeTimers({ now: CLOCK_TEST_NOW });
    errors = []; expectedErrors = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => { errors.push(String(message)); });
  });
  afterEach(() => {
    try { expect(errors).toEqual(expectedErrors); }
    finally { jest.useRealTimers(); jest.restoreAllMocks(); }
  });

  it('waits for a pending clock transaction during shutdown before stopping further work', async () => {
    const entered = deferredClockGate();
    const release = deferredClockGate();
    const db = clockLifecycleDatabase({ onLock: async () => { entered.open(); await release.promise; } });
    const worker = new V1GameOperationsWorkerService(db.prisma);
    const processing = worker.processOne();
    await entered.promise;
    let stopped = false;
    const stopping = worker.shutdown().then(() => { stopped = true; });
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(stopped).toBe(false);
      expect(db.snapshot().rows[0].periods[0].state).toBe('LIVE');
    } finally {
      release.open();
      await Promise.all([processing, stopping]);
    }
    expect(stopped).toBe(true);
    expect(db.snapshot().rows[0]).toMatchObject({ version: 2, periods: [expect.objectContaining({ state: 'ENDED' }), expect.objectContaining({ state: 'HALFTIME' })] });
    expect(db.snapshot().audits).toHaveLength(1);
    const stoppedState = db.snapshot();
    expect(await worker.processOne()).toBe(false);
    expect(db.snapshot()).toEqual(stoppedState);
  });

  it('commits the real registered outbox handler after a clock scan rejects', async () => {
    const db = clockLifecycleDatabase({ scanError: true, outbox: true });
    expectedErrors.push('Game clock expiry scan failed: Error: clock scan unavailable');
    const worker = new V1GameOperationsWorkerService(db.prisma);
    try { expect(await worker.processOne()).toBe(true); } finally { await worker.shutdown(); }
    const persisted = db.snapshot();
    expect(persisted.status).toBe('COMPLETED');
    expect(persisted.effects).toEqual([{ requestId: 'clock-failure-outbox-proof', body: expect.stringContaining('GAME_RESULT_CHANGE_REQUESTED') }]);
    expect(errors).toContain('Game clock expiry scan failed: Error: clock scan unavailable');
    expect(persisted.rows[0].periods[0].state).toBe('LIVE');
    expect(persisted.audits).toEqual([]);
  });

  it.each(['pause', 'different period'] as const)('re-reads the locked game after a concurrent %s', async (change) => {
    const db = clockLifecycleDatabase({ onLock: (stored) => {
      stored.version += 1;
      if (change === 'pause') { stored.state = 'PAUSED'; stored.periods[0].pausedAt = CLOCK_TEST_NOW; }
      else {
        stored.periods[0].state = 'ENDED'; stored.periods[0].endedAt = CLOCK_TEST_NOW;
        stored.periods[1].state = 'LIVE'; stored.periods[1].startedAt = CLOCK_TEST_NOW;
      }
    } });
    const worker = new V1GameOperationsWorkerService(db.prisma);
    try { expect(await worker.processOne()).toBe(false); } finally { await worker.shutdown(); }
    const persisted = db.snapshot();
    expect(persisted.rows[0].version).toBe(2);
    expect(persisted.rows[0].state).toBe(change === 'pause' ? 'PAUSED' : 'LIVE');
    expect(persisted.rows[0].periods[change === 'pause' ? 0 : 1].state).toBe('LIVE');
    expect(persisted.audits).toEqual([]);
    expect(persisted.commands).toEqual([]);
  });

  it('does not close a period or consume queued work while cutover excludes mutations', async () => {
    const db = clockLifecycleDatabase({ cutover: false, outbox: true });
    const before = db.snapshot();
    const worker = new V1GameOperationsWorkerService(db.prisma);
    try { expect(await worker.processOne()).toBe(false); } finally { await worker.shutdown(); }
    const after = db.snapshot();
    expect(after.rows).toEqual(before.rows);
    expect(after.status).toBe('PENDING');
    expect(after.locks).toBe(0);
    expect(after.audits).toEqual([]);
    expect(after.commands).toEqual([]);
    expect(after.effects).toEqual([]);
  });

  it('reads at most twenty candidates and allows one locked transition per one-second scan', async () => {
    const db = clockLifecycleDatabase({ count: 25 });
    const service = new GameClockExpiryService(db.prisma);
    expect(await service.processOne()).toBe(true);
    const first = db.snapshot();
    expect(first.batchSizes).toEqual([20]);
    expect(first.transactions).toBe(1);
    expect(first.rows.filter((stored) => stored.periods[0].state === 'ENDED')).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(await service.processOne()).toBe(false);
    expect(db.snapshot()).toEqual(first);
    await jest.advanceTimersByTimeAsync(1);
    expect(await service.processOne()).toBe(true);
    const second = db.snapshot();
    expect(second.batchSizes).toEqual([20, 20]);
    expect(second.transactions).toBe(2);
    expect(second.audits).toHaveLength(2);
    expect(second.rows.filter((stored) => stored.periods[0].state === 'ENDED')).toHaveLength(2);
  });

  it('attempts only one locked candidate even when its fresh state loses the expiry race', async () => {
    const db = clockLifecycleDatabase({ count: 25, onLock: (stored) => { stored.state = 'PAUSED'; } });
    expect(await new GameClockExpiryService(db.prisma).processOne()).toBe(false);
    const persisted = db.snapshot();
    expect(persisted.transactions).toBe(1);
    expect(persisted.rows.filter((stored) => stored.state === 'PAUSED')).toHaveLength(1);
    expect(persisted.rows.filter((stored) => stored.periods[0].state === 'ENDED')).toHaveLength(0);
    expect(persisted.commands).toEqual([]);
    expect(persisted.audits).toEqual([]);
  });

  it('rotates beyond twenty unexpired clocks to consume a later expired game', async () => {
    const db = clockLifecycleDatabase({ count: 25 });
    for (const stored of db.rows.slice(0, 20)) stored.periods[0].startedAt = CLOCK_TEST_NOW;
    const service = new GameClockExpiryService(db.prisma);
    expect(await service.processOne()).toBe(false);
    expect(db.snapshot().batchSizes).toEqual([20]);
    expect(db.snapshot().transactions).toBe(0);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await service.processOne()).toBe(true);
    expect(db.snapshot().batchSizes).toEqual([20, 5]);
    expect(db.snapshot().rows[20].periods[0].state).toBe('ENDED');
    expect(db.snapshot().audits).toHaveLength(1);
  });
});
