import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'docker-compose.e2e.yml');
const RUNS_ROOT = path.join(REPO_ROOT, 'tmp', 'e2e-runs');
const CLAIMS_ROOT = path.join(RUNS_ROOT, 'port-claims');
const RUN_LOCKS_ROOT = path.join(RUNS_ROOT, 'run-locks');
const DEFAULT_WEB_PORT_START = 13003;
const DEFAULT_API_PORT_START = 18111;
const PORT_SEARCH_SPAN = 1000;
const READY_WAIT_ATTEMPTS = 180;
const DEFAULT_POSTGRES_DB = 'matchup_dev';
const DEFAULT_POSTGRES_USER = 'matchup_user';

class CommandFailure extends Error {
  constructor(command, args, exitCode) {
    super(`${command} ${args.join(' ')} exited with code ${exitCode}`);
    this.exitCode = exitCode;
  }
}

function usage() {
  console.error(`Usage:
  node scripts/qa/run-e2e-isolated.mjs up <run-id>
  node scripts/qa/run-e2e-isolated.mjs run <run-id> -- <playwright args...>
  node scripts/qa/run-e2e-isolated.mjs down <run-id>
  node scripts/qa/run-e2e-isolated.mjs env <run-id>`);
  process.exit(1);
}

function sanitizeRunId(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[-_]+$/, '')
    .replace(/-{2,}/g, '-');

  if (!normalized) {
    throw new Error('run-id must contain at least one lowercase letter or digit after sanitization');
  }

  return normalized;
}

function runDir(runId) {
  return path.join(RUNS_ROOT, runId);
}

function metadataPath(runId) {
  return path.join(runDir(runId), 'metadata.json');
}

function authDir(runId) {
  return path.join(runDir(runId), 'auth');
}

function artifactsDir(runId) {
  return path.join(runDir(runId), 'artifacts');
}

function claimPath(port) {
  return path.join(CLAIMS_ROOT, `${port}.json`);
}

function runLockPath(runId) {
  return path.join(RUN_LOCKS_ROOT, `${runId}.json`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function readMetadata(runId) {
  return readJson(metadataPath(runId));
}

function writeMetadata(runId, data) {
  ensureDir(runDir(runId));
  fs.writeFileSync(metadataPath(runId), JSON.stringify(data, null, 2), 'utf-8');
}

function readPortClaim(port) {
  try {
    return readJson(claimPath(port));
  } catch {
    return { port, runId: null };
  }
}

function readRunLock(runId) {
  try {
    return readJson(runLockPath(runId));
  } catch {
    return { runId, pid: null };
  }
}

function composeProjectName(runId) {
  return `matchup-e2e-${runId}`;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'EPERM') {
      return true;
    }
    if (error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

function acquireRunLock(runId) {
  ensureDir(RUN_LOCKS_ROOT);
  const filePath = runLockPath(runId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(filePath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({
        runId,
        pid: process.pid,
        claimedAt: new Date().toISOString(),
      }, null, 2), 'utf-8');
      fs.closeSync(fd);
      return () => {
        fs.rmSync(filePath, { force: true });
      };
    } catch (error) {
      if (!(error && error.code === 'EEXIST')) {
        throw error;
      }

      const existing = readRunLock(runId);
      if (existing?.pid && isProcessAlive(existing.pid)) {
        throw new Error(
          `run-id "${runId}" is already in use by pid ${existing.pid}. Wait for that command to finish or choose a different RUN.`,
        );
      }

      fs.rmSync(filePath, { force: true });
    }
  }

  throw new Error(`Could not acquire run lock for ${runId}`);
}

function spawnOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new CommandFailure(command, args, result.status ?? 1);
  }
}

function isPortBoundOnHost(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  });
  // If lsof is missing (ENOENT), assume the port is bound to avoid
  // incorrectly reclaiming an active port on minimal Linux environments.
  if (result.error) {
    return true;
  }
  return result.status === 0;
}

function isPortFree(port) {
  if (isPortBoundOnHost(port)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function stablePortOffset(runId) {
  let hash = 0;
  for (const char of runId) {
    hash = ((hash * 31) + char.charCodeAt(0)) % PORT_SEARCH_SPAN;
  }
  return hash;
}

function tryClaimPort(port, runId) {
  ensureDir(CLAIMS_ROOT);
  const filePath = claimPath(port);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(filePath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({
        port,
        runId,
        claimedAt: new Date().toISOString(),
      }, null, 2), 'utf-8');
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if (!(error && error.code === 'EEXIST')) {
        throw error;
      }

      const existing = readPortClaim(port);
      if (existing?.runId === runId) {
        return true;
      }

      // Stale claim recovery: if nothing is actually listening on this port,
      // the claim is leftover from a crashed run — reclaim it.
      if (attempt === 0 && !isPortBoundOnHost(port)) {
        console.log(`[run-e2e-isolated] reclaimed stale port ${port} (was ${existing?.runId ?? 'unknown'})`);
        fs.rmSync(filePath, { force: true });
        continue;
      }

      return false;
    }
  }

  return false;
}

