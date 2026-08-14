/**
 * Deploy-time seeding of the game-operation flag invariant rows.
 *
 * `ensureDefaults()` is private to `GameOperationFlagsService` and only runs when a
 * `platform_ops` operator calls the flags API (`getFlag`/`patchFlag`/`simplifiedPatchFlag`), and
 * no migration seeds these rows (DML is never additive under the expand-contract gate). Every
 * consumer of `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` that reads OUTSIDE that admin API (e.g.
 * `games.service.ts`'s public-visibility read, `tournament-result-review.service.ts`'s
 * director-officialize check) already treats a missing row as `off` -- the same value the row
 * would hold if seeded -- so a freshly provisioned environment is never broken by the absence of
 * this seed. This module exists for defense in depth anyway: it makes the row's presence (and its
 * CAS `version: 0` starting point) an explicit, observable deploy-time fact instead of an implicit
 * property that only becomes true the first time an operator happens to touch the flags API. It is
 * run from the deploy path (see `deploy/deploy-alpha.sh` and the migration-replay gate in
 * `.github/workflows/deploy.yml`) right after `prisma migrate deploy`.
 *
 * **Idempotent and non-clobbering**: uses `createMany({ skipDuplicates: true })`, not `upsert`,
 * so there is no update path at all — an existing row is left untouched and simply skipped by
 * the unique constraint. A re-run can never reset a value an operator has since changed (e.g.
 * `PUBLIC_LIVE: off -> on`). This matters because the deploy path runs it on *every* deploy.
 */
import { PrismaClient } from '@prisma/client';

import { GAME_OPERATION_FLAG_DEFAULTS, type GameOperationFlagKey } from './game-operation-flags';

export type GameOperationFlagSeedCounts = {
  flagsCreated: number;
};

/**
 * Creates the default flag rows if they are missing. Reproduces exactly what
 * `GameOperationFlagsService.ensureDefaults()` would create (same `version: 0`, same
 * `owner_actor`) — not a new or relaxed contract, just seeded at deploy time instead of lazily on
 * the first operator mutation.
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

  return { flagsCreated: flags.count };
}
