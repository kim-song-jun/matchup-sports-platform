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

async function openManagedTeam(page: import('@playwright/test').Page) {
  await loginAs(page, personas.owner.email);
  await page.goto('/my/teams');
  const managedTeam = page.locator('a[href^="/teams/"]').filter({ has: page.getByText('팀장', { exact: true }) }).first();
  await expect(managedTeam).toBeVisible();
  await managedTeam.click();
  await expect(page).toHaveURL(/\/teams\/[^/?]+(?:\?|$)/);
  return new URL(page.url()).pathname;
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

  test('a page without a tab bar scrolls under the native inset and ends clear of it', async ({ page }) => {
    await page.goto('/notices');
    const scroller = page.locator('.tm-scroll-area');
    await expect(scroller).toBeVisible();
    await scroller.evaluate((node) => {
      const spacer = document.createElement('div');
      spacer.id = 'e2e-end-spacer';
      spacer.style.height = '2000px';
      node.appendChild(spacer);
    });
    await setNativeBottom(page, 48);
    const height = await page.evaluate(() => window.innerHeight);
    await expect.poll(async () => {
      const box = await scroller.boundingBox();
      return box ? Math.abs(box.y + box.height - height) : null;
    }).toBeLessThanOrEqual(1);
    await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    const spacer = await page.locator('#e2e-end-spacer').boundingBox();
    expect(spacer).not.toBeNull();
    expect(Math.abs(spacer!.y + spacer!.height - (height - 48))).toBeLessThanOrEqual(1);
  });

  test('a page with fixed actions does not reserve the native inset a second time at its scroller end', async ({ page }) => {
    await loginAs(page, personas.owner.email);
    await page.goto('/teams/new');
    await expect(page.locator('.tm-fixed-cta')).toBeVisible();
    await setNativeBottom(page, 48);
    const scroller = page.locator('.tm-scroll-area');
    const height = await page.evaluate(() => window.innerHeight);
    await expect.poll(() => scroller.evaluate((node) => getComputedStyle(node).paddingBottom)).toBe('0px');
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - height)).toBeLessThanOrEqual(1);
  });

  test('a late native inset keeps the last auth content above its fixed actions', async ({ page }) => {
    await page.goto('/auth/account-conflict');
    const content = page.locator('.tm-auth-scroll');
    const actions = page.locator('.tm-auth-fixed-cta');
    const help = page.getByRole('link', { name: '고객센터에 알려 주세요' });
    await expect(help).toBeAttached();
    await setNativeBottom(page, 0);
    await expect.poll(() => actions.evaluate((node) => node.closest<HTMLElement>('.tm-auth-frame')!.style.getPropertyValue('--tm-auth-cta-height')))
      .toBe(`${await actions.evaluate((node) => node.offsetHeight)}px`);
    await setNativeBottom(page, 48);
    await expect.poll(async () => {
      const scrollBox = await content.boundingBox();
      const actionBox = await actions.boundingBox();
      return scrollBox && actionBox ? Math.round(scrollBox.y + scrollBox.height - actionBox.y) : null;
    }).toBeLessThanOrEqual(0);
    await content.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    const helpBox = await help.boundingBox();
    const actionBox = await actions.boundingBox();
    expect(helpBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(helpBox!.y + helpBox!.height).toBeLessThanOrEqual(actionBox!.y);
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

  test('team jersey number actions remain reachable with a late inset and a short viewport', async ({ page }) => {
    await openManagedTeam(page);
    await page.getByRole('link', { name: /^멤버 관리/ }).click();
    await page.getByRole('button', { name: / 관리$/ }).first().click();
    await page.getByRole('button', { name: '등번호 지정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /님 등번호$/ });
    const input = dialog.getByRole('spinbutton');
    const save = dialog.getByRole('button', { name: '저장', exact: true });
    await expect(input).toBeFocused();
    for (const bottom of [0, 34, 48, 64]) {
      await setNativeBottom(page, bottom);
      await dialog.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      await expectAboveSystemBar(save, bottom);
    }
    await page.setViewportSize({ width: 320, height: 360 });
    await input.fill('1000');
    await expect(dialog.getByText('0부터 999 사이의 숫자를 넣어 주세요.')).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expectAboveSystemBar(save, 64);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('team dissolution content remains above its actions when a native inset arrives', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const teamPath = await openManagedTeam(page);
    await page.goto(`${teamPath}/dissolve`);
    const actions = page.locator('.tm-fixed-cta');
    await expect(actions).toBeVisible();
    const scroller = page.locator('.tm-scroll-area');
    const content = scroller.locator('.tm-content-enter').filter({ has: page.getByRole('heading', { level: 2 }) });
    const lastContent = content.locator(':scope > :last-child');
    await expect(lastContent).toBeVisible();
    for (const bottom of [0, 34, 48, 64]) {
      await setNativeBottom(page, bottom);
      await expect.poll(async () => {
        await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        const last = await lastContent.boundingBox();
        const cta = await actions.boundingBox();
        return last && cta ? Math.round(last.y + last.height - cta.y) : null;
      }).toBeLessThanOrEqual(0);
    }
  });

  test('withdrawal reason remains above fixed actions as the native inset changes', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await loginAs(page, personas.owner.email);
    await page.goto('/my/settings/withdrawal');
    const reason = page.getByPlaceholder('선택 입력');
    const scroller = page.locator('.tm-scroll-area');
    const actions = page.locator('.tm-my-withdrawal-cta');
    await expect(reason).toBeVisible();
    for (const bottom of [0, 34, 48, 64]) {
      await setNativeBottom(page, bottom);
      await expect.poll(async () => {
        await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        const target = await reason.boundingBox();
        const cta = await actions.boundingBox();
        return target && cta ? Math.round(target.y + target.height - cta.y) : null;
      }).toBeLessThanOrEqual(0);
    }
  });

  test('location status card remains above fixed actions as the native inset changes', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await loginAs(page, personas.owner.email);
    await page.goto('/my/settings/location');
    const status = page.locator('.tm-my-location-desktop .tm-on-tint');
    const scroller = page.locator('.tm-scroll-area');
    const actions = page.locator('.tm-my-location-cta');
    await expect(status).toBeVisible();
    for (const bottom of [0, 34, 48, 64]) {
      await setNativeBottom(page, bottom);
      await expect.poll(async () => {
        await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        const target = await status.boundingBox();
        const cta = await actions.boundingBox();
        return target && cta ? Math.round(target.y + target.height - cta.y) : null;
      }).toBeLessThanOrEqual(0);
    }
  });

  test('profile notice remains above actions after the keyboard closes and an inset arrives', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await loginAs(page, personas.owner.email);
    await page.goto('/my/profile/edit');
    await expect(page.locator('#v1-profile-nickname')).toBeVisible();
    await setNativeBottom(page, 0);
    await page.evaluate(() => { document.documentElement.dataset.teameetNativeKeyboard = 'open'; });
    await page.locator('#v1-profile-nickname').fill('임시검수이름');
    await expect(page.getByText('변경한 닉네임과 이메일은 중복 확인 후 저장할 수 있어요.')).toBeVisible();
    const notice = page.locator('#v1-profile-edit-form .tm-on-tint');
    const scroller = page.locator('.tm-scroll-area');
    const actions = page.locator('.tm-my-profile-edit-cta');
    await expect.poll(() => scroller.evaluate((node) => node.style.getPropertyValue('--tm-create-cta-height'))).toBe('0px');
    await page.evaluate(() => { delete document.documentElement.dataset.teameetNativeKeyboard; });
    await expect.poll(async () => {
      await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const target = await notice.boundingBox();
      const cta = await actions.boundingBox();
      return target && cta ? Math.round(target.y + target.height - cta.y) : null;
    }).toBeLessThanOrEqual(0);
    await setNativeBottom(page, 48);
    await expect.poll(async () => {
      await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const target = await notice.boundingBox();
      const cta = await actions.boundingBox();
      return target && cta ? Math.round(target.y + target.height - cta.y) : null;
    }).toBeLessThanOrEqual(0);
  });

  test('profile form fits inside a narrow mobile scroll area', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await loginAs(page, personas.owner.email);
    await page.goto('/my/profile/edit');
    await expect(page.locator('#v1-profile-nickname')).toBeVisible();
    const scroll = page.locator('.tm-scroll-area');
    await expect.poll(() => scroll.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    const guidance = page.locator('#v1-profile-edit-form .tm-auth-profile-upload-body .tm-text-caption');
    await expect.poll(() => guidance.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    const card = await page.locator('#v1-profile-edit-form .tm-on-tint').boundingBox();
    expect(card).not.toBeNull();
    expect(card!.x + card!.width).toBeLessThanOrEqual(320);
  });

  for (const [name, route] of [
    ['match', '/matches/new'],
    ['team match', '/team-matches/new'],
    ['team', '/teams/new'],
  ] as const) {
    test(`${name} creation keeps its final control above the fixed actions after an inset arrives`, async ({ page }) => {
      await loginAs(page, personas.owner.email);
      await page.goto(route);
      const shell = page.locator('.tm-create-shell');
      const scroller = page.locator('.tm-scroll-area');
      const actions = page.locator('.tm-fixed-cta');
      await expect(shell).toBeVisible();
      await expect(actions).toBeVisible();
      await setNativeBottom(page, 0);
      await setNativeBottom(page, 48);
      await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const lastControl = shell.locator('a:visible, button:visible, input:visible, select:visible, textarea:visible').last();
      await expect(lastControl).toBeVisible();
      await expect.poll(async () => {
        await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        const target = await lastControl.boundingBox();
        const cta = await actions.boundingBox();
        return target && cta ? Math.round(target.y + target.height - cta.y) : null;
      }).toBeLessThanOrEqual(0);
    });
  }

  test('recorded team names and score fit a narrow mobile screen', async ({ page }) => {
    const matchId = process.env.TEAMEET_QA_TEAM_MATCH_RECORD_ID;
    test.skip(!matchId, 'Requires a QA team match with recorded submatches.');
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/team-matches/${matchId}/record`);
    const score = page.locator('[class*="subScore"]').first();
    await expect(score).toBeVisible();
    await expect(score.locator('span')).toHaveCount(2);
    const scroll = page.locator('.tm-scroll-area');
    await expect.poll(() => scroll.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    for (const team of await score.locator('span').all()) {
      const box = await team.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      await expect.poll(() => team.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    }
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
