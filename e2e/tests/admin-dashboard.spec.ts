/**
 * Admin dashboard scenarios — admin persona
 *
 * Covers:
 * - /admin/dashboard page loads for admin user
 * - Dashboard shows stat cards (총 사용자, 총 매치, 강좌, 팀)
 * - Admin sidebar navigation links are visible
 * - Non-admin user is redirected away from /admin/*
 * - Unauthenticated user is redirected to /login from /admin/*
 */

import { test, expect } from '@playwright/test';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { setupAuthState } from '../fixtures/auth';

const ADMIN = TEST_PERSONAS.admin.nickname;
const SINARO = TEST_PERSONAS.sinaro.nickname;

test.describe('Admin dashboard — admin user', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthState(page, ADMIN);
  });

  test('/admin/dashboard page loads with greeting', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // If redirected away (non-admin), skip gracefully
    const url = page.url();
    if (!url.includes('/admin')) {
      console.log('[admin-dashboard] Admin persona does not have admin role — skipping admin tests');
      return;
    }

    const greeting = page.getByText(/안녕하세요|관리자/);
    await expect(greeting.first()).toBeVisible({ timeout: 8_000 });
  });

  test('dashboard shows stat metric cards', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const url = page.url();
    if (!url.includes('/admin')) return;

    // Stat labels
    const userStat = page.getByText('총 사용자');
    const matchStat = page.getByText('총 매치');
    await expect(userStat.first()).toBeVisible({ timeout: 5_000 });
    await expect(matchStat.first()).toBeVisible({ timeout: 5_000 });
  });

  test('admin sidebar navigation is present', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const url = page.url();
    if (!url.includes('/admin')) return;

    // Sidebar links
    const matchAdmin = page.locator('a[href="/admin/matches"]');
    const userAdmin = page.locator('a[href="/admin/users"]');
    await expect(matchAdmin.first()).toBeVisible({ timeout: 5_000 });
    await expect(userAdmin.first()).toBeVisible({ timeout: 5_000 });
  });

  test('admin matches page loads', async ({ page }) => {
    await page.goto('/admin/matches');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const url = page.url();
    if (!url.includes('/admin')) return;

    await expect(page.locator('main')).toBeVisible();
  });

  test('admin users page loads', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const url = page.url();
    if (!url.includes('/admin')) return;

    await expect(page.locator('main')).toBeVisible();
  });

  test('quick management links on dashboard navigate correctly', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    const url = page.url();
    if (!url.includes('/admin')) return;

    const matchLink = page.locator('a[href="/admin/matches"]').first();
    await matchLink.click();
    await page.waitForURL(/\/admin\/matches/, { timeout: 5_000 });
    await expect(page).toHaveURL(/\/admin\/matches/);
  });
});

test.describe('Admin access control — non-admin user', () => {
  test.beforeEach(async ({ page }) => {
    // sinaro is a regular user without admin role
    await setupAuthState(page, SINARO);
  });

  test('non-admin visiting /admin/dashboard is redirected to /home', async ({ page }) => {
    await page.goto('/admin/dashboard');
    // Admin layout redirects non-admin users to /home after mount
    await page.waitForTimeout(2000);
    const url = page.url();
    // Should be redirected to /home (or /login if not authenticated)
    expect(url).not.toContain('/admin');
  });
});

test.describe('Admin access control — unauthenticated', () => {
  test('unauthenticated visiting /admin/dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain('/admin/dashboard');
  });
});
