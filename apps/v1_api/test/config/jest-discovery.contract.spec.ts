import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const apiRoot = resolve(__dirname, '../..');
const jestBin = resolve(apiRoot, 'node_modules/jest/bin/jest.js');
const { recoveryContract } = require('../helpers/isolated-integration-environment.cjs') as {
  recoveryContract: {
    CLONE_PREFIX: string;
    DROP_TIMEOUT_SECONDS: number;
    MAX_RECOVERY_DROPS: number;
    MAX_RECOVERY_SCAN: number;
    STALE_AFTER_SECONDS: number;
    approvedMaintenanceUrl: (rawUrl: string | undefined) => string;
    boundedDropperUrl: (maintenanceDatabaseUrl: string) => string;
    classifyRecoveryCandidates: (
      rows: Array<{ datname: string; activeConnections: number }>,
      currentCloneName: string,
      nowSeconds: number,
      protectedDatabaseNames?: string[],
    ) => string[];
    recoverStaleClones: (
      maintenance: PrismaClient,
      maintenanceDatabaseUrl: string,
      currentCloneName: string,
      sourceDatabaseName: string,
    ) => Promise<void>;
  };
};

jest.setTimeout(60_000);

function runJestResolver(...args: string[]): string {
  const result = spawnSync(process.execPath, [jestBin, ...args], {
    cwd: apiRoot,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Jest resolver failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  }
  return result.stdout;
}

describe('v1_api Jest integration discovery contract', () => {
  it('resolves every canonical suite through the isolated serial integration runner', () => {
    const shown = JSON.parse(
      runJestResolver('--selectProjects', 'integration', '--runInBand', '--showConfig', '--json'),
    ) as {
      configs: Array<{ displayName: { name: string }; testEnvironment: string }>;
      globalConfig: { maxWorkers: number };
    };
    const integration = shown.configs.find((project) => project.displayName.name === 'integration');

    expect(integration?.testEnvironment).toBe(
      resolve(apiRoot, 'test/helpers/isolated-integration-environment.cjs'),
    );
    expect(shown.globalConfig.maxWorkers).toBe(1);

    const listed = JSON.parse(
      runJestResolver('--selectProjects', 'integration', '--runInBand', '--listTests', '--json'),
    ) as string[];
    expect(
      listed.map((testPath) => relative(apiRoot, testPath).replaceAll('\\', '/')).sort(),
    ).toEqual([
      'test/games/fixture-game-backfill.integration-spec.ts',
      'test/games/game-actor-matrix.integration-spec.ts',
      'test/games/game-assist-assign-command.integration-spec.ts',
      'test/games/game-assist-foul-record.integration-spec.ts',
      'test/games/game-event-assist-validation.integration-spec.ts',
      'test/games/game-event-substitution-validation.integration-spec.ts',
      'test/games/game-lifecycle.integration-spec.ts',
      'test/games/game-lineup-fixture-deadline.integration-spec.ts',
      'test/games/game-lineup-participants.integration-spec.ts',
      'test/games/game-lineup-roster-identity-link.integration-spec.ts',
      'test/games/game-lineup-size.integration-spec.ts',
      'test/games/game-lineup-team-match-forbidden.integration-spec.ts',
      'test/games/game-missing-scorer-derivation.integration-spec.ts',
      'test/games/game-operations-lineup.integration-spec.ts',
      'test/games/game-participant-consent-link-scope.integration-spec.ts',
      'test/games/game-participant-identity-self-claim.integration-spec.ts',
      'test/games/game-participant-identity-staff-scope.integration-spec.ts',
      'test/games/game-participant-identity.integration-spec.ts',
      'test/games/game-period-halftime.integration-spec.ts',
      'test/games/game-period-lifecycle.integration-spec.ts',
      'test/games/game-period-live-backfill.integration-spec.ts',
      'test/games/game-period-pause-tracking.integration-spec.ts',
      'test/games/game-projection.integration-spec.ts',
      'test/games/game-schema.integration-spec.ts',
      'test/games/game-team-match-event-authority.integration-spec.ts',
      'test/games/game-team-match-event-score-mismatch.integration-spec.ts',
      'test/games/game-team-match-score-invariant.integration-spec.ts',
      'test/games/game-team-result-authority.integration-spec.ts',
      'test/games/goal-event-backfill.integration-spec.ts',
      'test/games/live-game-commands.integration-spec.ts',
      'test/games/public-records-privacy.integration-spec.ts',
      'test/games/public-user-records-assist-foul.integration-spec.ts',
      'test/games/public-user-records-lineup-consent-e2e.integration-spec.ts',
      'test/games/team-record-facts-backfill.integration-spec.ts',
      'test/integration/admin-owner-invariant.e2e-spec.ts',
      'test/integration/health.e2e-spec.ts',
      'test/integration/integration-app-cleanup.e2e-spec.ts',
      'test/integration/phone-verification-write-gate.e2e-spec.ts',
      'test/integration/phone-verification.e2e-spec.ts',
      'test/integration/push-device.e2e-spec.ts',
      'test/integration/roster-cleanup.e2e-spec.ts',
      'test/integration/team-logo-persistence.e2e-spec.ts',
      'test/integration/team-match-search-scope.e2e-spec.ts',
      'test/integration/tournament-campaign.e2e-spec.ts',
      'test/integration/tournament-overall-standings.e2e-spec.ts',
      'test/jobs/game-operation-flags-simplified-gate.integration-spec.ts',
      'test/jobs/game-operations-control.integration-spec.ts',
      'test/jobs/game-result-league-escalation.integration-spec.ts',
      'test/jobs/league-result-entry-reminder.integration-spec.ts',
      'test/jobs/v1-game-operations-worker.integration-spec.ts',
      'test/league-matches/league-fixture-timing.integration-spec.ts',
      'test/league-matches/league-match-detail-dispute-eligibility.integration-spec.ts',
      'test/league-matches/league-match-dispute.integration-spec.ts',
      'test/league-matches/league-match-result-entry.integration-spec.ts',
      'test/league-matches/league-promotion.integration-spec.ts',
      'test/team-contacts/report-enforcement.integration-spec.ts',
      'test/team-contacts/team-contact-flow.integration-spec.ts',
      'test/team-contacts/team-contact-guards.integration-spec.ts',
      'test/team-lineups/team-lineup-reuse.integration-spec.ts',
      'test/team-matches/team-match-lineup-size.integration-spec.ts',
      'test/team-matches/team-match-schedule-link.integration-spec.ts',
      'test/team-schedules/attendance.integration-spec.ts',
      'test/team-schedules/guest-recruitment.integration-spec.ts',
      'test/team-schedules/reminder-worker-wiring.integration-spec.ts',
      'test/team-schedules/schedule-crud.integration-spec.ts',
      'test/team-schedules/team-schedules.integration-spec.ts',
      'test/tournaments/alpha-seed-fixture-config.integration-spec.ts',
      'test/tournaments/competition-config-version-repoint.integration-spec.ts',
      'test/tournaments/competition-config.integration-spec.ts',
      'test/tournaments/game-operation-flag-seed.integration-spec.ts',
      'test/tournaments/seed-alpha-tournament-qa-upsert.integration-spec.ts',
      'test/tournaments/task7-audit-scope.integration-spec.ts',
      'test/tournaments/tournament-correction-guards.integration-spec.ts',
      'test/tournaments/tournament-game-adapter.integration-spec.ts',
      'test/tournaments/tournament-officialize-edge.integration-spec.ts',
      'test/tournaments/tournament-officialize.integration-spec.ts',
      'test/tournaments/tournament-operations-board.integration-spec.ts',
      'test/tournaments/tournament-penalty-shootout.integration-spec.ts',
      'test/tournaments/tournament-standings-recalculation.integration-spec.ts',
    ]);
  });

  it('recovers only expired unleased Task 9 clones within the bounded policy', () => {
    const now = 2_000_000_000;
    const stale = `${recoveryContract.CLONE_PREFIX}${now - recoveryContract.STALE_AFTER_SECONDS}_10_aaaaaaaaaaaa`;
    const live = `${recoveryContract.CLONE_PREFIX}${now - 1000}_11_bbbbbbbbbbbb`;
    const current = `${recoveryContract.CLONE_PREFIX}${now - 1000}_12_cccccccccccc`;
    const fresh = `${recoveryContract.CLONE_PREFIX}${now - recoveryContract.STALE_AFTER_SECONDS + 1}_13_dddddddddddd`;
    const protectedSource = `${recoveryContract.CLONE_PREFIX}${now - 1000}_14_eeeeeeeeeeee`;

    expect(
      recoveryContract.classifyRecoveryCandidates(
        [
          { datname: stale, activeConnections: 0 },
          { datname: live, activeConnections: 1 },
          { datname: current, activeConnections: 0 },
          { datname: fresh, activeConnections: 0 },
          { datname: protectedSource, activeConnections: 0 },
          { datname: 'ulw_v1_integration_jest_other_1900000000_1_aaaaaaaaaaaa', activeConnections: 0 },
          { datname: 'v1_migrate_check', activeConnections: 0 },
          { datname: 'teameet_production', activeConnections: 0 },
        ],
        current,
        now,
        [protectedSource],
      ),
    ).toEqual([stale]);
  });

  it('fails closed for ambiguous owned metadata and bounds each recovery pass', () => {
    const now = 2_000_000_000;
    expect(() =>
      recoveryContract.classifyRecoveryCandidates(
        [{ datname: `${recoveryContract.CLONE_PREFIX}malformed`, activeConnections: 0 }],
        '',
        now,
      ),
    ).toThrow('metadata is ambiguous');
    expect(() =>
      recoveryContract.classifyRecoveryCandidates(
        [
          {
            datname: `${recoveryContract.CLONE_PREFIX}${now + 1}_1_aaaaaaaaaaaa`,
            activeConnections: 0,
          },
        ],
        '',
        now,
      ),
    ).toThrow('timestamp is invalid');

    const scanOverflow = Array.from({ length: recoveryContract.MAX_RECOVERY_SCAN + 1 }, (_, index) => ({
      datname: `${recoveryContract.CLONE_PREFIX}${now - 1000}_${index + 1}_${String(index).padStart(12, 'a')}`,
      activeConnections: 1,
    }));
    expect(() => recoveryContract.classifyRecoveryCandidates(scanOverflow, '', now)).toThrow(
      'scan limit exceeded',
    );

    const repeatedInterruptionBacklog = Array.from(
      { length: recoveryContract.MAX_RECOVERY_DROPS + 1 },
      (_, index) => ({
        datname: `${recoveryContract.CLONE_PREFIX}${now - 1000}_${index + 1}_${String(index).padStart(12, 'b')}`,
        activeConnections: 0,
      }),
    );
    const firstPass = recoveryContract.classifyRecoveryCandidates(
      repeatedInterruptionBacklog,
      '',
      now,
    );
    expect(firstPass).toHaveLength(recoveryContract.MAX_RECOVERY_DROPS);
    expect(
      recoveryContract.classifyRecoveryCandidates(
        repeatedInterruptionBacklog.filter((row) => !firstPass.includes(row.datname)),
        '',
        now,
      ),
    ).toHaveLength(1);
  });

  it('binds the exact drop connection to database, socket, pool, and connect timeouts', () => {
    const boundedUrl = new URL(
      recoveryContract.boundedDropperUrl(
        'postgresql://test:test@localhost:5432/postgres?sslmode=disable&options=-c%20search_path%3Dpublic',
      ),
    );
    expect(boundedUrl.searchParams.get('connect_timeout')).toBe(
      String(recoveryContract.DROP_TIMEOUT_SECONDS),
    );
    expect(boundedUrl.searchParams.get('pool_timeout')).toBe(
      String(recoveryContract.DROP_TIMEOUT_SECONDS),
    );
    expect(boundedUrl.searchParams.get('socket_timeout')).toBe(
      String(recoveryContract.DROP_TIMEOUT_SECONDS),
    );
    expect(boundedUrl.searchParams.get('connection_limit')).toBe('1');
    expect(boundedUrl.searchParams.get('application_name')).toBe(
      'teameet_task9_stale_clone_recovery',
    );
    expect(boundedUrl.searchParams.get('options')).toBe(
      '-c search_path=public -c statement_timeout=5000 -c lock_timeout=5000',
    );
  });

  it('uses a real transaction-scoped advisory lock and fails closed when another recovery holds it', async () => {
    const sourceDatabaseUrl = process.env.DATABASE_URL;
    if (sourceDatabaseUrl === undefined) {
      throw new Error('DATABASE_URL is required for the integration recovery contract.');
    }
    const maintenanceDatabaseUrl = recoveryContract.approvedMaintenanceUrl(sourceDatabaseUrl);
    const sourceDatabaseName = decodeURIComponent(new URL(sourceDatabaseUrl).pathname.slice(1));
    const maintenance = new PrismaClient({ datasourceUrl: maintenanceDatabaseUrl });
    const blocker = new PrismaClient({ datasourceUrl: maintenanceDatabaseUrl });
    let releaseLock: () => void = () => undefined;
    let reportLockReady: () => void = () => undefined;
    let reportLockFailure: (error: unknown) => void = (_error) => undefined;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockReady = new Promise<void>((resolve, reject) => {
      reportLockReady = resolve;
      reportLockFailure = reject;
    });
    const blockerTransaction = blocker.$transaction(
      async (transaction) => {
        const lockRows = await transaction.$queryRawUnsafe<Array<{ acquired: boolean }>>(
          'SELECT pg_try_advisory_xact_lock(782091::integer, 9::integer) AS acquired',
        );
        expect(lockRows).toHaveLength(1);
        expect(lockRows[0].acquired).toBe(true);
        reportLockReady();
        await lockReleased;
      },
      { timeout: recoveryContract.DROP_TIMEOUT_SECONDS * 4000 },
    );
    void blockerTransaction.catch(reportLockFailure);

    try {
      await lockReady;
      await expect(
        recoveryContract.recoverStaleClones(
          maintenance,
          maintenanceDatabaseUrl,
          '',
          sourceDatabaseName,
        ),
      ).rejects.toThrow('Integration database recovery lock is already held.');

      releaseLock();
      await blockerTransaction;
      await expect(
        recoveryContract.recoverStaleClones(
          maintenance,
          maintenanceDatabaseUrl,
          '',
          sourceDatabaseName,
        ),
      ).resolves.toBeUndefined();
    } finally {
      releaseLock();
      await blockerTransaction.catch(() => undefined);
      await Promise.all([maintenance.$disconnect(), blocker.$disconnect()]);
    }
  });

  it('removes an expired unleased clone while preserving live, current, and prefix-near databases', async () => {
    const sourceDatabaseUrl = process.env.DATABASE_URL;
    if (sourceDatabaseUrl === undefined) {
      throw new Error('DATABASE_URL is required for the integration recovery contract.');
    }
    const maintenanceDatabaseUrl = recoveryContract.approvedMaintenanceUrl(sourceDatabaseUrl);
    const maintenance = new PrismaClient({ datasourceUrl: maintenanceDatabaseUrl });
    const sourceDatabaseName = decodeURIComponent(
      new URL(sourceDatabaseUrl).pathname.slice(1),
    );
    const now = Math.floor(Date.now() / 1000);
    const runSuffix = String(process.pid).padStart(6, '0').slice(-6);
    const stale = `${recoveryContract.CLONE_PREFIX}${now - recoveryContract.STALE_AFTER_SECONDS}_${runSuffix}_000000000001`;
    const live = `${recoveryContract.CLONE_PREFIX}${now - recoveryContract.STALE_AFTER_SECONDS}_${runSuffix}_000000000002`;
    const current = `${recoveryContract.CLONE_PREFIX}${now - recoveryContract.STALE_AFTER_SECONDS}_${runSuffix}_000000000003`;
    const prefixNear = `ulw_v1_integration_jest_other_${runSuffix}`;
    const createdNames: string[] = [];
    let liveLease: PrismaClient | undefined;

    try {
      for (const databaseName of [stale, live, current, prefixNear]) {
        await maintenance.$executeRawUnsafe(
          `CREATE DATABASE ${quoteTestIdentifier(databaseName)} TEMPLATE template0`,
        );
        createdNames.push(databaseName);
      }
      liveLease = new PrismaClient({
        datasourceUrl: databaseUrlForName(maintenanceDatabaseUrl, live),
      });
      await liveLease.$connect();

      await recoveryContract.recoverStaleClones(
        maintenance,
        maintenanceDatabaseUrl,
        current,
        sourceDatabaseName,
      );
      const existing = await existingDatabaseNames(maintenance);
      expect(existing.has(stale)).toBe(false);
      expect(existing.has(live)).toBe(true);
      expect(existing.has(current)).toBe(true);
      expect(existing.has(prefixNear)).toBe(true);
      expect(existing.has(sourceDatabaseName)).toBe(true);
    } finally {
      await cleanupRecoveryTest(maintenance, createdNames, liveLease);
    }
  });

  it('rejects an ambiguous exact-prefix database without dropping it', async () => {
    const sourceDatabaseUrl = process.env.DATABASE_URL;
    if (sourceDatabaseUrl === undefined) {
      throw new Error('DATABASE_URL is required for the integration recovery contract.');
    }
    const maintenanceDatabaseUrl = recoveryContract.approvedMaintenanceUrl(sourceDatabaseUrl);
    const maintenance = new PrismaClient({ datasourceUrl: maintenanceDatabaseUrl });
    const sourceDatabaseName = decodeURIComponent(new URL(sourceDatabaseUrl).pathname.slice(1));
    const ambiguous = `${recoveryContract.CLONE_PREFIX}ambiguous_${process.pid}`;
    const createdNames: string[] = [];

    try {
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE ${quoteTestIdentifier(ambiguous)} TEMPLATE template0`,
      );
      createdNames.push(ambiguous);
      await expect(
        recoveryContract.recoverStaleClones(
          maintenance,
          maintenanceDatabaseUrl,
          '',
          sourceDatabaseName,
        ),
      ).rejects.toThrow('metadata is ambiguous');
      expect((await existingDatabaseNames(maintenance)).has(ambiguous)).toBe(true);
    } finally {
      await cleanupRecoveryTest(maintenance, createdNames);
    }
  });

  it('bounds a catalog-locked DROP, preserves the stale database, and retries after release', async () => {
    const sourceDatabaseUrl = process.env.DATABASE_URL;
    if (sourceDatabaseUrl === undefined) {
      throw new Error('DATABASE_URL is required for the integration recovery contract.');
    }
    const maintenanceDatabaseUrl = recoveryContract.approvedMaintenanceUrl(sourceDatabaseUrl);
    const sourceDatabaseName = decodeURIComponent(new URL(sourceDatabaseUrl).pathname.slice(1));
    const maintenance = new PrismaClient({ datasourceUrl: maintenanceDatabaseUrl });
    const blocker = new PrismaClient({ datasourceUrl: maintenanceDatabaseUrl });
    const now = Math.floor(Date.now() / 1000);
    const blocked = `${recoveryContract.CLONE_PREFIX}${now - recoveryContract.STALE_AFTER_SECONDS}_${process.pid}_000000000004`;
    const createdNames: string[] = [];
    let releaseCatalogLock: () => void = () => undefined;
    let reportCatalogLockReady: () => void = () => undefined;
    let reportCatalogLockFailure: (error: unknown) => void = (_error) => undefined;
    const catalogLockRelease = new Promise<void>((resolve) => {
      releaseCatalogLock = resolve;
    });
    const catalogLockReady = new Promise<void>((resolve, reject) => {
      reportCatalogLockReady = resolve;
      reportCatalogLockFailure = reject;
    });
    let catalogLockTransaction: Promise<unknown> | undefined;

    try {
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE ${quoteTestIdentifier(blocked)} TEMPLATE template0`,
      );
      createdNames.push(blocked);
      catalogLockTransaction = blocker.$transaction(
        async (transaction) => {
          await transaction.$executeRawUnsafe(
            `ALTER DATABASE ${quoteTestIdentifier(blocked)} CONNECTION LIMIT 100`,
          );
          reportCatalogLockReady();
          await catalogLockRelease;
        },
        { timeout: recoveryContract.DROP_TIMEOUT_SECONDS * 4000 },
      );
      void catalogLockTransaction.catch(reportCatalogLockFailure);
      await catalogLockReady;

      const startedAt = Date.now();
      const failure = await captureFailure(() =>
        recoveryContract.recoverStaleClones(
          maintenance,
          maintenanceDatabaseUrl,
          '',
          sourceDatabaseName,
        ),
      );
      const elapsedMilliseconds = Date.now() - startedAt;
      expect(describeFailure(failure)).toMatch(
        /lock timeout|statement timeout|socket timeout|timed out/i,
      );
      expect(elapsedMilliseconds).toBeLessThan(
        (recoveryContract.DROP_TIMEOUT_SECONDS + 5) * 1000,
      );
      expect((await existingDatabaseNames(maintenance)).has(blocked)).toBe(true);

      releaseCatalogLock();
      await catalogLockTransaction;
      await recoveryContract.recoverStaleClones(
        maintenance,
        maintenanceDatabaseUrl,
        '',
        sourceDatabaseName,
      );
      expect((await existingDatabaseNames(maintenance)).has(blocked)).toBe(false);
    } finally {
      releaseCatalogLock();
      await cleanupBlockedDropTest(
        blocker,
        catalogLockTransaction,
        maintenance,
        createdNames,
      );
    }
  });
});

