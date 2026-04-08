import { expect, Page } from '@playwright/test';
import { API_BASE } from './test-users';

const DEFAULT_WARMUP_PATH = '/matches';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user?: Record<string, unknown>;
}

/** Call dev-login API directly (faster, no browser required). */
export async function loginViaApi(nickname: string): Promise<TokenPair> {
  const res = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) {
    throw new Error(`dev-login failed for "${nickname}": ${res.status} ${await res.text()}`);
  }
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
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  }

  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}

/**
 * Full auth setup: warm the dev server, inject tokens, then enter /home so the
 * app picks up the authenticated state.
 */
export async function setupAuthState(page: Page, nickname: string): Promise<void> {
  const tokens = await loginViaApi(nickname);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectTokens(page, tokens);
  await gotoWithWarmup(page, '/home');
  const authHeading = page.locator('h1:visible').filter({ hasText: nickname });
  await expect(authHeading.first()).toBeVisible({ timeout: 10_000 });
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
