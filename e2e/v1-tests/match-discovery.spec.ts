import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: applicant(지원수) — 캐주얼 매치 참가자.
 * 플로우: 홈 → 매치 목록 → 매치 상세. 핵심 동선이 막힘 없이 도달·렌더되는지.
 */
test.describe('[applicant] 매치 탐색 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.applicant.email);
  });

  test('홈 → 매치 목록 → 매치 상세 도달', async ({ page }) => {
    await page.goto('/v1/home');
    await expect(page.getByRole('main')).toBeVisible();

    const matchesReady = page.waitForResponse((response) => response.url().includes('/api/v1/matches') && response.status() === 200, { timeout: 60000 });
    await page.goto('/v1/matches');
    await matchesReady;
    await expect(page.locator('main').first()).toContainText(/개인 매치/);

    // 실제 매치 카드(seed id 패턴 /matches/0000…) — 생성 버튼(/matches/new) 제외
    const firstMatch = page.locator('.tm-match-list-card[href*="/matches/"]:not([href*="/new"])').first();
    await expect(firstMatch).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/matches\/[a-f0-9-]{8,}/),
      firstMatch.click(),
    ]);
    await expect(page.getByRole('main')).toBeVisible();
    // 상세 InfoRow 라벨(지역·인원)이 DOM에 렌더 — 반응형 중복(데스크톱/모바일) 가시성 무관 content 검증
    const main = page.getByRole('main');
    await expect(main).toContainText('인원');
    await expect(main).toContainText('지역');
  });

  test('매치 목록 종목 필터 칩이 렌더되고 active 표시가 존재한다', async ({ page }) => {
    await page.goto('/v1/matches');
    await expect(page.locator('main').first()).toContainText(/개인 매치/);
    // 종목 칩 행이 렌더되고, active 칩이 최소 1개 존재(전체) — UI 회귀 방지
    const chips = page.locator('.tm-chip');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThanOrEqual(3);
    expect(await page.locator('.tm-chip-active').count()).toBeGreaterThanOrEqual(1);
  });
});