function quoteTestIdentifier(identifier: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error('Test database identifier contains unsupported characters.');
  }
  return `"${identifier}"`;
}

function databaseUrlForName(maintenanceDatabaseUrl: string, databaseName: string): string {
  const url = new URL(maintenanceDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function existingDatabaseNames(maintenance: PrismaClient): Promise<Set<string>> {
  const rows = await maintenance.$queryRaw<Array<{ datname: string }>>`
    SELECT datname FROM pg_database
  `;
  return new Set(rows.map((row) => row.datname));
}

async function dropCreatedDatabases(
  maintenance: PrismaClient,
  createdNames: string[],
): Promise<void> {
  const existing = await existingDatabaseNames(maintenance);
  for (const databaseName of createdNames.reverse()) {
    if (existing.has(databaseName)) {
      await maintenance.$executeRawUnsafe(
        `DROP DATABASE ${quoteTestIdentifier(databaseName)} WITH (FORCE)`,
      );
    }
  }
}

async function cleanupRecoveryTest(
  maintenance: PrismaClient,
  createdNames: string[],
  liveLease?: PrismaClient,
): Promise<void> {
  const errors: unknown[] = [];
  try {
    await liveLease?.$disconnect();
  } catch (error) {
    errors.push(error);
  }
  try {
    await dropCreatedDatabases(maintenance, createdNames);
  } catch (error) {
    errors.push(error);
  }
  try {
    await maintenance.$disconnect();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Integration recovery contract cleanup failed.');
  }
}

async function captureFailure(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected integration database recovery to fail.');
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function cleanupBlockedDropTest(
  blocker: PrismaClient,
  catalogLockTransaction: Promise<unknown> | undefined,
  maintenance: PrismaClient,
  createdNames: string[],
): Promise<void> {
  const errors: unknown[] = [];
  try {
    await catalogLockTransaction;
  } catch (error) {
    errors.push(error);
  }
  try {
    await blocker.$disconnect();
  } catch (error) {
    errors.push(error);
  }
  try {
    await cleanupRecoveryTest(maintenance, createdNames);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Blocked DROP contract cleanup failed.');
  }
}
