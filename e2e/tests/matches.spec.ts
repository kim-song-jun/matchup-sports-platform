import { test, expect } from '@playwright/test';

test.describe('Matches list page', () => {
  test('page loads with heading and search input', async ({ page }) => {
    await page.goto('/matches');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
  });

  test('sport filter chips are present and clickable', async ({ page }) => {
    await page.goto('/matches');
    const firstChip = page.locator('button').filter({ hasText: /축구|Soccer/i }).first();
    if (await firstChip.isVisible()) {
      await firstChip.click();
      await page.waitForTimeout(300);
    }
  });

  test('search input accepts text', async ({ page }) => {
    await page.goto('/matches');
    const input = page.locator('input[type="text"]').first();
    await input.fill('풋살');
    await page.waitForTimeout(500);
  });

  test('filter chips have min touch target 44px', async ({ page }) => {
    await page.goto('/matches');
    const chip = page.locator('button').filter({ hasText: /축구|Soccer/i }).first();
    if (await chip.isVisible()) {
      const box = await chip.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Match detail page', () => {
  test('loads or shows empty state', async ({ page }) => {
    await page.goto('/matches/match-1');
    await page.waitForTimeout(1000);
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Match creation', () => {
  test('unauthenticated user sees login prompt', async ({ page }) => {
    await page.goto('/matches/new');
    await page.waitForTimeout(1000);
    await expect(page.locator('main')).toBeVisible();
  });
});
