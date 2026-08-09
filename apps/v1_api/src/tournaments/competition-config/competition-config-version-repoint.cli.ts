/**
 * Ops entrypoint for competition-config-version-repoint.ts.
 *
 * Run against a deployed environment (e.g. alpha) as:
 *
 *   DATABASE_URL=<target> pnpm --filter v1_api exec ts-node --transpile-only \
 *     src/tournaments/competition-config/competition-config-version-repoint.cli.ts \
 *     --actor-email <existing owner/ops admin's email> [--dry-run]
 *
 * `--dry-run` reports what WOULD be published/repointed without writing
 * anything and does not require `--actor-email` (it makes no admin-gated
 * mutation, so it needs no actor). Without `--dry-run`, the repoint actually
 * runs and `--actor-email` is required — it must be the email of a v1_users
 * row backed by an active owner/ops v1_admin_users row; this CLI does not
 * create or elevate an admin, it only resolves one that already exists, the
 * same way AdminContextService.getMutationAdmin() gates every other
 * competition-config mutation in this codebase.
 *
 * Run this BEFORE re-running competition-config-backfill.cli.ts when that CLI
 * has failed with COMPETITION_CONFIG_SEED_DRIFT — this is the tool that
 * error message points at. Safe to run again afterward: a second run reports
 * zero changes for anything already resolved (see
 * competition-config-version-repoint.ts's docblock for why).
 *
 * Exits non-zero if any seed is blocked and left untouched — either its
 * drift touches `result`/`tieBreak` (the scoring-relevant sections, which
 * always require a human decision, never an automatic repoint), or the
 * canonical content it would publish collides by content_hash with an
 * unrelated lineage's existing version (see
 * competition-config-version-repoint.ts's `blocked_content_hash_collision`
 * for why that also needs a human, not an automatic reuse). The full
 * outcome (including which seed was blocked and why) is still printed to
 * stdout either way, exactly once.
 */
import 'reflect-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { runCompetitionConfigVersionRepoint } from './competition-config-version-repoint';

function parseArgs(argv: string[]): { dryRun: boolean; actorEmail: string | null } {
  const dryRun = argv.includes('--dry-run');
  let actorEmail: string | null = null;
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') continue;
    if (arg === '--actor-email') {
      // Validate the value here rather than only at the apply-mode check below.
      // `--dry-run --actor-email` (flag with no value) otherwise parsed clean and
      // the typo stayed invisible until someone re-ran it without --dry-run.
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--actor-email requires a value, e.g. --actor-email admin@example.com');
      }
      actorEmail = value;
      i += 1;
      continue;
    }
    unknown.push(arg);
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }
  if (!dryRun && !actorEmail) {
    throw new Error('--actor-email <email> is required unless --dry-run is set.');
  }
  return { dryRun, actorEmail };
}

async function resolveActor(prisma: PrismaService, email: string): Promise<V1AuthUser> {
  const user = await prisma.v1User.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No v1_users row found for --actor-email ${email}.`);
  }
  // Deliberately does not also check for an active owner/ops v1_admin_users
  // row here — runCompetitionConfigVersionRepoint()'s AdminContextService.
  // getMutationAdmin() call already enforces that with the exact same error
  // every other competition-config mutation raises; duplicating the check
  // here would just be a second, possibly-divergent copy of the same gate.
  return {
    id: user.id,
    email: user.email,
    accountStatus: user.accountStatus,
    onboardingStatus: user.onboardingStatus,
  };
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const { dryRun, actorEmail } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const actor = actorEmail ? await resolveActor(prisma, actorEmail) : undefined;
    const outcomes = await runCompetitionConfigVersionRepoint(prisma, {
      mode: dryRun ? 'dry-run' : 'apply',
      actor,
    });
    const blocked = outcomes.filter(
      (outcome) => outcome.status === 'blocked_scoring_drift' || outcome.status === 'blocked_content_hash_collision',
    );
    emit({ mode: dryRun ? 'dry-run' : 'apply', outcomes });
    if (blocked.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
