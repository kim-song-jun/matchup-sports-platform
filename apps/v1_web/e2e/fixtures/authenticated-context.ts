import { test as base } from '@playwright/test';
import { injectV1DevAuth, V1_TEST_USER } from './auth';

/**
 * Extended test fixture that provides an authenticated browser context.
 * Usage:
 *   import { test } from '../fixtures/authenticated-context';
 *   test('my test', async ({ authenticatedPage }) => { ... });
 */
export const test = base.extend<{
  /** A page with v1 dev-auth pre-injected via localStorage. */
  authenticatedPage: import('@playwright/test').Page;
}>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    await injectV1DevAuth(context, V1_TEST_USER);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
