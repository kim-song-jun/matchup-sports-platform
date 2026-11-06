type RefreshTask = {
  readonly id: number;
  readonly gameId: string;
  readonly run: () => Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  state: 'queued' | 'active' | 'settled';
};

export type ScheduledRefresh = {
  readonly promise: Promise<void>;
  /** Returns true only when the task was still queued and was cancelled. */
  cancel(): boolean;
};

/** Fair, bounded execution for authorized subscriber snapshot reads. */
export class GameSubscriberRefreshScheduler {
  private readonly queues = new Map<string, Map<number, RefreshTask>>();
  private readonly readyRooms = new Map<string, true>();
  private readonly activeByRoom = new Map<string, number>();
  private active = 0;
  private nextId = 1;
  private closed = false;

  constructor(private readonly globalLimit = 4, private readonly perRoomLimit = 2) {}

  schedule(gameId: string, run: () => Promise<void>): ScheduledRefresh {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
    const task: RefreshTask = { id: this.nextId++, gameId, run, resolve, reject, state: 'queued' };
    if (this.closed) {
      task.state = 'settled';
      resolve();
      return { promise, cancel: () => false };
    }
    let queue = this.queues.get(gameId);
    if (queue === undefined) {
      queue = new Map();
      this.queues.set(gameId, queue);
    }
    queue.set(task.id, task);
    this.markReady(gameId);
    this.pump();
    return { promise, cancel: () => this.cancel(task) };
  }

  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [gameId, queue] of this.queues) {
      for (const task of queue.values()) {
        task.state = 'settled';
        task.resolve();
      }
      this.queues.delete(gameId);
    }
    this.readyRooms.clear();
  }

  private cancel(task: RefreshTask): boolean {
    if (task.state !== 'queued') return false;
    const queue = this.queues.get(task.gameId);
    if (queue?.delete(task.id)) {
      task.state = 'settled';
      task.resolve();
      if (queue.size === 0) {
        this.queues.delete(task.gameId);
        this.readyRooms.delete(task.gameId);
      }
      else this.markReady(task.gameId);
      this.pump();
      return true;
    }
    return false;
  }

  private markReady(gameId: string): void {
    if (!this.readyRooms.has(gameId) && (this.queues.get(gameId)?.size ?? 0) > 0) this.readyRooms.set(gameId, true);
  }

  private pump(): void {
    if (this.closed) return;
    let blocked = 0;
    while (this.active < this.globalLimit && this.readyRooms.size > 0 && blocked < this.readyRooms.size) {
      const gameId = this.readyRooms.keys().next().value as string | undefined;
      if (gameId === undefined) break;
      this.readyRooms.delete(gameId);
      const queue = this.queues.get(gameId);
      if (queue === undefined || queue.size === 0) continue;
      if ((this.activeByRoom.get(gameId) ?? 0) >= this.perRoomLimit) {
        this.markReady(gameId);
        blocked += 1;
        continue;
      }
      blocked = 0;
      const task = queue.values().next().value as RefreshTask | undefined;
      if (task === undefined) continue;
      queue.delete(task.id);
      if (queue.size === 0) this.queues.delete(gameId);
      else this.markReady(gameId);
      task.state = 'active';
      this.active += 1;
      this.activeByRoom.set(gameId, (this.activeByRoom.get(gameId) ?? 0) + 1);
      void this.execute(task);
    }
  }

  private async execute(task: RefreshTask): Promise<void> {
    try {
      await task.run();
      task.state = 'settled';
      task.resolve();
    } catch (error) {
      task.state = 'settled';
      task.reject(error);
    } finally {
      this.active -= 1;
      const roomActive = (this.activeByRoom.get(task.gameId) ?? 1) - 1;
      if (roomActive === 0) this.activeByRoom.delete(task.gameId);
      else this.activeByRoom.set(task.gameId, roomActive);
      this.markReady(task.gameId);
      this.pump();
    }
  }
}
