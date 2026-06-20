import { test, expect } from '@playwright/test';

/**
 * Spec A — Unauthenticated /landing render
 *
 * Verifies:
 *  - 'teameet' brand name appears in the top navigation
 *  - Hero section with core copy is visible
 *  - '시작하기' and '로그인' CTAs are present
 *  - No console errors on initial render
 */
test.describe('landing page — unauthenticated', () => {
  test('renders brand, hero copy, and navigation CTAs', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore browser extension noise and known non-critical warnings
        const text = msg.text();
        if (!text.includes('net::ERR_') && !text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });

    await page.goto('/landing');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      // networkidle can be flaky; domcontentloaded is enough
    });

    // Brand name visible in the nav
    const brandLink = page.getByRole('link', { name: /teameet 홈/i });
    await expect(brandLink).toBeVisible();
    // The text node "teameet" also appears directly
    await expect(page.locator('.tm-landing-brand').first()).toContainText('teameet');

    // Hero heading with the core value proposition
    const heroHeading = page.getByRole('heading', { level: 1 });
    await expect(heroHeading).toContainText('오늘 같이 뛸 사람을');

    // '시작하기' CTA — exact match avoids matching '무료로 시작하기' buttons
    const startCta = page.getByRole('link', { name: '시작하기', exact: true });
    await expect(startCta).toBeVisible();

    // '로그인' link
    const loginLink = page.getByRole('link', { name: '로그인' });
    await expect(loginLink).toBeVisible();

    // No unexpected console errors
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('hero section contains AI 기반 스포츠 매칭 eyebrow copy', async ({ page }) => {
    await page.goto('/landing');
    await expect(page.locator('.tm-landing-hero-eyebrow')).toContainText('AI 기반 스포츠 매칭');
  });

  test('footer contains teameet copyright text', async ({ page }) => {
    await page.goto('/landing');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('teameet');
  });
});
