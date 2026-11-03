import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

// A native shell publishes the measured inset to these variables. Browser tests model that
// boundary in CSS pixels; device tests must still verify the real native bridge and keyboard.
async function setNativeBottom(page: import('@playwright/test').Page, pixels: number) {
  await page.evaluate((bottom) => {
    document.documentElement.style.setProperty('--teameet-native-safe-bottom', `${bottom}px`);
    document.documentElement.style.setProperty('--v1-shell-safe-bottom', `${bottom}px`);
  }, pixels);
}

async function expectAboveSystemBar(locator: import('@playwright/test').Locator, bottom: number) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  const height = await locator.page().evaluate(() => window.innerHeight);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(height - bottom);
}

test.describe('mobile safe area and touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'These contracts exercise mobile viewport and touch.');
  test.use({ viewport: { width: 390, height: 640 } });

  test('login footer can be scrolled above the native navigation area', async ({ page }) => {
    await page.goto('/login');
    const business = page.getByRole('link', { name: '사업자 정보' });
    await expect(business).toBeVisible();
    await setNativeBottom(page, 48);
    await page.locator('.tm-auth-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expectAboveSystemBar(business, 48);
  });

  test('the unsaved team form dialog keeps both actions above the native navigation area', async ({ page }) => {
    await loginAs(page, personas.owner.email);
    await page.goto('/teams/new');
    await page.getByPlaceholder('예: 성수 풋살 크루').fill('안전 영역 검증');
    await page.getByRole('link', { name: '뒤로가기' }).click();
    const dialog = page.getByRole('dialog', { name: '작성 중인 내용이 사라져요. 나갈까요?' });
    await expect(dialog).toBeVisible();
    await setNativeBottom(page, 48);
    await expectAboveSystemBar(dialog.getByRole('button', { name: '계속 작성' }), 48);
    await expectAboveSystemBar(dialog.getByRole('button', { name: '나가기' }), 48);
    await dialog.getByRole('button', { name: '계속 작성' }).click();
  });

  test('map action sheet keeps every app choice above the native navigation area', async ({ page }) => {
    const matchId = process.env.TEAMEET_QA_TEAM_MATCH_ID ?? '00000000-0000-4000-8000-000000000301';
    await page.goto(`/team-matches/${matchId}`);
    await page.getByRole('button', { name: /^(길찾기|지도 앱에서 찾기)$/ }).click();
    const dialog = page.getByRole('dialog', { name: /^(길찾기|지도 앱에서 찾기)$/ });
    await expect(dialog).toBeVisible();
    await setNativeBottom(page, 48);
    const choices = dialog.locator('li a, li button');
    expect(await choices.count()).toBeGreaterThan(0);
    for (const choice of await choices.all()) await expectAboveSystemBar(choice, 48);
  });

  test('a touch swipe scrolls a long competition filter without closing it', async ({ page }) => {
    await page.goto('/tournaments?kind=tournament&filter=1');
    const dialog = page.getByRole('dialog', { name: '대회·리그 필터' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    await expect.poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const session = await page.context().newCDPSession(page);
    const x = box!.x + 8;
    const y = box!.y + box!.height - 100;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 80 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 160 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(dialog).toBeVisible();
    await session.detach();
  });
});