function releasePortClaim(port, runId) {
  const filePath = claimPath(port);
  const existing = readPortClaim(port);
  if (existing && existing.runId !== runId) {
    return;
  }
  fs.rmSync(filePath, { force: true });
}

function releasePortClaims(metadata) {
  releasePortClaim(metadata.webPort, metadata.runId);
  releasePortClaim(metadata.apiPort, metadata.runId);
}

function parsePortEnv(name) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return null;
  }

  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return port;
}

async function claimPortPair(runId) {
  const requestedWebPort = parsePortEnv('PLAYWRIGHT_WEB_PORT');
  const requestedApiPort = parsePortEnv('PLAYWRIGHT_API_PORT');
  if ((requestedWebPort && !requestedApiPort) || (!requestedWebPort && requestedApiPort)) {
    throw new Error('PLAYWRIGHT_WEB_PORT and PLAYWRIGHT_API_PORT must be set together');
  }

  if (requestedWebPort && requestedApiPort) {
    if (requestedWebPort === requestedApiPort) {
      throw new Error('PLAYWRIGHT_WEB_PORT and PLAYWRIGHT_API_PORT must be different');
    }

    const claimedWeb = tryClaimPort(requestedWebPort, runId);
    const claimedApi = claimedWeb ? tryClaimPort(requestedApiPort, runId) : false;
    if (!claimedWeb || !claimedApi) {
      if (claimedWeb) {
        releasePortClaim(requestedWebPort, runId);
      }
      if (claimedApi) {
        releasePortClaim(requestedApiPort, runId);
      }
      throw new Error('Requested ports are already claimed by another isolated run');
    }

    const [webFree, apiFree] = await Promise.all([
      isPortFree(requestedWebPort),
      isPortFree(requestedApiPort),
    ]);
    if (!webFree || !apiFree) {
      releasePortClaim(requestedWebPort, runId);
      releasePortClaim(requestedApiPort, runId);
      throw new Error('Requested ports are already in use on the host');
    }

    return {
      webPort: requestedWebPort,
      apiPort: requestedApiPort,
    };
  }

  const offset = stablePortOffset(runId);
  for (let attempt = 0; attempt < PORT_SEARCH_SPAN; attempt += 1) {
    const index = (offset + attempt) % PORT_SEARCH_SPAN;
    const webPort = DEFAULT_WEB_PORT_START + index;
    const apiPort = DEFAULT_API_PORT_START + index;

    if (!tryClaimPort(webPort, runId)) {
      continue;
    }

    if (!tryClaimPort(apiPort, runId)) {
      releasePortClaim(webPort, runId);
      continue;
    }

    const [webFree, apiFree] = await Promise.all([
      isPortFree(webPort),
      isPortFree(apiPort),
    ]);
    if (webFree && apiFree) {
      return { webPort, apiPort };
    }

    releasePortClaim(webPort, runId);
    releasePortClaim(apiPort, runId);
  }

  throw new Error(`Could not claim an isolated web/api port pair for run ${runId}`);
}

