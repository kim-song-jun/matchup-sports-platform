const { createHash } = require('node:crypto');
const NodeEnvironment = require('jest-environment-node').TestEnvironment;
const { PrismaClient } = require('@prisma/client');

const APPROVED_DATABASE_NAME = /^(?:v1_migrate_check|ulw_v1_integration_[a-zA-Z0-9_-]+)$/;
const CLONE_PREFIX = 'ulw_v1_integration_jest_v1_';
const CLONE_NAME = /^ulw_v1_integration_jest_v1_(\d{10})_(\d+)_([a-f0-9]{12})$/;
const RECOVERY_LOCK_KEYS = [782_091, 9];
const STALE_AFTER_SECONDS = 300;
const MAX_RECOVERY_SCAN = 32;
const MAX_RECOVERY_DROPS = 8;
const RECOVERY_TRANSACTION_TIMEOUT_MS = 15_000;
const DROP_TIMEOUT_SECONDS = 5;
const DROP_TIMEOUT_MILLISECONDS = DROP_TIMEOUT_SECONDS * 1000;

class IsolatedIntegrationEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.testPath = context.testPath;
  }

  async setup() {
    await super.setup();

    this.originalDatabaseUrl = process.env.DATABASE_URL;
    const source = parseApprovedDatabaseUrl(this.originalDatabaseUrl);
    this.cloneName = buildCloneName(this.testPath);
    this.maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl(source) });

    try {
      await recoverStaleClones(
        this.maintenance,
        maintenanceUrl(source),
        this.cloneName,
        source.databaseName,
      );
      await this.maintenance.$executeRawUnsafe(
        `CREATE DATABASE ${quoteIdentifier(this.cloneName)} TEMPLATE ${quoteIdentifier(source.databaseName)}`,
      );
      this.cloneCreated = true;

      const cloneUrl = new URL(source.url);
      cloneUrl.pathname = `/${this.cloneName}`;
      this.cloneLease = new PrismaClient({ datasourceUrl: cloneUrl.toString() });
      await this.cloneLease.$connect();
      process.env.DATABASE_URL = cloneUrl.toString();
      this.global.process.env.DATABASE_URL = cloneUrl.toString();
    } catch (setupError) {
      const cleanupErrors = await this.cleanupClone();
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [setupError, ...cleanupErrors],
          'Integration database isolation setup and cleanup both failed.',
        );
      }
      throw setupError;
    }
  }

  async teardown() {
    restoreDatabaseUrl(process.env, this.originalDatabaseUrl);
    restoreDatabaseUrl(this.global.process.env, this.originalDatabaseUrl);

    const cleanupErrors = await this.cleanupClone();
    try {
      await super.teardown();
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Integration database isolation cleanup failed.');
    }
  }

  async cleanupClone() {
    const errors = [];
    if (this.cloneLease) {
      try {
        await this.cloneLease.$disconnect();
      } catch (error) {
        errors.push(error);
      }
      this.cloneLease = undefined;
    }
    if (this.cloneCreated) {
      try {
        await this.maintenance.$executeRawUnsafe(
          `DROP DATABASE ${quoteIdentifier(this.cloneName)} WITH (FORCE)`,
        );
        this.cloneCreated = false;
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.maintenance) {
      try {
        await this.maintenance.$disconnect();
      } catch (error) {
        errors.push(error);
      }
      this.maintenance = undefined;
    }
    return errors;
  }
}

function parseApprovedDatabaseUrl(rawUrl) {
  if (rawUrl === undefined) {
    throw new Error('DATABASE_URL is required for isolated integration suites.');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL must identify an approved isolated database.');
  }

  const hostname = url.hostname === '[::1]' ? '::1' : url.hostname;
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const approvedProtocol = url.protocol === 'postgresql:' || url.protocol === 'postgres:';
  const approvedHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!approvedProtocol || !approvedHost || !APPROVED_DATABASE_NAME.test(databaseName)) {
    throw new Error('DATABASE_URL must identify an approved isolated database.');
  }

  return { databaseName, url };
}

function buildCloneName(testPath) {
  const pathHash = createHash('sha256').update(testPath).digest('hex').slice(0, 12);
  const createdAtSeconds = Math.floor(Date.now() / 1000);
  return `${CLONE_PREFIX}${createdAtSeconds}_${process.pid}_${pathHash}`;
}

