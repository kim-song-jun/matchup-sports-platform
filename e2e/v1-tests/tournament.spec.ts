import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: applicant(지원수) — 대회 참가 신청자.
 * 플로우: /tournaments → 대회 목록 렌더 → 대회 상세 → /tournaments/[id]/apply 페이지 렌더.
 */
test.describe('[applicant] 대회 탐색 및 신청 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.applicant.email);
  });

  test('/tournaments — 대회 목록 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/tournaments');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // AppChrome title="대회" — 대회 페이지 핵심 텍스트
    await expect(main).toContainText('대회');
  });

  test('/tournaments → 대회 상세 → 신청 페이지 도달', async ({ page }) => {
    await page.goto('/tournaments');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    // 대회 목록에서 첫 번째 링크 클릭 (seed id 패턴 /tournaments/0000…)
    // 대회 id는 UUID이므로 기존 0000 패턴 셀렉터는 항상 0건→silent-pass였음(Copilot #3 수정).
    // 상세 링크(목록 카드 → /tournaments/<uuid>)만 선택. seed 대회는 항상 존재하므로
    // 못 찾으면 회귀로 실패해야 한다(빈 상태로 조용히 통과 금지).
    const tournamentLink = page
      .locator('a[href*="/tournaments/"]:not([href$="/tournaments"]):not([href*="/apply"]):not([href*="/my"]):not([href*="/roster"])')
      .first();
    await expect(tournamentLink).toBeVisible();
    await tournamentLink.click();

    await expect(page).toHaveURL(/\/tournaments\/[a-f0-9-]{8,}/);
    const detail = page.getByRole('main');
    await expect(detail).toBeVisible();

    // 신청 링크 또는 버튼 탐색
    const applyLink = page.locator('a[href*="/apply"]').first();
    if (await applyLink.count() > 0) {
      // a[href*="/apply"]는 데스크톱에서 .tm-hide-desktop으로 숨겨진 모바일 fixed-CTA
      // 까지 매칭돼 click이 영구 대기할 수 있다(Copilot). 상세 URL에서 tournamentId를
      // 추출해 /apply로 직접 이동하여 '신청 페이지 도달' 검증이 항상 실행되게 한다.
      const detailUrl = page.url();
      const idMatch = detailUrl.match(/\/tournaments\/([a-f0-9-]{8,})/);
      if (!idMatch) throw new Error(`대회 상세 URL에서 id를 찾지 못했어요: ${detailUrl}`);
      await page.goto(`/tournaments/${idMatch[1]}/apply`);
      await expect(page).toHaveURL(/\/tournaments\/[a-f0-9-]{8,}\/apply/);
      await expect(page.getByRole('main')).toBeVisible();
    } else {
      // 신청 버튼이 없는 경우(마감/비로그인 등) — 상세 페이지 도달로 충분
      await expect(detail).toContainText(/대회|종목|모집/);
    }
  });
});
