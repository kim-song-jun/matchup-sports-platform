import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: host(호스트민) — 매치 호스트.
 * 회귀 테스트: 매치 생성 위저드에서 non-first 종목을 골라도 step 이동(재마운트) 시 선택이
 * 유지되는지. (과거 critical 버그: selectedSportId가 로컬 useState라 step마다 축구로 리셋 →
 * 사용자가 수영을 골라도 축구로 생성. selectionKey localStorage 영속으로 수정.)
 * commit 93873e97 회귀 방지.
 */
test.describe('[host] 매치 생성 위저드 — 종목 선택 영속', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.host.email);
  });

  test('non-first 종목(수영) 선택이 step 재마운트 후에도 유지된다', async ({ page }) => {
    const sportsReady = page.waitForResponse((response) => response.url().includes('/api/v1/master/sports') && response.status() === 200, { timeout: 45000 });
    const regionsReady = page.waitForResponse((response) => response.url().includes('/api/v1/master/regions') && response.status() === 200, { timeout: 45000 });
    await page.goto('/matches/new/sport', { waitUntil: 'domcontentloaded' });
    await Promise.all([sportsReady, regionsReady]);
    await expect(page.getByRole('heading', { name: /종목/ })).toBeVisible({ timeout: 30000 });

    const swim = page.getByRole('button', { name: /수영/ });
    await expect(swim).toBeVisible();
    await swim.click();
    await expect(swim).toHaveAttribute('aria-pressed', 'true');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /종목/ })).toBeVisible({ timeout: 30000 });
    const swimAfter = page.getByRole('button', { name: /수영/ });
    await expect(swimAfter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /축구/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
