import { PrismaClient } from '@prisma/client';

const CLEANUP_LOCK_KEY = 910_421_477;
const MAX_TRUNCATE_ATTEMPTS = 3;
const RETRYABLE_POSTGRES_CODES = new Set(['40P01', '55P03']);

function getDatabaseNameFromUrl(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;

  try {
    const { pathname } = new URL(databaseUrl);
    const databaseName = decodeURIComponent(pathname.replace(/^\//, ''));
    return databaseName || null;
  } catch {
    return null;
  }
}

function assertTestDatabase(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to truncate database because NODE_ENV is not test.');
  }

  const databaseName = getDatabaseNameFromUrl(process.env.DATABASE_URL);
  if (!databaseName || !/(^|[_-])(test|ci)([_-]|$)/i.test(databaseName)) {
    throw new Error(
      `Refusing to truncate database "${databaseName ?? 'unknown'}"; integration cleanup requires a test/ci database name.`,
    );
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function isRetryableCleanupError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const prismaError = error as Error & {
    code?: string;
    meta?: { code?: string; message?: string };
  };

  return (
    RETRYABLE_POSTGRES_CODES.has(prismaError.code ?? '') ||
    RETRYABLE_POSTGRES_CODES.has(prismaError.meta?.code ?? '') ||
    /deadlock detected|could not obtain lock/i.test(
      `${prismaError.message} ${prismaError.meta?.message ?? ''}`,
    )
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncates all user-land tables in the database, restarting identity sequences.
 * Excludes _prisma_migrations and any system tables.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  assertTestDatabase();

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
    ORDER BY tablename
  `;

  if (tables.length === 0) return;

  const names = tables.map((t) => quoteIdentifier(t.tablename)).join(', ');
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_TRUNCATE_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLEANUP_LOCK_KEY})`);
        await tx.$executeRawUnsafe(
          `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
        );
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableCleanupError(error) || attempt === MAX_TRUNCATE_ATTEMPTS) {
        throw error;
      }

      await delay(100 * attempt);
    }
  }

  throw lastError;
}
