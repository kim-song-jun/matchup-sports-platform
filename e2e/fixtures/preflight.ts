import { API_BASE, TEST_PERSONAS, WEB_BASE } from './test-users';
import { checkDockerPostgresReady } from './db-runtime';
import { E2E_DOCKER_PROJECT_NAME } from './runtime';

interface PreflightOptions {
  allowOffline: boolean;
  requireDockerPostgres: boolean;
}

async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkWebReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${WEB_BASE}/login`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkDevLogin(): Promise<boolean> {
  try {
    const nickname = TEST_PERSONAS.sinaro.nickname;
    const res = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runE2EPreflight(options: PreflightOptions): Promise<void> {
  const checks = await Promise.all([
    checkApiHealth(),
    checkWebReachable(),
    checkDevLogin(),
  ]);
  const dbRuntime = checkDockerPostgresReady();

  const [apiOk, webOk, devLoginOk] = checks;
  const failedChecks: string[] = [];
  if (!apiOk) failedChecks.push(`API health (${API_BASE}/api/v1/health)`);
  if (!webOk) failedChecks.push(`Web reachability (${WEB_BASE}/login)`);
  if (!devLoginOk) failedChecks.push('dev-login API');
  if (options.requireDockerPostgres && !dbRuntime.ok) {
    failedChecks.push(`docker compose postgres runtime (${dbRuntime.detail ?? 'not ready'})`);
  }

  if (failedChecks.length === 0) {
    if (dbRuntime.ok) {
      console.log('[preflight] OK: API/Web/dev-login/docker-postgres are ready.');
    } else {
      console.log('[preflight] OK: API/Web/dev-login are ready. Docker postgres checks are optional for this run.');
    }
    return;
  }

  const message = `[preflight] Failed checks: ${failedChecks.join(', ')}`;
  if (options.allowOffline) {
    console.warn(`${message} (continuing due to E2E_ALLOW_OFFLINE=1)`);
    return;
  }

  const dockerHint = options.requireDockerPostgres
    ? ` The current Playwright harness expects a Docker compose postgres runtime${E2E_DOCKER_PROJECT_NAME ? ` for project "${E2E_DOCKER_PROJECT_NAME}"` : ''}.`
    : '';

  throw new Error(
    `${message}.${dockerHint} Fix runtime or run with E2E_ALLOW_OFFLINE=1 for offline debug.`,
  );
}
