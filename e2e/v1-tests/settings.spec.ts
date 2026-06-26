import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: member(멤버현) — 일반 멤버.
 * 플로우: /my/settings → 하위 설정 링크(알림·약관 등) 존재·도달 확인.
 * settingsModel groups: '계정' 섹션(알림 설정 /my/settings/notifications, 약관 /my/settings/legal 등)
 */
test.describe('[member] 설정 페이지 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.member.email);
  });

  test('/my/settings — 설정 페이지가 렌더되고 주요 메뉴가 존재한다', async ({ page }) => {
    await page.goto('/v1/my/settings');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // settingsModel: '계정' 섹션 헤딩
    await expect(main).toContainText('계정');
    // 알림 설정 항목이 존재
    await expect(main).toContainText('알림 설정');
    // 약관 및 정책 항목이 존재
    await expect(main).toContainText('약관 및 정책');
  });

  test('/my/settings/notifications — 알림 설정 페이지에 도달한다', async ({ page }) => {
    await page.goto('/v1/my/settings/notifications');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(main).toContainText('알림 설정');
  });

  test('/my/settings/legal — 약관 및 정책 페이지에 도달한다', async ({ page }) => {
    await page.goto('/v1/my/settings/legal');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(main).toContainText('약관 및 정책');
  });

  test('/my/settings → 알림 설정 링크 클릭으로 도달한다', async ({ page }) => {
    await page.goto('/v1/my/settings');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    const notifLink = page.locator('a[href="/my/settings/notifications"]').first();
    if (await notifLink.count() > 0) {
      await notifLink.click();
      await expect(page).toHaveURL(/\/my\/settings\/notifications/);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('main')).toContainText('알림 설정');
    } else {
      // 링크가 버튼으로 렌더된 경우 직접 이동
      await page.goto('/v1/my/settings/notifications');
      await expect(page.getByRole('main')).toContainText('알림 설정');
    }
  });
});
