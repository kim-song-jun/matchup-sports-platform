const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');

const base = process.env.SUBMATCH_QA_ORIGIN || 'http://127.0.0.1:13014';
const root = path.resolve('docs/screenshots/team-match-shared-record-submatches/after');
const fixtures = JSON.parse(fs.readFileSync('output/qa/submatch-fixtures.json', 'utf8')).fixtures;
const secret = 'record-qa-local-only-session-secret-20260922';
const results = [];
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
let browser;

function cookie(userId) {
  const iat = Math.floor(Date.now() / 1000);
  const value = `v1.${Buffer.from(JSON.stringify({ sub: userId, iat, exp: iat + 7 * 86400 })).toString('base64url')}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

async function createContext(userId, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  if (userId) {
    await context.addCookies([{ name: 'teameet_v1_session', value: cookie(userId), url: base, httpOnly: true, sameSite: 'Lax' }]);
    await context.addInitScript((id) => {
      localStorage.setItem('teameet.v1.session', '1');
      localStorage.setItem('teameet.v1.userId', id);
    }, userId);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push({ width, error: String(error) }));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push({ width, message: message.text(), location: message.location() }); });
  page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/api/v1/') && !response.url().includes('/auth/me')) failedRequests.push({ width, status: response.status(), url: response.url() }); });
  return { context, page };
}

async function shot(page, width, step) {
  await page.addStyleTag({ content: 'nextjs-portal {display:none!important}' });
  const file = path.join(root, `${width}-${step}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  results.push({ width, step, url: page.url(), dimensions, file: file.replaceAll('\\', '/') });
  console.log('PASS', width, step);
}

(async () => {
  fs.mkdirSync(root, { recursive: true });
  browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  for (const [index, width] of [390, 768, 1440].entries()) {
    const fixture = fixtures[index];
    const host = await createContext(fixture.userIds[1], width);
    const away = await createContext(fixture.userIds[3], width);
    const publicUser = await createContext(null, width);

    await host.page.goto(`${base}/team-matches/${fixture.match.id}`);
    await expect(host.page).toHaveURL(new RegExp(`/team-matches/${fixture.match.id}/record$`));
    await expect(host.page.getByRole('heading', { name: '함께 쓰는 경기 기록' })).toBeVisible();
    await shot(host.page, width, '01-shared-scoreboard-without-submatches');

    await host.page.getByRole('button', { name: '서브매치 추가' }).click();
    await host.page.getByLabel('서브매치 이름').fill('1경기');
    await host.page.getByRole('button', { name: '서브매치 만들기' }).click();
    await expect(host.page.getByText('1경기', { exact: true })).toBeVisible();
    await shot(host.page, width, '02-first-submatch-created');

    await host.page.getByRole('button', { name: '이 서브매치에 득점 추가' }).click();
    await expect(host.page.getByRole('group', { name: '득점 선수' })).toBeVisible();
    await expect(host.page.locator('.tm-my-avatar img')).toHaveCount(2);
    await shot(host.page, width, '03-player-photo-scorer-picker');
    await host.page.getByRole('radio', { name: new RegExp(fixture.participants[0].displayNameSnapshot) }).click();
    await host.page.getByLabel('득점 시간 (선택)').fill('12');
    await host.page.getByRole('button', { name: '득점 등록' }).click();
    await expect(host.page.getByLabel('점수 1 대 0', { exact: true })).toBeVisible();

    await host.page.getByRole('button', { name: '이름 수정' }).click();
    await expect(host.page.getByRole('form', { name: '1경기 이름 변경' })).toBeVisible();
    await expect(host.page.getByText('1경기', { exact: true })).toHaveCount(0);
    await host.page.getByLabel('서브매치 이름').fill('전반 A조 매치');
    await shot(host.page, width, '04-inline-submatch-rename');
    await host.page.getByRole('button', { name: '이름 저장' }).click();
    await expect(host.page.getByText('전반 A조 매치', { exact: true })).toBeVisible();

    await host.page.getByRole('button', { name: '서브매치 추가' }).click();
    await host.page.getByLabel('서브매치 이름').fill('2경기');
    await host.page.getByRole('button', { name: '서브매치 만들기' }).click();
    await expect(host.page.getByText('2경기', { exact: true })).toBeVisible();
    await host.page.getByRole('button', { name: '이 서브매치에 득점 추가' }).nth(1).click();
    await host.page.getByLabel('득점 팀').selectOption(fixture.sides[1].id);
    await host.page.getByRole('radio', { name: new RegExp(fixture.participants[2].displayNameSnapshot) }).click();
    await host.page.getByLabel('득점 시간 (선택)').fill('25');
    await host.page.getByRole('button', { name: '득점 등록' }).click();
    await expect(host.page.getByLabel('점수 1 대 1', { exact: true })).toBeVisible();
    await expect(host.page.getByLabel('전반 A조 매치 점수 1 대 0')).toBeVisible();
    await expect(host.page.getByLabel('2경기 점수 0 대 1')).toBeVisible();
    await shot(host.page, width, '05-aggregate-and-submatch-scores');

    await away.page.goto(`${base}/team-matches/${fixture.match.id}`);
    await expect(away.page).toHaveURL(new RegExp(`/team-matches/${fixture.match.id}/record$`));
    await expect(away.page.getByLabel('점수 1 대 1', { exact: true })).toBeVisible();
    await shot(away.page, width, '06-other-team-participant-synced');

    await publicUser.page.goto(`${base}/team-matches/${fixture.match.id}`);
    await expect(publicUser.page.getByRole('region', { name: '경기 현황' })).toBeVisible();
    await expect(publicUser.page.getByText('전반 A조 매치', { exact: true })).toBeVisible();
    await shot(publicUser.page, width, '07-public-detail-breakdown');

    await host.page.getByRole('button', { name: '우리 팀 종료 확인' }).click();
    await shot(host.page, width, '08-one-game-confirmation');
    await host.page.getByRole('button', { name: '이 기록으로 종료 확인' }).click();
    await expect(away.page.getByText('확인 완료', { exact: true })).toHaveCount(1, { timeout: 10000 });
    await away.page.getByRole('button', { name: '우리 팀 종료 확인' }).click();
    await away.page.getByRole('button', { name: '이 기록으로 종료 확인' }).click();
    await expect(host.page.getByText('결과가 확정되어 기록이 잠겼어요.')).toBeVisible({ timeout: 10000 });
    await shot(host.page, width, '09-official-one-game-locked');

    await publicUser.page.goto(`${base}/team-matches`);
    await expect(publicUser.page.locator('main')).toBeVisible();
    await shot(publicUser.page, width, '10-team-match-list-after-official');

    await host.context.close();
    await away.context.close();
    await publicUser.context.close();
  }
  const evidence = { results, pageErrors, consoleErrors, failedRequests };
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
})().catch((error) => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'failure.json'), JSON.stringify({ error: String(error), results, pageErrors, consoleErrors, failedRequests }, null, 2));
  console.error(error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });