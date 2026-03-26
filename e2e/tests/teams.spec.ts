import { test, expect } from '@playwright/test';

test.describe('팀 페이지', () => {
  test('팀 리스트 로드', async ({ page }) => {
    await page.goto('/teams');

    await expect(page.locator('h1')).toContainText('팀·클럽');

    // 팀 등록 버튼
    const createBtn = page.locator('a[href="/teams/new"]');
    await expect(createBtn).toBeVisible();
  });
});

test.describe('강좌 페이지', () => {
  test('강좌 리스트 로드', async ({ page }) => {
    await page.goto('/lessons');

    await expect(page.locator('h1')).toContainText('강좌');

    // 검색 입력
    const searchInput = page.locator('input[placeholder*="검색"]');
    await expect(searchInput).toBeVisible();

    // 필터 칩
    await expect(page.locator('button:has-text("전체")').first()).toBeVisible();
    await expect(page.locator('button:has-text("그룹 레슨")')).toBeVisible();
  });
});

test.describe('시설 페이지', () => {
  test('시설 리스트와 검색', async ({ page }) => {
    await page.goto('/venues');

    await expect(page.locator('h1')).toContainText('시설 찾기');

    // 검색 입력
    const searchInput = page.locator('input[placeholder*="시설"]');
    await expect(searchInput).toBeVisible();

    // 종목 필터
    await expect(page.locator('button:has-text("전체")').first()).toBeVisible();

    // 지역 필터
    await expect(page.locator('button:has-text("서울")')).toBeVisible();
  });

  test('시설 등록 요청 버튼', async ({ page }) => {
    await page.goto('/venues');

    const requestBtn = page.locator('button:has-text("시설 등록 요청")');
    await expect(requestBtn).toBeVisible();
  });
});

test.describe('장터 페이지', () => {
  test('장터 리스트 로드', async ({ page }) => {
    await page.goto('/marketplace');

    await expect(page.locator('h1')).toContainText('장터');
  });
});

test.describe('알림 페이지', () => {
  test('비로그인 시 로그인 유도', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.locator('text=로그인 후')).toBeVisible();
  });
});

test.describe('채팅 페이지', () => {
  test('비로그인 시 로그인 유도', async ({ page }) => {
    await page.goto('/chat');

    await expect(page.locator('text=로그인 후 채팅을 이용할 수 있어요')).toBeVisible();
  });
});

test.describe('마이페이지', () => {
  test('비로그인 시 로그인 프롬프트', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('text=로그인하고 시작하세요')).toBeVisible();
  });
});
