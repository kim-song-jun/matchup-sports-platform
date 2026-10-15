// Headed alpha session only. Auth state is supplied from an operator's real UI login; never embed credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const origin = 'https://alpha.teameet.co.kr';
const rosterPath = process.argv[6] ?? '/teams/ea6c8df8-fd86-4738-9dbd-f9cf6c83c3b5/games/1835d796-5b9f-42cd-b6f5-37af7ba5b1b6/roster';
assert.match(rosterPath, /^\/teams\/[0-9a-f-]+\/games\/[0-9a-f-]+\/roster$/);
const expectedRole = process.argv[7] ?? 'ADMIN';
assert(['ADMIN', 'TEAM_MANAGER'].includes(expectedRole));
const capturePrefix = expectedRole === 'ADMIN' ? 'after' : 'after-manager';
const apiPath = '/api/v1' + rosterPath;
const output = 'docs/screenshots/league-roster-goalkeepers-2026-10-14';
const report = { persona: expectedRole, rosterPath, widths: [], consoleErrors: [], pageErrors: [], httpErrors: [], scenarios: [], restored: false };
const contexts = [];
let original;
let adminPage;

function watch(page) {
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) report.httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
}

async function enter(browser, storageState) {
  const context = await browser.newContext({ storageState, viewport: { width: 390, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  watch(page);
  const authenticated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/me');
  await page.goto(origin + '/home');
  assert.equal((await authenticated).status(), 200);
  await page.getByRole('link', { name: '마이', exact: true }).first().waitFor();
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === apiPath);
  await page.goto(origin + rosterPath);
  const response = await loaded;
  assert.equal(response.status(), 200);
  const data = (await response.json()).data;
  await page.getByRole('heading', { name: `출전 ${data.participants.length}명`, exact: true }).waitFor();
  return { page, data };
}

async function reload(page) {
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === apiPath);
  await page.reload();
  const response = await loaded;
  assert.equal(response.status(), 200);
  const data = (await response.json()).data;
  await page.getByRole('heading', { name: `출전 ${data.participants.length}명`, exact: true }).waitFor();
  return data;
}

const button = (page, player) => page.getByRole('button', { name: new RegExp(`^${player.displayName}(, 골키퍼 지정 해제| 골키퍼로 지정)$`) });
async function setRole(page, player, value) {
  const control = button(page, player);
  const current = (await control.getAttribute('aria-pressed')) === 'true';
  if (current !== value) await control.click();
}
async function save(page) {
  const control = page.getByRole('button', { name: /^저장 \(\d+건\)$/ });
  if (await control.count() === 0) return;
  const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/game-rosters/batch'));
  await control.click();
  const response = await saved;
  assert.equal(response.status(), 200, JSON.stringify(await response.json()));
  await page.getByText('명단을 저장했어요.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '저장', exact: true }).waitFor();
}
function unchangedPlayers(data) {
  assert.deepEqual(data.base.map((row) => [row.userId, row.jerseyNumber, row.status]), original.base.map((row) => [row.userId, row.jerseyNumber, row.status]));
  assert.deepEqual(data.counts, original.counts);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const [sessionFile, adminState, memberState, expectedCommit] = process.argv.slice(2);
  assert.match(expectedCommit ?? '', /^[0-9a-f]{40}$/);
  const headers = await fetch(origin + '/landing').then((response) => response.headers);
  report.commit = headers.get('x-teameet-commit');
  assert.equal(report.commit, expectedCommit);
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  report.browserPid = session.browserPid;
  report.launcherPid = session.nodePid;
  const browser = await chromium.connect(session.endpoint);
  try {
    const admin = await enter(browser, adminState);
    adminPage = admin.page;
    original = admin.data;
    assert.equal(original.viewerRole, expectedRole);
    assert.equal(original.editable, true);
    assert.equal(original.legacyLineupPending, false);
    assert(original.base.every((row) => typeof row.goalkeeper === 'boolean'));
    const players = original.participants.filter((row) => !row.goalkeeper).slice(0, 2);
    assert.equal(players.length, 2, 'Need two unselected fixture players to exercise independent selection');
    for (const player of players) await setRole(adminPage, player, true);
    await save(adminPage);
    let data = await reload(adminPage);
    for (const player of players) assert.equal(data.participants.find((row) => row.userId === player.userId).goalkeeper, true);
    unchangedPlayers(data);
    report.scenarios.push('two independent goalkeepers saved and reloaded; jerseys and attendance preserved');
    for (const width of [390, 768, 1440]) {
      await adminPage.setViewportSize({ width, height: 1000 });
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      const controls = adminPage.getByRole('button', { name: /골키퍼/ });
      assert.equal(await controls.count(), original.base.length);
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        assert(box && box.width >= 44 && box.height >= 44);
      }
      await adminPage.screenshot({ path: `${output}/${capturePrefix}-${width}.png`, fullPage: true });
      report.widths.push({ width, goalkeeperControls: original.base.length, overflow: false, touchTargets: 'PASS' });
    }
    if (memberState !== '-') {
      const member = await enter(browser, memberState);
      assert.equal(member.data.viewerRole, 'TEAM_MEMBER');
      assert.equal(member.data.editable, false);
      assert.equal(await member.page.getByRole('button', { name: /골키퍼/ }).count(), 0);
      assert.equal(await member.page.getByText(/ · GK$/).count(), players.length);
      await member.page.screenshot({ path: `${output}/after-member-390.png`, fullPage: true });
      report.scenarios.push('actual team member sees both GK labels and has no role edit controls');
      }
    await setRole(adminPage, players[0], false);
    await save(adminPage);
    data = await reload(adminPage);
    assert.equal(data.participants.find((row) => row.userId === players[0].userId).goalkeeper, false);
    assert.equal(data.participants.find((row) => row.userId === players[1].userId).goalkeeper, true);
    unchangedPlayers(data);
    report.scenarios.push('clearing one goalkeeper preserves the other');
  } finally {
    if (adminPage && original) {
      try {
        await reload(adminPage);
        for (const player of original.base) await setRole(adminPage, player, player.goalkeeper);
        await save(adminPage);
        const restored = await reload(adminPage);
        unchangedPlayers(restored);
        assert.deepEqual(restored.base.map((row) => [row.userId, row.goalkeeper]), original.base.map((row) => [row.userId, row.goalkeeper]));
        report.restored = true;
      } catch (error) { report.restoreError = error.message; }
    }
    for (const context of contexts) await context.close();
    fs.writeFileSync(`${output}/${capturePrefix}-report.json`, JSON.stringify(report, null, 2));
  }
  assert.equal(report.restored, true);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.httpErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  console.log(JSON.stringify(report));
  process.exit(0);
})().catch((error) => { console.error(error.message); fs.writeFileSync(`${output}/${capturePrefix}-report.json`, JSON.stringify({ ...report, failure: error.message }, null, 2)); process.exit(1); });
