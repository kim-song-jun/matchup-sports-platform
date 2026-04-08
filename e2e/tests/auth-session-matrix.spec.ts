import { test, expect } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import {
  closeSessions,
  createAuthenticatedSession,
  expectLoginRedirectOrLink,
  openSiblingTab,
} from '../fixtures/sessions';

const SINARO = TEST_PERSONAS.sinaro.nickname;
const ADMIN = TEST_PERSONAS.admin.nickname;

test.describe('Auth session matrix', () => {
  test('AUTH-001 keeps session across reload and sibling tab', async ({ browser }) => {
    const session = await createAuthenticatedSession(browser, SINARO, '/matches');

    try {
      await expect(session.page).toHaveURL(/\/matches/);
      await expect(session.page.locator('main:visible').first()).toBeVisible();

      await session.page.reload();
      await session.page.waitForLoadState('domcontentloaded');
      await session.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await expect(session.page.locator('main:visible').first()).toBeVisible();

      const profileTab = await openSiblingTab(session, '/profile');
      await expect(profileTab).toHaveURL(/\/profile/);
      await expect(profileTab.locator('main:visible').first()).toBeVisible();
    } finally {
      await closeSessions([session]);
    }
  });

  for (const route of ['/my/teams', '/my/mercenary', '/profile', '/chat', '/notifications']) {
    test(`AUTH-002 blocks unauthenticated access for ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expectLoginRedirectOrLink(page);
    });
  }

  test('AUTH-003 allows admin and blocks regular user on /admin/dashboard', async ({ browser }) => {
    const regularSession = await createAuthenticatedSession(browser, SINARO, '/matches');
    const adminSession = await createAuthenticatedSession(browser, ADMIN, '/matches');

    try {
      await regularSession.page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
      await regularSession.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

      if (/\/home(?:\?|$)/.test(regularSession.page.url())) {
        await expect(regularSession.page).toHaveURL(/\/home/);
      } else {
        await expect(regularSession.page.getByTestId('admin-auth-wall')).toBeVisible();
      }

      await adminSession.page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
      await adminSession.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await expect(adminSession.page).toHaveURL(/\/admin\/dashboard/);
      await expect(adminSession.page.getByText('TeamMeet Admin')).toBeVisible();
    } finally {
      await closeSessions([regularSession, adminSession]);
    }
  });
});
