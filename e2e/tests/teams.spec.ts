import { test, expect } from '@playwright/test';

test.describe('Teams page', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('create team button visible', async ({ page }) => {
    await page.goto('/teams');
    const btn = page.locator('a[href="/teams/new"]');
    await expect(btn).toBeVisible();
  });
});

test.describe('Lessons page', () => {
  test('page loads with heading and search', async ({ page }) => {
    await page.goto('/lessons');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
  });

  test('filter chips present', async ({ page }) => {
    await page.goto('/lessons');
    const chips = page.locator('button').filter({ hasText: /전체|All/i });
    await expect(chips.first()).toBeVisible();
  });
});

test.describe('Marketplace page', () => {
  test('page loads with heading', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Notifications page', () => {
  test('unauthenticated shows login prompt', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(500);
    // Should show EmptyState with login action
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink.first()).toBeVisible();
  });
});

test.describe('Chat page', () => {
  test('unauthenticated shows login prompt', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForTimeout(500);
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink.first()).toBeVisible();
  });
});

test.describe('Profile page', () => {
  test('unauthenticated shows login prompt', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(500);
    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink.first()).toBeVisible();
  });
});
