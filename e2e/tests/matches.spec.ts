import { test, expect } from '@playwright/test';

test.describe('매치 찾기 페이지', () => {
  test('페이지 로드 시 기본 요소 표시', async ({ page }) => {
    await page.goto('/matches');

    // 타이틀
    await expect(page.locator('h1')).toContainText('매치 찾기');

    // 검색 입력
    const searchInput = page.locator('input[placeholder*="검색"]');
    await expect(searchInput).toBeVisible();

    // 필터 칩 존재
    await expect(page.locator('button:has-text("전체")').first()).toBeVisible();
  });

  test('검색어 입력 시 필터링', async ({ page }) => {
    await page.goto('/matches');

    const searchInput = page.locator('input[placeholder*="검색"]');
    await searchInput.fill('풋살');

    // 디바운싱 대기 (300ms)
    await page.waitForTimeout(500);
  });

  test('종목 필터 클릭', async ({ page }) => {
    await page.goto('/matches');

    const futsalBtn = page.locator('button:has-text("풋살")').first();
    if (await futsalBtn.isVisible()) {
      await futsalBtn.click();
      // 필터가 active 상태로 변경되는지
      await expect(futsalBtn).toHaveClass(/bg-gray-900/);
    }
  });

  test('필터 버튼으로 상세 필터 토글', async ({ page }) => {
    await page.goto('/matches');

    const filterBtn = page.locator('button[aria-label="필터 열기"]');
    await filterBtn.click();

    // 날짜 필터 표시
    await expect(page.locator('input[type="date"]')).toBeVisible();

    // 정렬 버튼 표시
    await expect(page.locator('button:has-text("최신순")')).toBeVisible();
    await expect(page.locator('button:has-text("마감임박")')).toBeVisible();
  });
});

test.describe('매치 생성 플로우', () => {
  test('비로그인 시 로그인 유도', async ({ page }) => {
    await page.goto('/matches/new');

    await expect(page.locator('text=매치를 만들어보세요')).toBeVisible();
    await expect(page.locator('text=로그인하고 시작하기')).toBeVisible();
  });
});
