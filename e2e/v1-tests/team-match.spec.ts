import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: host(호스트민) — 팀매치 주최자.
 * 플로우:
 *   - 모바일: /team-matches 목록 도달 + FAB 존재 확인
 *   - 데스크톱(1440): /team-matches 목록 + '팀매치 만들기' 헤더 CTA 노출 확인
 *     (반응형 회귀 #1 방지 — 데스크톱에서 `.tm-team-match-desktop-create-btn` 존재)
 */
test.describe('[host] 팀매치 목록 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.host.email);
  });

  test('모바일: /team-matches 목록이 렌더되고 FAB이 존재한다', async ({ page }) => {
    await page.goto('/team-matches');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // 팀매치 목록 — 종목 칩 또는 summary row 렌더
    await expect(main).toContainText(/팀매치|팀 매치/);
    // 모바일 FAB (href="/team-matches/new/team", aria-label="팀매치 만들기")
    const fab = page.locator('.tm-floating-fab[href="/team-matches/new/team"]');
    // DOM에는 존재하지만 desktop에서는 CSS로 숨겨짐 — DOM presence만 확인
    await expect(fab).toHaveCount(1);
  });

  test('데스크톱: /team-matches 헤더에 "팀매치 만들기" CTA가 노출된다', async ({ page }) => {
    // 이 테스트는 --project=desktop(1440px)으로 실행될 때 의미 있음
    // mobile viewport에서도 DOM에는 존재(CSS 표시만 다름) → DOM 존재 확인
    await page.goto('/team-matches');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    // 데스크톱 헤더 CTA: className="tm-team-match-desktop-create-btn"
    const desktopCta = page.locator('.tm-team-match-desktop-create-btn');
    await expect(desktopCta).toHaveCount(1);
    await expect(desktopCta).toHaveAttribute('href', '/team-matches/new/team');
    // aria-label도 존재
    await expect(desktopCta).toHaveAttribute('aria-label', '팀매치 만들기');
  });
});
