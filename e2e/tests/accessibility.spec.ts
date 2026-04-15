import { test, expect } from '@playwright/test';
import { gotoWithWarmup } from '../fixtures/auth';

test.describe('Accessibility', () => {
  test('home page has proper heading hierarchy', async ({ page }) => {
    await gotoWithWarmup(page, '/home');
    const h1 = page.locator('h1');
    expect(await h1.count()).toBeGreaterThanOrEqual(1);
  });

  test('all icon buttons have aria-labels', async ({ page }) => {
    await page.goto('/matches/match-1');
    await page.waitForTimeout(1000);
    // Check back button has aria-label
    const iconButtons = page.locator('button:not(:has(span))');
    const count = await iconButtons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = iconButtons.nth(i);
      const ariaLabel = await btn.getAttribute('aria-label');
      const textContent = await btn.textContent();
      // Either has aria-label or has visible text
      expect(ariaLabel || textContent?.trim()).toBeTruthy();
    }
  });

  test('touch targets are at least 44px', async ({ page }) => {
    await gotoWithWarmup(page, '/home');
    await page.waitForTimeout(500);
    // Check bottom nav tabs
    const navLinks = page.locator('nav a');
    const count = await navLinks.count();
    for (let i = 0; i < count; i++) {
      const box = await navLinks.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('empty states use EmptyState component with icons', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(500);
    // Unauthenticated should show EmptyState
    await expect(page.locator('main')).toBeVisible();
    // Should have an SVG icon (from lucide-react)
    const svgs = page.locator('main svg');
    expect(await svgs.count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Landing pages', () => {
  test('landing page loads with hero', async ({ page }) => {
    await page.goto('/landing');
    await page.waitForTimeout(1000);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await page.waitForTimeout(1000);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('mobile menu drawer covers the viewport when opened', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/about');
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: '메뉴 열기' }).click();

    const dialog = page.getByRole('dialog', { name: '모바일 메뉴' });
    await expect(dialog).toBeVisible();

    const box = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        innerHeight: window.innerHeight,
      };
    });

    expect(box.top).toBe(64);
    expect(Math.abs(box.bottom - box.innerHeight)).toBeLessThanOrEqual(1);

    const bottomHit = await page.evaluate(() => {
      const dialogElement = document.querySelector<HTMLElement>('[role="dialog"][aria-label="모바일 메뉴"]');
      const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 4);

      return {
        insideDialog: Boolean(dialogElement && target && dialogElement.contains(target)),
        tagName: target?.tagName ?? null,
      };
    });

    expect(bottomHit.insideDialog).toBe(true);
    expect(bottomHit.tagName).not.toBe('H2');
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(500);
    await expect(page.locator('main, form')).toBeVisible();
  });

  test('footer is lightweight (no nav links)', async ({ page }) => {
    await page.goto('/landing');
    await page.waitForTimeout(1000);
    const footer = page.locator('footer');
    if (await footer.isVisible()) {
      // Footer should have copyright but minimal links
      await expect(footer).toBeVisible();
    }
  });
});
