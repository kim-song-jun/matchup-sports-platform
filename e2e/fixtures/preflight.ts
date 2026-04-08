import { API_BASE, TEST_PERSONAS, WEB_BASE } from './test-users';

interface PreflightOptions {
  allowOffline: boolean;
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

  const [apiOk, webOk, devLoginOk] = checks;
  const failedChecks: string[] = [];
  if (!apiOk) failedChecks.push(`API health (${API_BASE}/api/v1/health)`);
  if (!webOk) failedChecks.push(`Web reachability (${WEB_BASE}/login)`);
  if (!devLoginOk) failedChecks.push('dev-login API');

  if (failedChecks.length === 0) {
    console.log('[preflight] OK: API/Web/dev-login are ready.');
    return;
  }

  const message = `[preflight] Failed checks: ${failedChecks.join(', ')}`;
  if (options.allowOffline) {
    console.warn(`${message} (continuing due to E2E_ALLOW_OFFLINE=1)`);
    return;
  }

  throw new Error(`${message}. Fix runtime or run with E2E_ALLOW_OFFLINE=1 for offline debug.`);
}
