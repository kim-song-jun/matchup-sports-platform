import { Page } from '@playwright/test';
import { API_BASE } from './test-users';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
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
  return { accessToken: data.accessToken as string, refreshToken: data.refreshToken as string };
}

/**
 * Inject tokens into localStorage so the Next.js app treats the session as
 * authenticated. Call this after page.goto('/') or any page load.
 */
export async function injectTokens(page: Page, tokens: TokenPair): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('accessToken', t.accessToken);
    localStorage.setItem('refreshToken', t.refreshToken);
  }, tokens);
}

/**
 * Full auth setup: navigate to home, inject tokens, then reload so React Query
 * picks up the auth state.
 */
export async function setupAuthState(page: Page, nickname: string): Promise<void> {
  const tokens = await loginViaApi(nickname);
  await page.goto('/');
  await injectTokens(page, tokens);
  await page.goto('/home');
  await page.waitForLoadState('networkidle');
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
