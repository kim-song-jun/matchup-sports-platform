import { BrowserContext, Page } from '@playwright/test';

/**
 * Dev-auth credentials for v1 e2e tests.
 * The user `icon.tester` must exist in the v1 DB.
 */
export const V1_TEST_USER = {
  userId: '8e368103-5222-43e4-9efc-6eec0ec2019e',
  userEmail: 'icon.tester.0618@example.com',
} as const;

/** localStorage keys used by apps/v1_web/src/lib/session-storage.ts */
const V1_USER_ID_KEY = 'teameet.v1.userId';
const V1_USER_EMAIL_KEY = 'teameet.v1.userEmail';

/**
 * Injects v1 dev-auth into the browser context via addInitScript.
 * Must be called BEFORE any page.goto() so the script runs on first load.
 */
export async function injectV1DevAuth(
  context: BrowserContext,
  user: typeof V1_TEST_USER = V1_TEST_USER,
): Promise<void> {
  await context.addInitScript(
    ({ userId, userEmail, idKey, emailKey }) => {
      window.localStorage.setItem(idKey, userId);
      window.localStorage.setItem(emailKey, userEmail);
    },
    {
      userId: user.userId,
      userEmail: user.userEmail,
      idKey: V1_USER_ID_KEY,
      emailKey: V1_USER_EMAIL_KEY,
    },
  );
}

/**
 * Inject dev-auth directly into an already-open page (post-load).
 * Useful when you already have a page open and want to set auth for a reload.
 */
export async function injectV1DevAuthOnPage(
  page: Page,
  user: typeof V1_TEST_USER = V1_TEST_USER,
): Promise<void> {
  await page.evaluate(
    ({ userId, userEmail, idKey, emailKey }) => {
      window.localStorage.setItem(idKey, userId);
      window.localStorage.setItem(emailKey, userEmail);
    },
    {
      userId: user.userId,
      userEmail: user.userEmail,
      idKey: V1_USER_ID_KEY,
      emailKey: V1_USER_EMAIL_KEY,
    },
  );
}
