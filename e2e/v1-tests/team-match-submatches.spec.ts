import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loginAs } from './helpers/auth';
import { HOST_EMAIL, createApprovedTeamMatchWithHomeLineup } from './helpers/team-match-scenario';

const screenshotDir = path.resolve(process.cwd(), 'docs', 'screenshots', 'task172-team-match-submatches');

async function fillSubMatches(page: Page): Promise<void> {
  const addButton = page.getByRole('button', { name: '추가', exact: true });
  await addButton.click();
  await addButton.click();

  const titles = page.locator('input[id^="submatch-title-"]');
  const homeScores = page.locator('input[id^="submatch-home-"]');
  const awayScores = page.locator('input[id^="submatch-away-"]');
  await expect(titles).toHaveCount(2);

  await titles.nth(0).fill('전반전');
  await homeScores.nth(0).fill('2');
  await awayScores.nth(0).fill('1');
  await titles.nth(1).fill('후반전');
  await homeScores.nth(1).fill('1');
  await awayScores.nth(1).fill('3');

  await expect(page.getByTestId('submatch-total-score')).toContainText('3 : 4');
  await expect(page.locator('#result-home-score')).toHaveCount(0);
  await expect(page.locator('#result-away-score')).toHaveCount(0);
}

test.describe('[Task 172] 팀매치 서브매치 점수판', () => {
  test('서브매치 합산 점수를 검토하고 실제 제출한다', async ({ page, request }, testInfo) => {
    await mkdir(screenshotDir, { recursive: true });
    const consoleErrors: string[] = [];
    const failedApiRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (failedRequest) => {
      if (failedRequest.url().includes('/api/')) {
        failedApiRequests.push(`${failedRequest.method()} ${failedRequest.url()} ${failedRequest.failure()?.errorText ?? ''}`);
      }
    });

    const scenario = await createApprovedTeamMatchWithHomeLineup(request);
    await loginAs(page, HOST_EMAIL);
    await page.goto(`/team-matches/${scenario.teamMatchId}/result`);
    await expect(page.getByRole('button', { name: '추가', exact: true })).toBeVisible();
    await fillSubMatches(page);

    const isMobile = testInfo.project.name === 'mobile';
    const editingName = isMobile ? 'mobile-submatches-editing.png' : 'desktop-submatches-editing.png';
    await page.screenshot({ path: path.join(screenshotDir, editingName), fullPage: true });

    if (!isMobile) {
      await page.setViewportSize({ width: 834, height: 1112 });
      await page.screenshot({ path: path.join(screenshotDir, 'tablet-submatches-editing.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    await page.getByRole('button', { name: '결과 작성 완료', exact: true }).click();
    await expect(page.getByText('전반전', { exact: true })).toBeVisible();
    await expect(page.getByText('후반전', { exact: true })).toBeVisible();
    await expect(page.getByText(/3 : 4/).first()).toBeVisible();
    await page.getByRole('button', { name: '제출하기', exact: true }).click();

    await expect(page.getByText('상대팀 승인을 기다리고 있어요', { exact: true })).toBeVisible();
    await expect(page.getByTestId('submatch-breakdown').first()).toContainText('전반전');
    await expect(page.getByTestId('submatch-breakdown').first()).toContainText('후반전');

    const submittedName = isMobile ? 'mobile-submatches-submitted.png' : 'desktop-submatches-submitted.png';
    await page.screenshot({ path: path.join(screenshotDir, submittedName), fullPage: true });

    if (!isMobile) {
      await page.setViewportSize({ width: 834, height: 1112 });
      await page.screenshot({ path: path.join(screenshotDir, 'tablet-submatches-submitted.png'), fullPage: true });
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(failedApiRequests).toEqual([]);
  });
});
