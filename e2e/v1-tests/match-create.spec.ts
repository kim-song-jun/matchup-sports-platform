import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: host(호스트민) — 매치 호스트.
 * 회귀 테스트: 매치 생성 위저드에서 non-first 종목을 골라도 step 이동(재마운트) 시 선택이
 * 유지되는지. (과거 critical 버그: selectedSportId가 로컬 useState라 step마다 축구로 리셋 →
 * 사용자가 수영을 골라도 축구로 생성. selectionKey localStorage 영속으로 수정.)
 * commit 93873e97 회귀 방지.
 */
test.describe('[host] 매치 생성 위저드 — 종목 선택 영속', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.host.email);
  });

  test('non-first 종목(수영) 선택이 step 재마운트 후에도 유지된다', async ({ page }) => {
    await page.goto('/matches/new/sport');
    await expect(page.getByRole('heading', { name: /종목/ })).toBeVisible();

    // 비-첫번째 종목 '수영' 선택
    const swim = page.getByRole('button', { name: /수영/ });
    await expect(swim).toBeVisible();
    await swim.click();
    await expect(swim).toContainText('선택됨');

    // 다음 step으로 이동(별도 라우트 → 컴포넌트 재마운트)
    await page.getByRole('button', { name: '다음' }).click();
    await expect(page).not.toHaveURL(/\/matches\/new\/sport$/);

    // sport step으로 완전 새로고침 복귀(최강 재마운트) → 수영이 여전히 선택됨이어야(축구로 리셋 X)
    await page.goto('/matches/new/sport');
    const swimAfter = page.getByRole('button', { name: /수영/ });
    await expect(swimAfter).toContainText('선택됨');
    // 첫 종목(축구)은 선택되지 않아야
    await expect(page.getByRole('button', { name: /축구/ })).not.toContainText('선택됨');
  });
});
