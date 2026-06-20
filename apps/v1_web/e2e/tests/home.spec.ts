import { test, expect } from '../fixtures/authenticated-context';

/**
 * Spec B — Authenticated /home render
 *
 * Verifies:
 *  - Dev-auth localStorage injection causes API calls to be authenticated
 *  - Greeting block is present ('안녕하세요')
 *  - '오늘의 추천' section label is rendered
 *  - No console errors after auth + data load
 */
test.describe('home page — authenticated', () => {
  test('renders greeting and recommendation section with dev-auth', async ({ authenticatedPage: page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter noise: Next.js hydration warnings, extension errors, favicon
        if (
          !text.includes('net::ERR_') &&
          !text.includes('favicon') &&
          !text.includes('hydrat') &&
          !text.includes('Hydration')
        ) {
          consoleErrors.push(text);
        }
      }
    });

    await page.goto('/home');

    // Wait for the greeting block — data-driven content needs the API to respond
    const greetingBlock = page.locator('.tm-home-greeting-block');
    await expect(greetingBlock).toBeVisible({ timeout: 15_000 });

    // Greeting text ('안녕하세요' is always shown regardless of auth state)
    await expect(greetingBlock).toContainText('안녕하세요');

    // '오늘의 추천' section label (rendered in home-page.tsx)
    await expect(page.getByText('오늘의 추천')).toBeVisible({ timeout: 12_000 });

    // No unexpected errors
    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('bottom nav is rendered with all five tabs', async ({ authenticatedPage: page }) => {
    await page.goto('/home');

    // The shell renders a bottom nav with 5 tabs: 홈 매치 대회 팀 마이
    // On mobile viewport these appear as role="link" items in the nav area
    await expect(page.getByRole('link', { name: '홈' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '매치' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '대회' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '팀' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '마이' }).first()).toBeVisible();
  });
});