async function waitForUrl(url, label) {
  for (let attempt = 1; attempt <= READY_WAIT_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait for the runtime to come up.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

function runtimeEnv(metadata) {
  return {
    ...process.env,
    PLAYWRIGHT_WEB_PORT: String(metadata.webPort),
    PLAYWRIGHT_API_PORT: String(metadata.apiPort),
    PLAYWRIGHT_POSTGRES_DB: metadata.postgresDb,
    PLAYWRIGHT_POSTGRES_USER: metadata.postgresUser ?? DEFAULT_POSTGRES_USER,
    E2E_RUN_ID: metadata.runId,
    E2E_WEB_BASE: `http://localhost:${metadata.webPort}`,
    E2E_API_BASE: `http://localhost:${metadata.apiPort}`,
    E2E_AUTH_DIR: metadata.authDir,
    E2E_DOCKER_PROJECT_NAME: metadata.composeProjectName,
    E2E_DOCKER_COMPOSE_FILE: COMPOSE_FILE,
    E2E_DOCKER_POSTGRES_SERVICE: 'postgres',
    E2E_DOCKER_POSTGRES_DB: metadata.postgresDb,
    E2E_DOCKER_POSTGRES_USER: metadata.postgresUser ?? DEFAULT_POSTGRES_USER,
    PW_SKIP_WEBSERVER: '1',
    PLAYWRIGHT_REPORTER: process.env.PLAYWRIGHT_REPORTER ?? 'line',
    PLAYWRIGHT_OUTPUT_DIR: path.join(metadata.artifactsDir, 'test-results'),
    PLAYWRIGHT_HTML_REPORT_DIR: path.join(metadata.artifactsDir, 'playwright-report'),
  };
}

async function ensureMetadata(runId) {
  const existing = readMetadata(runId);
  if (existing) {
    return existing;
  }

  const { webPort, apiPort } = await claimPortPair(runId);
  const postgresDb = process.env.PLAYWRIGHT_POSTGRES_DB ?? DEFAULT_POSTGRES_DB;
  const postgresUser = process.env.PLAYWRIGHT_POSTGRES_USER ?? DEFAULT_POSTGRES_USER;

  const metadata = {
    runId,
    composeProjectName: composeProjectName(runId),
    webPort,
    apiPort,
    postgresDb,
    postgresUser,
    authDir: authDir(runId),
    artifactsDir: artifactsDir(runId),
  };

  ensureDir(metadata.authDir);
  ensureDir(metadata.artifactsDir);
  writeMetadata(runId, metadata);
  return metadata;
}

function cleanupFailedRun(metadata) {
  const env = runtimeEnv(metadata);
  spawnSync('docker', [
    'compose',
    '-f',
    COMPOSE_FILE,
    '-p',
    metadata.composeProjectName,
    'down',
    '-v',
    '--remove-orphans',
  ], {
    cwd: REPO_ROOT,
    env,
    stdio: 'ignore',
  });
  releasePortClaims(metadata);
  fs.rmSync(runDir(metadata.runId), { recursive: true, force: true });
}

async function up(runId) {
  const metadata = await ensureMetadata(runId);
  const env = runtimeEnv(metadata);

  try {
    spawnOrThrow('docker', [
      'compose',
      '-f',
      COMPOSE_FILE,
      '-p',
      metadata.composeProjectName,
      'up',
      '-d',
      '--build',
    ], { env });

    await waitForUrl(`${env.E2E_API_BASE}/api/v1/health`, 'isolated API health');
    await waitForUrl(`${env.E2E_WEB_BASE}/landing`, 'isolated web landing page');
    console.log(`[run-e2e-isolated] ready: ${runId} web=${env.E2E_WEB_BASE} api=${env.E2E_API_BASE}`);
  } catch (error) {
    cleanupFailedRun(metadata);
    throw error;
  }
}

async function run(runId, playwrightArgs) {
  await up(runId);
  const metadata = readMetadata(runId);
  if (!metadata) {
    throw new Error(`missing metadata for run ${runId} after startup`);
  }
  const env = runtimeEnv(metadata);

  spawnOrThrow('pnpm', [
    'exec',
    'playwright',
    'test',
    '--config=e2e/playwright.config.ts',
    ...playwrightArgs,
  ], { env });
}

async function down(runId) {
  const metadata = readMetadata(runId);
  if (!metadata) {
    console.log(`[run-e2e-isolated] no metadata found for ${runId}`);
    return;
  }

  const env = runtimeEnv(metadata);
  spawnOrThrow('docker', [
    'compose',
    '-f',
    COMPOSE_FILE,
    '-p',
    metadata.composeProjectName,
    'down',
    '-v',
    '--remove-orphans',
  ], { env });

  releasePortClaims(metadata);
  fs.rmSync(runDir(runId), { recursive: true, force: true });
  console.log(`[run-e2e-isolated] removed run ${runId}`);
}

async function printEnv(runId) {
  const metadata = readMetadata(runId);
  if (!metadata) {
    console.log(JSON.stringify({
      initialized: false,
      runId,
      composeProjectName: composeProjectName(runId),
      authDir: authDir(runId),
      outputDir: path.join(artifactsDir(runId), 'test-results'),
    }, null, 2));
    return;
  }

  const env = runtimeEnv(metadata);
  console.log(JSON.stringify({
    initialized: true,
    runId,
    composeProjectName: metadata.composeProjectName,
    webBase: env.E2E_WEB_BASE,
    apiBase: env.E2E_API_BASE,
    authDir: env.E2E_AUTH_DIR,
    outputDir: env.PLAYWRIGHT_OUTPUT_DIR,
  }, null, 2));
}

async function main() {
  const [, , command, rawRunId, ...rest] = process.argv;
  if (!command || !rawRunId) {
    usage();
  }

  if (!['up', 'run', 'down', 'env'].includes(command)) {
    usage();
  }

  const runId = sanitizeRunId(rawRunId);

  // env is preview-only — no lock, no resource creation
  if (command === 'env') {
    await printEnv(runId);
    return;
  }

  const releaseRunLock = acquireRunLock(runId);
  const separatorIndex = rest.indexOf('--');
  const playwrightArgs = separatorIndex >= 0 ? rest.slice(separatorIndex + 1) : rest;

  try {
    if (command === 'up') {
      await up(runId);
      return;
    }

    if (command === 'run') {
      await run(runId, playwrightArgs);
      return;
    }

    if (command === 'down') {
      await down(runId);
      return;
    }
  } finally {
    releaseRunLock();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[run-e2e-isolated] ${message}`);
  process.exit(error.exitCode ?? 1);
});
