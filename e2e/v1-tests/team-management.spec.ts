import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: owner(팀장원) — 팀 소유자.
 * 플로우: /my/teams → 팀 상세 → /my/teams/[id]/members (멤버·가입신청 탭).
 * owner에게만 노출되는 '멤버 관리' 운영 메뉴 확인.
 */
test.describe('[owner] 팀 관리 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.owner.email);
  });

  test('/my/teams — owner 소속 팀 목록이 렌더된다', async ({ page }) => {
    await page.goto('/my/teams');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // 내 팀 페이지 — 상태 무관하게 main이 렌더되면 OK (seed 팀 존재)
    // "소속 팀이 없어요"가 아닌 실제 팀 목록 또는 헤딩이 존재해야
    await expect(main).not.toContainText('소속 팀이 없어요');
  });

  test('/my/teams/[id] — owner는 멤버 관리 운영 메뉴를 볼 수 있다', async ({ page }) => {
    await page.goto('/my/teams');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    // 팀 카드 링크로 팀 상세 이동 (seed 팀 id 패턴 /my/teams/0000…)
    const teamLink = page.locator('.tm-my-team-card[href*="/my/teams/"]').first();
    await expect(teamLink).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/my\/teams\/[a-f0-9-]{8,}/),
      teamLink.click(),
    ]);
    const detail = page.getByRole('main');
    await expect(detail).toBeVisible();
    // owner/manager에게만 '멤버 관리' 운영 메뉴 노출 (#10 조건)
    await expect(detail).toContainText('멤버 관리');
  });

  test('/my/teams/[id]/members — 멤버 탭·가입신청 탭이 렌더된다', async ({ page }) => {
    await page.goto('/my/teams');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    const teamLink = page.locator('.tm-my-team-card[href*="/my/teams/"]').first();
    await expect(teamLink).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/my\/teams\/[a-f0-9-]{8,}/),
      teamLink.click(),
    ]);

    // 멤버 관리 링크 클릭
    const memberMgmtLink = page.locator('.tm-my-menu-row[href*="/members"]');
    await expect(memberMgmtLink.first()).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/my\/teams\/[a-f0-9-]{8,}\/members/),
      memberMgmtLink.first().click(),
    ]);
    const membersMain = page.getByRole('main');
    await expect(membersMain).toBeVisible();
    // 멤버 탭과 가입 신청 탭이 DOM에 존재
    await expect(membersMain).toContainText('멤버');
    await expect(membersMain).toContainText('가입 신청');
  });
});
