import { GameSubscriberRefreshScheduler } from './game-subscriber-refresh.scheduler';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

describe('GameSubscriberRefreshScheduler', () => {
  it('bounds actual reads globally and per game while allowing another game to progress', async () => {
    const scheduler = new GameSubscriberRefreshScheduler(4, 2);
    const gates = Array.from({ length: 6 }, () => deferred());
    const starts: string[] = [];
    const tasks = [
      ...gates.slice(0, 4).map((gate, index) => scheduler.schedule('busy', async () => { starts.push(`busy-${index}`); await gate.promise; })),
      scheduler.schedule('other', async () => { starts.push('other'); await gates[4]!.promise; }),
      scheduler.schedule('third', async () => { starts.push('third'); await gates[5]!.promise; }),
    ];
    await Promise.resolve();
    expect(starts).toHaveLength(4);
    expect(starts.filter((entry) => entry.startsWith('busy-'))).toHaveLength(2);
    expect(starts).toContain('other');
    expect(starts).toContain('third');
    gates[0]!.resolve();
    await tasks[0]!.promise;
    await Promise.resolve();
    expect(starts.filter((entry) => entry.startsWith('busy-'))).toHaveLength(3);
    gates[1]!.resolve(); gates[2]!.resolve(); gates[3]!.resolve(); gates[4]!.resolve(); gates[5]!.resolve();
    await Promise.all(tasks.map((task) => task.promise));
    scheduler.shutdown();
  });

  it('releases a slot only after a rejected read settles and runs the next room task', async () => {
    const scheduler = new GameSubscriberRefreshScheduler(1, 1);
    const failing = deferred();
    const starts: string[] = [];
    const first = scheduler.schedule('one', async () => { starts.push('first'); await failing.promise; });
    const second = scheduler.schedule('two', async () => { starts.push('second'); });
    await Promise.resolve();
    expect(starts).toEqual(['first']);
    failing.reject(new Error('read failed'));
    await expect(first.promise).rejects.toThrow('read failed');
    await second.promise;
    expect(starts).toEqual(['first', 'second']);
    scheduler.shutdown();
  });

  it('cancels queued work without invoking its database callback and clears queues on shutdown', async () => {
    const scheduler = new GameSubscriberRefreshScheduler(1, 1);
    const gate = deferred();
    let ran = 0;
    const active = scheduler.schedule('one', () => gate.promise);
    const cancelled = scheduler.schedule('two', async () => { ran += 1; });
    expect(cancelled.cancel()).toBe(true);
    await cancelled.promise;
    const shutdownQueued = scheduler.schedule('three', async () => { ran += 1; });
    scheduler.shutdown();
    await shutdownQueued.promise;
    expect(ran).toBe(0);
    gate.resolve();
    await active.promise;
  });

  it('reads the coalesced maximum floor when queued work actually starts', async () => {
    const scheduler = new GameSubscriberRefreshScheduler(1, 1);
    const gate = deferred();
    const blocker = scheduler.schedule('busy', () => gate.promise);
    let floor = 4;
    let observedFloor = 0;
    const queued = scheduler.schedule('target', async () => { observedFloor = floor; });
    floor = Math.max(floor, 9);
    floor = Math.max(floor, 12);
    gate.resolve();
    await Promise.all([blocker.promise, queued.promise]);
    expect(observedFloor).toBe(12);
    scheduler.shutdown();
  });
});
