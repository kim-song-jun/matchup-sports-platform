import { expect, test } from '@playwright/test';

test('account recovery waits for its interactive code before accepting a purpose', async ({ page }) => {
  let releaseScripts: () => void = () => {};
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route('**/_next/static/**/*.js', async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto('/auth/find-account', { waitUntil: 'commit' });
    const reset = page.getByRole('button', { name: '비밀번호 재설정', exact: true });
    const next = page.getByRole('button', { name: '다음', exact: true });
    await expect(reset).toBeDisabled();
    await expect(next).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('화면을 준비하고 있어요');
    releaseScripts();
    await expect(reset).toBeEnabled();
    await reset.click();
    await next.click();
    await expect(page.getByLabel('이메일')).toBeVisible();
  } finally {
    releaseScripts();
  }
});
