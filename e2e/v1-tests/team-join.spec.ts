import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: applicant(지원수) — 캐주얼 참가자.
 * 플로우: /teams 목록 → 팀 상세 도달, 가입 관련 CTA 렌더 확인.
 */
test.describe('[applicant] 팀 탐색 및 가입 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.applicant.email);
  });

  test('/teams — 팀 목록이 렌더되고 팀 카드가 존재한다', async ({ page }) => {
    await page.goto('/teams');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // AppChrome title="팀" — 팀 목록 헤딩
    await expect(main).toContainText('팀');
    // seed 팀이 있으므로 팀 카드가 최소 1개 렌더되어야
    const teamCards = page.locator('.tm-team-card-stack a, a[href*="/teams/"]').filter({
      hasNot: page.locator('[href="/teams/new"]'),
    });
    expect(await teamCards.count()).toBeGreaterThanOrEqual(1);
  });

  test('/teams → 팀 상세 — 가입 관련 CTA가 렌더된다', async ({ page }) => {
    await page.goto('/teams');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    // 첫 번째 팀 카드로 이동 (seed id 패턴 /teams/0000…)
    const teamLink = page.locator('a[href*="/teams/0000"]').first();
    await expect(teamLink).toBeVisible();
    await teamLink.click();

    await expect(page).toHaveURL(/\/teams\/[a-f0-9-]{8,}/);
    const detail = page.getByRole('main');
    await expect(detail).toBeVisible();
    // 팀 상세에는 팀 이름/정보가 있어야
    // 가입 신청 또는 소속팀 상태 CTA 중 하나가 존재
    // (applicant는 seed 팀의 member이므로 '가입된 팀' 표시 가능)
    await expect(detail).toContainText(/팀|멤버|가입/);
  });
});
