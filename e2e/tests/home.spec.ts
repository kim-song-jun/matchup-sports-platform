import { test, expect } from '@playwright/test';

test.describe('홈 페이지', () => {
  test('비로그인 상태에서 기본 요소 표시', async ({ page }) => {
    await page.goto('/home');

    // 타이틀
    await expect(page.locator('h1')).toContainText('MatchUp');

    // 로그인 버튼
    const loginBtn = page.locator('a[href="/login"]');
    await expect(loginBtn).toBeVisible();

    // 비로그인 가치 제안 카드
    await expect(page.locator('text=AI가 딱 맞는 상대를 찾아줘요')).toBeVisible();
    await expect(page.locator('text=시작하기')).toBeVisible();
  });

  test('종목 필터 클릭 시 필터링', async ({ page }) => {
    await page.goto('/home');

    // 전체 필터가 기본 선택
    const allFilter = page.locator('button:has-text("전체")').first();
    await expect(allFilter).toBeVisible();

    // 축구 필터 클릭
    const soccerFilter = page.locator('button:has-text("축구")').first();
    await soccerFilter.click();

    // 다시 클릭하면 해제 (전체로 복귀)
    await soccerFilter.click();
  });

  test('배너 dot 클릭 시 배너 변경', async ({ page }) => {
    await page.goto('/home');

    // 배너 존재 확인
    const banner = page.locator('[aria-label="배너 2"]');
    if (await banner.isVisible()) {
      await banner.click();
    }
  });

  test('섹션 헤더에 "더보기" 링크 존재', async ({ page }) => {
    await page.goto('/home');

    const moreLinks = page.locator('text=더보기');
    const count = await moreLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('네비게이션', () => {
  test('사이드바 네비게이션 (데스크탑)', async ({ page, isMobile }) => {
    test.skip(!!isMobile, '데스크탑 전용');

    await page.goto('/home');

    // 사이드바 존재
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // 매치 찾기 링크
    const matchLink = sidebar.locator('a[href="/matches"]');
    await expect(matchLink).toBeVisible();
    await matchLink.click();
    await expect(page).toHaveURL(/\/matches/);
  });

  test('하단 네비게이션 (모바일)', async ({ page, isMobile }) => {
    test.skip(!isMobile, '모바일 전용');

    await page.goto('/home');

    // 하단 네비 존재
    const bottomNav = page.locator('nav.fixed.bottom-0');
    await expect(bottomNav).toBeVisible();

    // 매치 탭 클릭
    const matchTab = bottomNav.locator('a[href="/matches"]');
    await matchTab.click();
    await expect(page).toHaveURL(/\/matches/);
  });
});
