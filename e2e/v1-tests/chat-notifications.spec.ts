import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: member(멤버현) — 소속 멤버.
 * 플로우: /notifications 도달 + /chat 목록 도달.
 * 빈 상태 또는 실제 목록 무관하게 main 렌더 확인(내용보다 도달 보장).
 */
test.describe('[member] 채팅·알림 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.member.email);
  });

  test('/notifications — 알림 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/notifications');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // NotificationsPageView: AppChrome title에 "알림" 포함
    // DOM에 "알림" 텍스트가 존재해야 (빈 상태 포함)
    await expect(main).toContainText('알림');
  });

  test('/chat — 채팅 목록 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/chat');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // ChatListPageView: AppChrome title="채팅"
    // 빈 상태("아직 채팅방이 없어요") 또는 실제 목록 모두 허용
    await expect(main).toContainText(/채팅|아직 채팅방이 없어요/);
  });

  test('/notifications → /chat 연속 도달', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('main')).toContainText('알림');

    await page.goto('/chat');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('main')).toContainText(/채팅/);
  });
});
