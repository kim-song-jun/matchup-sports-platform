import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 반응형 회귀 스모크 테스트.
 * - 데스크톱(1440): /home·/matches 에서 .tm-desktop-nav-brand 존재·보임.
 * - 모바일: /home 에서 하단 nav(.tm-bottom-nav) 존재.
 *
 * CSS가 1024px 이하에서 .tm-desktop-nav를 숨기므로, desktop project에서만
 * nav-brand visibility를 확인하고 mobile project에서는 bottom-nav를 확인한다.
 */
test.describe('반응형 레이아웃 회귀 스모크', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.member.email);
  });

  test('/home — main이 렌더되고 nav 요소가 존재한다', async ({ page }) => {
    await page.goto('/v1/home');
    await expect(page.getByRole('main')).toBeVisible();

    // desktop(1440): .tm-desktop-nav-brand 존재 (CSS로 visible)
    // mobile(Pixel 5): .tm-bottom-nav 존재
    const desktopBrand = page.locator('.tm-desktop-nav-brand');
    const bottomNav = page.locator('.tm-bottom-nav');

    const viewport = page.viewportSize();
    const isDesktop = viewport ? viewport.width >= 1024 : false;

    if (isDesktop) {
      // 데스크톱: brand 링크가 DOM에 존재하고 보임
      await expect(desktopBrand).toHaveCount(1);
      await expect(desktopBrand).toBeVisible();
      // teameet 텍스트 포함
      await expect(desktopBrand).toContainText('teameet');
    } else {
      // 모바일: 하단 nav가 DOM에 존재
      await expect(bottomNav).toHaveCount(1);
      await expect(bottomNav).toBeVisible();
    }
  });

  test('/matches — desktop nav brand와 본문이 정렬된다', async ({ page }) => {
    await page.goto('/v1/matches');
    await expect(page.getByRole('main')).toBeVisible();

    const desktopBrand = page.locator('.tm-desktop-nav-brand');
    const bottomNav = page.locator('.tm-bottom-nav');

    const viewport = page.viewportSize();
    const isDesktop = viewport ? viewport.width >= 1024 : false;

    if (isDesktop) {
      await expect(desktopBrand).toHaveCount(1);
      await expect(desktopBrand).toBeVisible();
    } else {
      // 모바일: 하단 nav 존재
      await expect(bottomNav).toHaveCount(1);
    }
    // 어느 뷰포트든 매치 목록 main 렌더
    await expect(page.getByRole('main')).toContainText('개인 매치');
  });
});
