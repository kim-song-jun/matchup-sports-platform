import { test, expect } from '@playwright/test';
import { createMatchViaApi, findVenueBySport } from '../fixtures/api-helpers';
import { loginViaApi } from '../fixtures/auth';
import { TEST_PERSONAS } from '../fixtures/test-users';

const SINARO = TEST_PERSONAS.sinaro.nickname;

function visibleTestId(page: import('@playwright/test').Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

function buildFutureSchedule(daysFromNow = 2) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);

  return {
    matchDate: date.toISOString().split('T')[0],
    startTime: '19:00',
    endTime: '21:00',
  };
}

test.describe('Match discovery 2.0', () => {
  test('home sport deep link keeps selected sport on matches page', async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '풋살' }).first().click();
    const deepLink = page.locator('a[href="/matches?sport=futsal"]:visible').first();
    await expect(deepLink).toBeVisible();
    await deepLink.click();

    await expect(page).toHaveURL(/\/matches\?sport=futsal/);
    await expect(visibleTestId(page, 'match-sport-futsal')).toHaveAttribute('aria-pressed', 'true');
  });

  test('query-based discovery filters persist across reload', async ({ page }) => {
    const venue = await findVenueBySport('futsal');
    const tokens = await loginViaApi(SINARO);
    const schedule = buildFutureSchedule(3);
    const title = `E2E탐색-${Date.now()}`;

    await createMatchViaApi(tokens.accessToken, {
      title,
      description: '매치 탐색 URL 유지 검증',
      sportType: 'futsal',
      matchDate: schedule.matchDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      venueId: venue.id,
      maxPlayers: 8,
      fee: 0,
      levelMin: 1,
      levelMax: 2,
    });

    await page.goto(`/matches?sport=futsal&q=${encodeURIComponent(title)}&fee=free&available=1&level=beginner`);
    await page.waitForLoadState('networkidle');

    await expect(visibleTestId(page, 'match-sport-futsal')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleTestId(page, 'match-quick-free')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleTestId(page, 'match-quick-beginner')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleTestId(page, 'match-quick-available')).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('[data-testid="match-results"] a:visible').filter({ hasText: title }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(visibleTestId(page, 'match-sport-futsal')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleTestId(page, 'match-quick-free')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleTestId(page, 'match-quick-beginner')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleTestId(page, 'match-quick-available')).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('[data-testid="match-results"] a:visible').filter({ hasText: title }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('interactive quick filters update URL and can be cleared', async ({ page }) => {
    await page.goto('/matches');
    await page.waitForLoadState('networkidle');

    await visibleTestId(page, 'match-quick-free').click();
    await visibleTestId(page, 'match-quick-available').click();
    await visibleTestId(page, 'match-quick-beginner').click();

    await expect(page).toHaveURL(/fee=free/);
    await expect(page).toHaveURL(/available=1/);
    await expect(page).toHaveURL(/level=beginner/);

    await page.goto('/matches?sort=latest');
    await page.waitForLoadState('networkidle');
    await expect(visibleTestId(page, 'match-sort-latest')).toHaveAttribute('aria-pressed', 'true');

    await visibleTestId(page, 'match-clear-filters').click();
    await expect(page).toHaveURL(/\/matches$/);
    await expect(visibleTestId(page, 'match-quick-free')).toHaveAttribute('aria-pressed', 'false');
    await expect(visibleTestId(page, 'match-quick-available')).toHaveAttribute('aria-pressed', 'false');
    await expect(visibleTestId(page, 'match-quick-beginner')).toHaveAttribute('aria-pressed', 'false');
  });
});
