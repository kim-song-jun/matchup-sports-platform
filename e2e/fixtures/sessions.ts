import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { injectTokens, loginViaApi } from './auth';
import { WEB_BASE } from './test-users';

export interface AuthenticatedSession {
  context: BrowserContext;
  page: Page;
  nickname: string;
}

async function visitAndStabilize(page: Page, path: string) {
  await page.goto(`${WEB_BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}

export async function createAuthenticatedSession(
  browser: Browser,
  nickname: string,
  path = '/home',
): Promise<AuthenticatedSession> {
  const tokens = await loginViaApi(nickname);
  const context = await browser.newContext();
  const page = await context.newPage();

  await visitAndStabilize(page, '/');
  await injectTokens(page, tokens);
  await visitAndStabilize(page, path);

  return { context, page, nickname };
}

export async function openSiblingTab(session: AuthenticatedSession, path: string) {
  const page = await session.context.newPage();
  await visitAndStabilize(page, path);
  return page;
}

export async function expectLoginRedirectOrLink(page: Page) {
  try {
    await page.waitForURL(/\/login/, { timeout: 5_000 });
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 5_000 });
    return;
  } catch {
    const canonicalAuthWall = page
      .locator('[data-testid="auth-wall"]:visible, [data-testid="admin-auth-wall"]:visible')
      .first();
    if ((await canonicalAuthWall.count()) > 0) {
      await expect(canonicalAuthWall).toBeVisible({ timeout: 5_000 });
    }

    const visibleLoginCta = page
      .locator('[data-testid="auth-wall-login-link"]:visible, a[href="/login"]:visible')
      .first();
    await expect(visibleLoginCta).toBeVisible({ timeout: 5_000 });
  }
}

export async function closeSessions(sessions: Array<AuthenticatedSession | null | undefined>) {
  await Promise.all(
    sessions
      .filter((session): session is AuthenticatedSession => !!session)
      .map(async (session) => session.context.close()),
  );
}