async function recoverStaleClones(
  maintenance,
  maintenanceDatabaseUrl,
  currentCloneName,
  sourceDatabaseName,
) {
  const dropper = new PrismaClient({
    datasourceUrl: boundedDropperUrl(maintenanceDatabaseUrl),
  });
  try {
    const timeoutRows = await dropper.$queryRawUnsafe(
      `SELECT
         current_setting('statement_timeout')::interval = interval '5 seconds' AS "statementBound",
         current_setting('lock_timeout')::interval = interval '5 seconds' AS "lockBound"`,
    );
    if (
      timeoutRows.length !== 1 ||
      timeoutRows[0].statementBound !== true ||
      timeoutRows[0].lockBound !== true
    ) {
      throw new Error('Integration database drop timeout settings were not applied.');
    }
    await maintenance.$transaction(
      async (transaction) => {
        const lockRows = await transaction.$queryRawUnsafe(
          'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
          ...RECOVERY_LOCK_KEYS,
        );
        if (lockRows.length !== 1 || lockRows[0].acquired !== true) {
          throw new Error('Integration database recovery lock is already held.');
        }

        const candidates = await transaction.$queryRawUnsafe(
          `SELECT d.datname, COUNT(a.pid)::int AS "activeConnections"
           FROM pg_database d
           LEFT JOIN pg_stat_activity a ON a.datname = d.datname
           WHERE left(d.datname, $1) = $2
           GROUP BY d.datname
           ORDER BY d.datname
           LIMIT ${MAX_RECOVERY_SCAN}`,
          CLONE_PREFIX.length,
          CLONE_PREFIX,
        );
        const staleCloneNames = classifyRecoveryCandidates(
          candidates,
          currentCloneName,
          Math.floor(Date.now() / 1000),
          [sourceDatabaseName],
        );

        for (const cloneName of staleCloneNames) {
          const activityRows = await transaction.$queryRawUnsafe(
            'SELECT COUNT(*)::int AS "activeConnections" FROM pg_stat_activity WHERE datname = $1',
            cloneName,
          );
          if (activityRows.length !== 1 || activityRows[0].activeConnections !== 0) {
            throw new Error(`Integration database recovery candidate became active: ${cloneName}`);
          }
          await dropper.$executeRawUnsafe(`DROP DATABASE ${quoteIdentifier(cloneName)}`);
        }
      },
      { maxWait: RECOVERY_TRANSACTION_TIMEOUT_MS, timeout: RECOVERY_TRANSACTION_TIMEOUT_MS },
    );
  } finally {
    await dropper.$disconnect();
  }
}

function classifyRecoveryCandidates(rows, currentCloneName, nowSeconds, protectedDatabaseNames = []) {
  if (!Array.isArray(rows) || !Number.isInteger(nowSeconds) || nowSeconds < 0) {
    throw new Error('Integration database recovery metadata is malformed.');
  }
  if (
    !Array.isArray(protectedDatabaseNames) ||
    protectedDatabaseNames.some((databaseName) => typeof databaseName !== 'string')
  ) {
    throw new Error('Integration database recovery protection metadata is malformed.');
  }
  const protectedNames = new Set(protectedDatabaseNames);

  const ownedRows = rows.filter((row) => {
    if (row === null || typeof row !== 'object' || typeof row.datname !== 'string') {
      throw new Error('Integration database recovery metadata is malformed.');
    }
    return row.datname.startsWith(CLONE_PREFIX);
  });
  if (ownedRows.length > MAX_RECOVERY_SCAN) {
    throw new Error('Integration database recovery scan limit exceeded.');
  }

  const staleCloneNames = [];
  for (const row of ownedRows) {
    const match = CLONE_NAME.exec(row.datname);
    if (match === null || !Number.isInteger(row.activeConnections) || row.activeConnections < 0) {
      throw new Error(`Integration database recovery metadata is ambiguous: ${row.datname}`);
    }

    const createdAtSeconds = Number(match[1]);
    if (!Number.isSafeInteger(createdAtSeconds) || createdAtSeconds > nowSeconds) {
      throw new Error(`Integration database recovery timestamp is invalid: ${row.datname}`);
    }
    if (
      row.datname !== currentCloneName &&
      !protectedNames.has(row.datname) &&
      row.activeConnections === 0 &&
      nowSeconds - createdAtSeconds >= STALE_AFTER_SECONDS
    ) {
      staleCloneNames.push(row.datname);
    }
  }

  return staleCloneNames.sort().slice(0, MAX_RECOVERY_DROPS);
}

function maintenanceUrl(source) {
  const url = new URL(source.url);
  url.pathname = '/postgres';
  url.searchParams.delete('schema');
  return url.toString();
}

function approvedMaintenanceUrl(rawUrl) {
  return maintenanceUrl(parseApprovedDatabaseUrl(rawUrl));
}

function boundedDropperUrl(maintenanceDatabaseUrl) {
  const url = new URL(maintenanceDatabaseUrl);
  const existingOptions = url.searchParams.get('options');
  const timeoutOptions =
    `-c statement_timeout=${DROP_TIMEOUT_MILLISECONDS} ` +
    `-c lock_timeout=${DROP_TIMEOUT_MILLISECONDS}`;
  url.searchParams.set(
    'options',
    existingOptions === null ? timeoutOptions : `${existingOptions} ${timeoutOptions}`,
  );
  url.searchParams.set('connect_timeout', String(DROP_TIMEOUT_SECONDS));
  url.searchParams.set('pool_timeout', String(DROP_TIMEOUT_SECONDS));
  url.searchParams.set('socket_timeout', String(DROP_TIMEOUT_SECONDS));
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('application_name', 'teameet_task9_stale_clone_recovery');
  return url.toString();
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z0-9_-]+$/.test(identifier)) {
    throw new Error('Integration database identifier contains unsupported characters.');
  }
  return `"${identifier}"`;
}

function restoreDatabaseUrl(environment, value) {
  if (value === undefined) {
    delete environment.DATABASE_URL;
  } else {
    environment.DATABASE_URL = value;
  }
}

module.exports = IsolatedIntegrationEnvironment;
module.exports.recoveryContract = {
  CLONE_PREFIX,
  DROP_TIMEOUT_SECONDS,
  MAX_RECOVERY_DROPS,
  MAX_RECOVERY_SCAN,
  STALE_AFTER_SECONDS,
  approvedMaintenanceUrl,
  boundedDropperUrl,
  classifyRecoveryCandidates,
  recoverStaleClones,
};
