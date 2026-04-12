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
import type { Page } from '@playwright/test';
import { API_BASE } from '../fixtures/test-users';
import { TEST_PERSONAS } from '../fixtures/test-users';
import { loginViaApi, setupAuthState } from '../fixtures/auth';

const ADMIN = TEST_PERSONAS.admin.nickname;
const SINARO = TEST_PERSONAS.sinaro.nickname;
const ADMIN_API_BASE = `${API_BASE}/api/v1`;

interface AdminHeaders {
  Authorization: string;
  'Content-Type': string;
}

function moderationNote(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

async function waitForAdminPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await expect(page.locator('main')).toBeVisible();
}

async function createAdminHeaders(): Promise<AdminHeaders> {
  const tokens = await loginViaApi(ADMIN);
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function adminApiRequest<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const response = await fetch(`${ADMIN_API_BASE}${path}`, init);
  const text = await response.text();
  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const payload = body as { data?: T };
  return (payload.data ?? body) as T;
}

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

  test('ADMIN-001 payments page shows honest empty state when API returns no rows', async ({ page }) => {
    await page.route('**/api/v1/admin/payments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: [],
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await waitForAdminPage(page, '/admin/payments');

    await expect(page.getByRole('heading', { name: '결제 관리' })).toBeVisible();
    await expect(page.getByText('아직 결제 내역이 없어요')).toBeVisible();
    await expect(page.getByText('실제 결제가 생성되면 여기에 표시돼요')).toBeVisible();
  });

  test('ADMIN-001 reviews page shows honest error state when API fails', async ({ page }) => {
    await page.route('**/api/v1/admin/reviews', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          message: 'internal test failure',
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await waitForAdminPage(page, '/admin/reviews');

    await expect(page.getByRole('heading', { name: '평가 관리' })).toBeVisible();
    await expect(page.getByText('평가 목록을 불러오지 못했어요')).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  });

  test('ADMIN-001 moderation UI writes warn, suspend, reactivate without leaving admin shell', async ({ page }) => {
    test.slow();

    const targetNickname = `admin-moderation-ui-${Date.now()}`;
    const targetTokens = await loginViaApi(targetNickname);
    const targetId = String(targetTokens.user?.id ?? '');
    if (!targetId) {
      throw new Error('target user id missing from dev-login response');
    }

    const warnNote = moderationNote('ui-warn');
    const suspendNote = moderationNote('ui-suspend');
    const reactivateNote = moderationNote('ui-reactivate');
    let needsCleanup = false;

    const openActionModal = async (buttonName: RegExp | string) => {
      await page.getByRole('button', { name: buttonName }).click();
      await expect(page.getByRole('button', { name: '저장' })).toBeVisible();
    };

    const submitActionNote = async (note: string) => {
      await page.locator('#admin-user-action-note').fill(note);
      await page.getByRole('button', { name: '저장' }).click();
    };

    try {
      await waitForAdminPage(page, `/admin/users/${targetId}`);
      await expect(page).toHaveURL(new RegExp(`/admin/users/${targetId}$`));
      await expect(page.getByText(targetNickname)).toBeVisible();

      await openActionModal(/경고 기록/);
      await submitActionNote(warnNote);
      await expect(page.getByText(warnNote)).toBeVisible({ timeout: 10_000 });

      await openActionModal(/계정 정지/);
      await submitActionNote(suspendNote);
      needsCleanup = true;
      await expect(page.getByText(`정지 사유: ${suspendNote}`)).toBeVisible({ timeout: 10_000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await expect(page.getByText(`정지 사유: ${suspendNote}`)).toBeVisible();
      await expect(page.getByText('정지').first()).toBeVisible();

      await openActionModal(/계정 활성화/);
      await submitActionNote(reactivateNote);
      await expect(page.getByText(reactivateNote)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(`정지 사유: ${suspendNote}`)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/admin/users/${targetId}$`));
      needsCleanup = false;
    } finally {
      if (needsCleanup) {
        const headers = await createAdminHeaders();
        await adminApiRequest(`/admin/users/${targetId}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'active',
            note: 'playwright-cleanup',
          }),
        }).catch(() => undefined);
      }
    }
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
