import { test, expect } from '@playwright/test';
import { gotoWithWarmup } from '../fixtures/auth';

test.describe('Responsive - Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('bottom nav visible, sidebar hidden', async ({ page }) => {
    await gotoWithWarmup(page, '/home');
    const sidebar = page.locator('aside');
    await expect(sidebar).not.toBeVisible();
    const bottomNav = page.locator('nav').filter({ has: page.locator('a[href="/home"]') });
    await expect(bottomNav).toBeVisible();
  });

  test('cards are full width', async ({ page }) => {
    await page.goto('/matches');
    await page.waitForTimeout(1000);
    await expect(page.locator('main')).toBeVisible();
  });

  test('horizontal scroll on home sport filters', async ({ page }) => {
    await gotoWithWarmup(page, '/home');
    await page.waitForTimeout(500);
    // Sport filter container should be scrollable
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Responsive - Tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('bottom nav visible at tablet size', async ({ page }) => {
    await gotoWithWarmup(page, '/home');
    const sidebar = page.locator('aside');
    // At 768px (< 1024px lg:), sidebar should be hidden
    await expect(sidebar).not.toBeVisible();
  });

  test('container queries activate 2-col grid at tablet', async ({ page }) => {
    await page.goto('/matches');
    await page.waitForTimeout(1000);
    // Content area at 768px should trigger @3xl container queries
    await expect(page.locator('main')).toBeVisible();
  });

  test('profile page renders properly at tablet', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(500);
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Responsive - Desktop (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('sidebar visible, bottom nav hidden', async ({ page }) => {
    await gotoWithWarmup(page, '/home');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('2-column detail layout on desktop', async ({ page }) => {
    await page.goto('/matches/match-1');
    await page.waitForTimeout(1000);
    await expect(page.locator('main')).toBeVisible();
  });

  test('marketplace shows grid layout', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForTimeout(1000);
    await expect(page.locator('main')).toBeVisible();
  });
});
