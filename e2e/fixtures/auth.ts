import { expect, Page } from '@playwright/test';
import { API_BASE } from './test-users';

const DEFAULT_WARMUP_PATH = '/matches';
const AUTH_BOOTSTRAP_PATH = process.env.E2E_AUTH_BOOTSTRAP_PATH ?? DEFAULT_WARMUP_PATH;
const AUTH_RETRY_ATTEMPTS = 6;

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: string, init: RequestInit, label: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AUTH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok) {
        return response;
      }

      const text = await response.text();
      throw new Error(`${label} failed: ${response.status} ${text}`);
    } catch (error) {
      lastError = error;
      if (attempt === AUTH_RETRY_ATTEMPTS) {
        break;
      }

      await waitFor(attempt * 500);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user?: Record<string, unknown>;
}

/** Call dev-login API directly (faster, no browser required). */
export async function loginViaApi(nickname: string): Promise<TokenPair> {
  const res = await fetchWithRetry(`${API_BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  }, `dev-login for "${nickname}"`);
  const body = await res.json() as Record<string, unknown>;
  // API response wrapped in { status, data, timestamp }
  const data = (body.data ?? body) as Record<string, unknown>;
  return {
    accessToken: data.accessToken as string,
    refreshToken: data.refreshToken as string,
    user: (data.user as Record<string, unknown> | undefined) ?? undefined,
  };
}

/**
 * Inject tokens into localStorage so the Next.js app treats the session as
 * authenticated. Call this after page.goto('/') or any page load.
 */
export async function injectTokens(page: Page, tokens: TokenPair): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('accessToken', t.accessToken);
    localStorage.setItem('refreshToken', t.refreshToken);
    if (t.user) {
      localStorage.setItem('authUser', JSON.stringify(t.user));
    }
  }, tokens);
}

async function waitForSettledPage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}

async function navigateToHomeWithinWarmShell(page: Page): Promise<boolean> {
  const homeCandidates = [
    page.locator('aside a[href="/home"]:visible').first(),
    page.locator('[data-testid="bottom-nav-home"]:visible').first(),
    page.locator('a[href="/home"]:visible').first(),
  ];

  for (const candidate of homeCandidates) {
    const isVisible = await candidate.isVisible().catch(() => false);
    if (!isVisible) continue;

    try {
      await Promise.all([
        page.waitForURL(/\/home(?:\?|$)/, {
          timeout: 20_000,
          waitUntil: 'commit',
        }),
        candidate.click(),
      ]);
      await page.locator('main:visible').first().waitFor({
        state: 'visible',
        timeout: 30_000,
      });
      await page.waitForTimeout(300);
      return true;
    } catch {
      // Fall through to the next visible candidate or direct navigation fallback.
    }
  }

  return false;
}

/**
 * Warm the Next.js dev server on a lighter route before entering a heavier page.
 */
export async function gotoWithWarmup(
  page: Page,
  targetPath: string,
  warmupPath = DEFAULT_WARMUP_PATH,
): Promise<void> {
  if (targetPath !== warmupPath) {
    await page.goto(warmupPath, { waitUntil: 'domcontentloaded' });
    await waitForSettledPage(page);
  }

  if (targetPath === '/home' && await navigateToHomeWithinWarmShell(page)) {
    return;
  }

  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  await waitForSettledPage(page);
}

/**
 * Full auth setup: warm the dev server on a lighter protected route so the app
 * picks up the authenticated state before route-specific assertions run.
 */
export async function setupAuthState(page: Page, nickname: string): Promise<void> {
  const tokens = await loginViaApi(nickname);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await injectTokens(page, tokens);
  await gotoWithWarmup(page, AUTH_BOOTSTRAP_PATH);
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(AUTH_BOOTSTRAP_PATH)}(?:\\?|$)`), {
    timeout: 20_000,
  });
  await page.locator('main:visible').first().waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Drive through the dev-login UI (for UI flow tests).
 * Fills the nickname input in the bottom dev panel and clicks "입장".
 */
export async function loginAsPersonaViaUI(page: Page, nickname: string): Promise<void> {
  await page.goto('/login');
  const devInput = page.getByLabel('테스트 닉네임');
  await devInput.waitFor({ state: 'visible', timeout: 10_000 });
  await devInput.fill(nickname);
  await page.getByRole('button', { name: '입장' }).click();
  await page.waitForURL(/\/home/, { timeout: 15_000 });
}
