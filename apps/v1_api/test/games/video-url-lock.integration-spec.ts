import { PrismaService } from '../../src/prisma/prisma.service';
import { lockVideoUrl } from '../../src/games/video-url-lock';

/**
 * Run under the repository's isolated PostgreSQL integration environment.
 * No sleeps are used; the first transaction's promise is the lock-held
 * barrier, and transaction completion is the release barrier.
 */
describe('video URL advisory lock (real PostgreSQL candidate)', () => {
  const prisma = new PrismaService();

  beforeAll(async () => prisma.$connect());
  afterAll(async () => prisma.$disconnect());

  it('serializes the same URL, permits a different URL, then reacquires after release', async () => {
    const sameUrl = `/uploads/task168/same-${Date.now()}.mp4`;
    const otherUrl = `/uploads/task168/other-${Date.now()}.mp4`;
    let signalLocked!: () => void;
    let releaseFirst!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = prisma.$transaction(async (tx) => {
      await lockVideoUrl(tx, sameUrl);
      signalLocked();
      await release;
    });

    try {
      await Promise.race([
        locked,
        first.then(() => { throw new Error('first transaction ended before lock barrier'); }),
      ]);

      const blocked = prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
        await lockVideoUrl(tx, sameUrl);
      });
      await expect(blocked).rejects.toMatchObject({ code: 'P2010', meta: { code: '55P03' } });

      await expect(prisma.$transaction((tx) => lockVideoUrl(tx, otherUrl))).resolves.toBeUndefined();
    } finally {
      releaseFirst();
      await first;
    }

    await expect(prisma.$transaction((tx) => lockVideoUrl(tx, sameUrl))).resolves.toBeUndefined();
  });
});
