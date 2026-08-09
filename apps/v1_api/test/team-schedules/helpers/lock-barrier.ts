import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Deterministic concurrency barrier for proving a real Postgres row lock actually serializes two
 * concurrent callers, instead of trusting a bare `Promise.all()` to happen to overlap (Task 12
 * review T3: "Promise.all() issues concurrent work but does not prove the race window was
 * actually exercised — the calls may serialize and the test still pass").
 *
 * `acquire` runs in its own transaction and must take the exact `SELECT ... FOR UPDATE` lock the
 * production code under test also takes on the same row(s) — any other transaction attempting the
 * same (or an overlapping) row lock genuinely blocks in Postgres until this holder transaction
 * commits or rolls back. The holder transaction stays open (blocking) until `release()` is
 * called.
 *
 * `duringLock`, if provided, runs INSIDE the holder transaction — while it still holds the lock —
 * immediately before it commits. Use this to simulate "some other mutation commits while a
 * concurrent caller is genuinely blocked waiting on the same row" (e.g. a cancellation closing a
 * recruitment while a guest application is mid-flight).
 */
export async function holdRowLock(
  prisma: PrismaService,
  acquire: (tx: Prisma.TransactionClient) => Promise<unknown>,
  duringLock?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ release: () => Promise<void> }> {
  let signalAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => {
    signalAcquired = resolve;
  });
  let signalRelease!: () => void;
  const releaseRequested = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });

  const holderPromise = prisma.$transaction(
    async (tx) => {
      await acquire(tx);
      signalAcquired();
      await releaseRequested;
      if (duringLock) await duringLock(tx);
    },
    { timeout: 15_000, maxWait: 15_000 },
  );

  await acquired;

  return {
    release: async () => {
      signalRelease();
      await holderPromise;
    },
  };
}

/**
 * Resolves `true` if `promise` has NOT settled (resolved or rejected) after `ms` milliseconds —
 * i.e. it is still genuinely pending, blocked on something. This is the actual proof that a race
 * window was created and exercised (T3's requirement), not merely "the code happened not to have
 * run yet". A rejection is treated as "settled", not swallowed — the caller awaits the original
 * promise separately and observes the real outcome.
 */
export async function isStillPending(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !settled;
}
