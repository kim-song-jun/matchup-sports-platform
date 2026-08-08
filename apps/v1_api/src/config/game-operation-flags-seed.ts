/**
 * Deploy-time seeding of the game-operation flag invariant rows.
 *
 * `TournamentOperationsBoardService.list()` fails closed with
 * `500 GAME_READ_FLAG_MISSING` when the `GAME_READ` row is absent — deliberately,
 * so that a deleted row can never silently disable compare-mode's mismatch
 * protection (Task 18 review P1-7). That fail-closed contract is correct, but
 * nothing in the deploy path ever created the rows: `ensureDefaults()` is private
 * to `GameOperationFlagsService` and only runs when a `platform_ops` operator
 * calls the flags API, and no migration seeds them (DML is never additive under
 * the expand-contract gate). So every freshly provisioned environment served a
 * 500 on the tournament operations board until somebody happened to touch the
 * flags API — which is exactly the state alpha was found in (0 rows).
 *
 * The board's integration tests never caught it because each one upserts the
 * flag row in its own setup; none of them exercise "an environment that was only
 * deployed".
 *
 * This module is the explicit seed the board service's doc comment already
 * assumed existed. It is run from the deploy path (see `deploy/deploy-alpha.sh`
 * and the migration-replay gate in `.github/workflows/deploy.yml`) right after
 * `prisma migrate deploy`.
 *
 * **Idempotent and non-clobbering**: uses `createMany({ skipDuplicates: true })`, not `upsert`,
 * so there is no update path at all — an existing row is left untouched and simply skipped by
 * the unique constraint. A re-run can never reset a value an operator has since changed (e.g.
 * `PUBLIC_LIVE: off -> on`). This matters because the deploy path runs it on *every* deploy.
 */
import { PrismaClient, V1GameWriteMode } from '@prisma/client';

import { GAME_OPERATION_FLAG_DEFAULTS, type GameOperationFlagKey } from './game-operation-flags';

export type GameOperationFlagSeedCounts = {
  flagsCreated: number;
  cutoverEpochCreated: number;
};

/**
 * Creates the four default flag rows and the cutover epoch if they are missing.
 * Reproduces exactly what `GameOperationFlagsService.ensureDefaults()` would
 * create (same `version: 0`, same `owner_actor`, same schema-level epoch
 * defaults) — not a new or relaxed contract, just seeded at deploy time instead
 * of lazily on the first operator mutation.
 */
export async function seedGameOperationFlagDefaults(
  prisma: PrismaClient,
): Promise<GameOperationFlagSeedCounts> {
  // `createMany({ skipDuplicates })` — not `upsert` — is what makes "never clobbers an operator's
  // value" a STRUCTURAL property rather than a promise resting on an empty `update: {}` clause
  // that a later edit could quietly fill in. There is no update path here at all: an existing row
  // is skipped by the unique constraint, and the returned `count` is exactly the number of rows
  // this call created, so the caller's log distinguishes "seeded a fresh environment" from
  // "already seeded" without a separate read.
  const flags = await prisma.v1GameOperationFlag.createMany({
    data: (Object.keys(GAME_OPERATION_FLAG_DEFAULTS) as GameOperationFlagKey[]).map((key) => ({
      key,
      value: GAME_OPERATION_FLAG_DEFAULTS[key],
      version: 0,
      ownerActor: 'platform_ops',
    })),
    skipDuplicates: true,
  });

  const cutoverEpoch = await prisma.v1GameCutoverEpoch.createMany({
    data: [{ id: 'game-cutover', version: 0, writeMode: V1GameWriteMode.legacy }],
    skipDuplicates: true,
  });

  return { flagsCreated: flags.count, cutoverEpochCreated: cutoverEpoch.count };
}
