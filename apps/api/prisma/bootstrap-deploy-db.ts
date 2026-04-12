import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(__dirname, 'migrations');

type BootstrapState = {
  hasMigrationHistory: boolean;
  publicTableCount: number;
};

function runPrismaCommand(args: string[]) {
  execFileSync('npx', ['prisma', ...args], {
    cwd: API_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

function getMigrationNames() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function getBootstrapState(): Promise<BootstrapState> {
  const [migrationHistoryRows, publicTableCountRows] = await Promise.all([
    prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      ) AS "exists"
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `),
  ]);

  return {
    hasMigrationHistory: Boolean(migrationHistoryRows[0]?.exists),
    publicTableCount: Number(publicTableCountRows[0]?.count ?? 0),
  };
}

function bootstrapEmptyDatabase() {
  console.log('[INFO] Empty database detected; bootstrapping schema with prisma db push.');
  runPrismaCommand(['db', 'push', '--skip-generate']);

  for (const migrationName of getMigrationNames()) {
    console.log(`[INFO] Marking existing migration as applied: ${migrationName}`);
    runPrismaCommand(['migrate', 'resolve', '--applied', migrationName]);
  }

  console.log('[INFO] Verifying migration history after empty-database bootstrap.');
  runPrismaCommand(['migrate', 'deploy']);
}

async function resetMigrationHistory() {
  console.log('[INFO] Resetting orphaned Prisma migration history on an empty database.');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "_prisma_migrations"');
}

async function main() {
  const state = await getBootstrapState();

  if (state.publicTableCount === 0) {
    if (state.hasMigrationHistory) {
      await resetMigrationHistory();
    }
    bootstrapEmptyDatabase();
    return;
  }

  if (!state.hasMigrationHistory) {
    throw new Error(
      'Prisma migration history is missing while public tables already exist. Refusing to auto-resolve a non-empty database.',
    );
  }

  console.log('[INFO] Applying Prisma migrations with prisma migrate deploy.');
  runPrismaCommand(['migrate', 'deploy']);
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error('[ERROR] Failed to bootstrap deploy database.');
    if (error instanceof Error) {
      console.error(error.message);
      return;
    }
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
