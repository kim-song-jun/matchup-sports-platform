import { PrismaService } from '../../src/prisma/prisma.service';
import { GAME_OPERATION_FLAG_DEFAULTS } from '../../src/config/game-operation-flags';
import { seedGameOperationFlagDefaults } from '../../src/config/game-operation-flags-seed';

/**
 * Alpha runtime bug (historical): `v1_game_operation_flags` had **zero rows** on a freshly
 * provisioned environment, because nothing in the deploy path had ever created them --
 * `GameOperationFlagsService.ensureDefaults()` is private and only runs when a `platform_ops`
 * operator calls the flags API, and no migration seeds them (DML is never additive under the
 * expand-contract gate). At the time, that broke the tournament operations board outright (it
 * failed closed on a missing `GAME_READ` row -- Task 18 review P1-7). `GAME_READ` is retired now
 * (Task 10 cutover cleanup), but `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` still benefit from this seed
 * as defense in depth: it makes each row's presence (and its CAS `version: 0` starting point) an
 * explicit deploy-time fact instead of an implicit one that only becomes true the first time an
 * operator happens to touch the flags API.
 *
 * These cases pin the two properties the deploy path actually depends on. The second one is the
 * one that can silently break: the seed runs on EVERY deploy, so if it ever grew a populated
 * `update:` clause it would reset an operator's live kill-switch (e.g. `PUBLIC_LIVE: on`) back to
 * the default on the next release — exactly the kind of silent regression the fail-closed design
 * exists to prevent.
 */
const prisma = new PrismaService();

const FLAG_KEYS = Object.keys(GAME_OPERATION_FLAG_DEFAULTS) as Array<
  keyof typeof GAME_OPERATION_FLAG_DEFAULTS
>;

describe('game operation flag deploy seed', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the game-operation-flag-seed integration spec');
    }
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.v1GameOperationFlag.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates every flag row on an environment that has only been deployed', async () => {
    await expect(prisma.v1GameOperationFlag.count()).resolves.toBe(0);

    const counts = await seedGameOperationFlagDefaults(prisma);

    expect(counts).toEqual({ flagsCreated: FLAG_KEYS.length });

    const rows = await prisma.v1GameOperationFlag.findMany({ orderBy: { key: 'asc' } });
    expect(rows.map((row) => row.key).sort()).toEqual([...FLAG_KEYS].sort());
    for (const row of rows) {
      // `row.key` is typed against Prisma's DB-level `V1GameOperationFlagKey` enum, which still
      // has the retired `GAME_WRITE`/`GAME_READ` members (see the DB-cleanup rationale in
      // `game-operation-flags.ts`'s top-level doc comment); this test only ever seeds/reads the
      // two keys `GAME_OPERATION_FLAG_DEFAULTS` actually has, so the cast is safe here.
      expect(row.value).toBe(
        GAME_OPERATION_FLAG_DEFAULTS[row.key as keyof typeof GAME_OPERATION_FLAG_DEFAULTS],
      );
      expect(row.version).toBe(0);
      expect(row.ownerActor).toBe('platform_ops');
    }
  });

  it('never resets a value an operator has changed, because the deploy path re-runs it on every release', async () => {
    await seedGameOperationFlagDefaults(prisma);

    // Operator turns the public-live kill switch on and bumps the optimistic-concurrency version,
    // exactly as `GameOperationFlagsService.patchFlag()` would.
    await prisma.v1GameOperationFlag.update({
      where: { key: 'PUBLIC_LIVE' },
      data: { value: 'on', version: 1, updatedByUserId: 'operator-under-test' },
    });

    const counts = await seedGameOperationFlagDefaults(prisma);

    expect(counts).toEqual({ flagsCreated: 0 });

    const publicLive = await prisma.v1GameOperationFlag.findUnique({ where: { key: 'PUBLIC_LIVE' } });
    expect(publicLive?.value).toBe('on');
    expect(publicLive?.version).toBe(1);
    expect(publicLive?.updatedByUserId).toBe('operator-under-test');
  });
});
