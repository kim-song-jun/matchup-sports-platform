import { PrismaService } from '../../src/prisma/prisma.service';
import { GAME_OPERATION_FLAG_DEFAULTS } from '../../src/config/game-operation-flags';
import { seedGameOperationFlagDefaults } from '../../src/config/game-operation-flags-seed';

/**
 * Alpha runtime bug: `v1_game_operation_flags` had **zero rows**, so
 * `TournamentOperationsBoardService.list()` — which deliberately fails closed with
 * `500 GAME_READ_FLAG_MISSING` when the `GAME_READ` row is absent (Task 18 review P1-7) —
 * was unreachable on every freshly provisioned environment.
 *
 * Nothing in the deploy path had ever created those rows:
 * `GameOperationFlagsService.ensureDefaults()` is private and only runs when a `platform_ops`
 * operator calls the flags API, and no migration seeds them (DML is never additive under the
 * expand-contract gate). The board's own integration suite never caught it because every one of
 * its cases upserts the flag row in its own setup — none exercise "an environment that was only
 * deployed".
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
  beforeEach(async () => {
    await prisma.v1GameCutoverEpoch.deleteMany({});
    await prisma.v1GameOperationFlag.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates every flag row the board read path requires, plus the cutover epoch, on an environment that has only been deployed', async () => {
    await expect(prisma.v1GameOperationFlag.count()).resolves.toBe(0);

    const counts = await seedGameOperationFlagDefaults(prisma);

    expect(counts).toEqual({ flagsCreated: FLAG_KEYS.length, cutoverEpochCreated: 1 });

    const rows = await prisma.v1GameOperationFlag.findMany({ orderBy: { key: 'asc' } });
    expect(rows.map((row) => row.key).sort()).toEqual([...FLAG_KEYS].sort());
    for (const row of rows) {
      expect(row.value).toBe(GAME_OPERATION_FLAG_DEFAULTS[row.key]);
      expect(row.version).toBe(0);
      expect(row.ownerActor).toBe('platform_ops');
    }

    // The specific row whose absence produced `500 GAME_READ_FLAG_MISSING`.
    const gameRead = rows.find((row) => row.key === 'GAME_READ');
    expect(gameRead).toBeDefined();
    expect(gameRead?.value).toBe('legacy');

    const epoch = await prisma.v1GameCutoverEpoch.findUnique({ where: { id: 'game-cutover' } });
    expect(epoch).not.toBeNull();
    expect(epoch?.writeMode).toBe('legacy');
    expect(epoch?.version).toBe(0);
  });

  it('never resets a value an operator has changed, because the deploy path re-runs it on every release', async () => {
    await seedGameOperationFlagDefaults(prisma);

    // Operator turns the public-live kill switch on and bumps the optimistic-concurrency version,
    // exactly as `GameOperationFlagsService.patchFlag()` would.
    await prisma.v1GameOperationFlag.update({
      where: { key: 'PUBLIC_LIVE' },
      data: { value: 'on', version: 1, updatedByUserId: 'operator-under-test' },
    });
    await prisma.v1GameCutoverEpoch.update({
      where: { id: 'game-cutover' },
      data: { writeMode: 'new', version: 3 },
    });

    const counts = await seedGameOperationFlagDefaults(prisma);

    expect(counts).toEqual({ flagsCreated: 0, cutoverEpochCreated: 0 });

    const publicLive = await prisma.v1GameOperationFlag.findUnique({ where: { key: 'PUBLIC_LIVE' } });
    expect(publicLive?.value).toBe('on');
    expect(publicLive?.version).toBe(1);
    expect(publicLive?.updatedByUserId).toBe('operator-under-test');

    const epoch = await prisma.v1GameCutoverEpoch.findUnique({ where: { id: 'game-cutover' } });
    expect(epoch?.writeMode).toBe('new');
    expect(epoch?.version).toBe(3);
  });
});
