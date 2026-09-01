import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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

/**
 * `test/` 아래의 통합 스펙 파일을 **접미사로** 모은다.
 *
 * `testMatch` 글롭을 해석하지 않는 이유는 위 계약 주석에 있다 — 재구현이 틀리면 스펙이
 * 거짓 판정을 낸다. 접미사는 config 의 두 패턴이 공통으로 요구하는 것이고, 위치 조건
 * (e2e 는 `test/integration/` 아래여야 한다)은 별도 테스트가 따로 못박는다.
 */
function collectSpecFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSpecFiles(full));
    } else if (full.endsWith('.integration-spec.ts') || full.endsWith('.e2e-spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

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
      configs: Array<{
        displayName: { name: string };
        testEnvironment: string;
        testPathIgnorePatterns?: string[];
      }>;
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
    /**
     * **목록을 적지 않는다 — 디스크와 config 로 만든다.**
     *
     * 예전에는 여기에 경로 79 개가 박혀 있었고, 그래서 **낡아 있었다**: `jest --listTests`
     * 는 89 개를 고르는데 목록은 79 개라 10 건(리그 통합 스펙들)이 빠져 있었다. 새 스펙을
     * 추가할 때마다 사람이 이 목록을 같이 고쳐야 하는 구조였기 때문이다.
     *
     * `jest.config.ts` 는 같은 문제를 이미 겪고 **글롭 한 줄**로 바꿨다(그 파일 주석:
     * *"등록을 사람이 기억해야 하는 구조가 남아 있으면 같은 사고가 이름만 바꿔 반복된다"*).
     * **그걸 검사하는 이 스펙만 열거로 남아 있었다.** 같은 원칙을 여기에도 적용한다.
     *
     * ## 글롭을 다시 구현하지 않는다
     * `testMatch` 패턴을 이 파일에서 해석하면 **그 재구현이 틀릴 수 있고**, 그러면 스펙이
     * 거짓 red/green 을 낸다. 대신 **파일 접미사**로 디스크를 훑고, 제외는 config 가 실제로
     * 쓰는 `testPathIgnorePatterns` 를 그대로 적용한다 — 판단 기준을 우리가 만들지 않는다.
     *
     * 이렇게 하면 보호가 **더 강해진다**: 예전 목록은 새 파일을 추가하면서 목록도 같이
     * 고치면 통과했지만, 지금은 config 글롭이 파일을 놓치는 순간 red 다.
     */
    const integrationConfig = shown.configs.find((project) => project.displayName.name === 'integration');
    const ignorePatterns = (integrationConfig?.testPathIgnorePatterns ?? []).map(
      (pattern) => new RegExp(pattern),
    );
    const isIgnored = (absPath: string) => ignorePatterns.some((re) => re.test(absPath));

    /* ⚠️ `testPathIgnorePatterns` 는 **두 확장자 모두**에 걸린다 — jest 는 `testMatch` 로 찾은
       뒤 확장자와 무관하게 거른다(실측: e2e 하나를 ignore 에 넣으면 89→88). 한쪽에만 걸면
       누가 e2e 를 ignore 에 넣는 순간 **거짓 red** 가 난다(config 는 빼는데 기대값은 포함).
       이 저장소에서 *"두 확장자가 한 프로젝트에 있다"* 를 놓친 게 이번이 세 번째다. */
    const expected = collectSpecFiles(resolve(apiRoot, 'test'))
      .filter((absPath) => !isIgnored(absPath))
      .map((absPath) => relative(apiRoot, absPath).replaceAll('\\', '/'))
      .sort();

    expect(
      listed.map((testPath) => relative(apiRoot, testPath).replaceAll('\\', '/')).sort(),
    ).toEqual(expected);

    /* 개수는 고정하지 않는다 — 스펙이 늘고 주는 것은 정상이고, 절대 수를 박으면 그 변화마다
       무관한 red 가 난다. 본 계약은 위 `toEqual`(두 집합이 같다)이고, 여기서 막을 것은
       **양쪽이 동시에 비어 통과하는 경우** 하나뿐이다. */
    expect(expected.length).toBeGreaterThan(0);
  });

  /**
   * `e2e-spec` 은 **`test/integration/` 아래에만** 둔다 — config 의 두 번째 글롭이
   * `test/integration/**` 로 한정돼 있어서, 다른 디렉터리에 두면 **조용히 안 돌아간다.**
   * 위 계약은 "선택된 것 == 디스크에서 기대한 것" 을 보므로 이 위치 규칙을 못 잡는다
   * (기대값도 같이 틀리기 때문이다). 그래서 별도로 못박는다.
   */
  it('keeps every e2e-spec under test/integration so the config glob can see it', () => {
    const strays = collectSpecFiles(resolve(apiRoot, 'test'))
      .filter((f) => f.endsWith('.e2e-spec.ts'))
      .map((f) => relative(apiRoot, f).replaceAll('\\', '/'))
      .filter((f) => !f.startsWith('test/integration/'));

    expect(strays).toEqual([]);
  });

  /**
   * `testPathIgnorePatterns` 는 config 주석이 *"고쳐야 할 빚 목록"* 이라고 못박은 자리다.
   * 가리키는 파일이 사라지면 그 항목은 **죽은 제외**가 되고, 죽은 채로 남으면 다음 사람이
   * "아직 빚이 있다" 고 잘못 읽는다. 각 패턴이 실제 파일을 하나 이상 가리키는지 본다.
   */
  it('keeps every integration ignore pattern pointing at a file that exists', () => {
    const shown = JSON.parse(
      runJestResolver('--selectProjects', 'integration', '--runInBand', '--showConfig', '--json'),
    ) as { configs: Array<{ displayName: { name: string }; testPathIgnorePatterns?: string[] }> };
    const patterns =
      shown.configs.find((project) => project.displayName.name === 'integration')
        ?.testPathIgnorePatterns ?? [];
    const onDisk = collectSpecFiles(resolve(apiRoot, 'test'));

    expect(patterns.length).toBeGreaterThan(0);
    const dead = patterns.filter((pattern) => !onDisk.some((f) => new RegExp(pattern).test(f)));
    expect(dead).toEqual([]);
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
