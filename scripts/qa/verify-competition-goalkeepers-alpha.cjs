// Connect only to an operator-owned headed Chrome session with real UI login states.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const origin = 'https://alpha.teameet.co.kr';
const [sessionFile, adminState, targetFile, expectedCommit] = process.argv.slice(2);
const target = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
const output = 'docs/screenshots/competition-goalkeeper-defaults-2026-10-14';
const report = { widths: [], scenarios: [], consoleErrors: [], pageErrors: [], httpErrors: [], restored: false };
const contexts = [];
let original, adminPage, panel, readyForWrites = false;
const matrixPath = `/api/v1/admin/tournaments/${target.competitionId}/registrations/${target.registrationId}/game-rosters`;

function watch(page) {
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) report.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
}
async function readResponse(response) {
  assert.equal(response.status(), 200);
  return (await response.json()).data;
}
function matrixResponse(page) {
  return page.waitForResponse((response) => new URL(response.url()).pathname === matrixPath).then(readResponse);
}
async function openPanel(page) {
  const loaded = matrixResponse(page);
  await page.getByText(target.teamName, { exact: true }).locator('xpath=ancestor::*[.//button[normalize-space()="경기별 명단"]][1]').getByRole('button', { name: '경기별 명단', exact: true }).click();
  const data = await loaded;
  await page.getByRole('region', { name: `${target.teamName} 경기별 명단`, exact: true }).waitFor();
  return data;
}
async function reloadPanel(page) {
  await page.reload();
  await page.getByText(target.teamName, { exact: true }).first().waitFor();
  return openPanel(page);
}
function control(page, player) {
  return page.getByRole('button', { name: player.displayName + (player.selected ? ', 골키퍼 지정 해제' : ' 골키퍼로 지정'), exact: true });
}
async function setRole(page, player, value) {
  const pressed = page.getByRole('button', { name: `${player.displayName}, 골키퍼 지정 해제`, exact: true });
  const selected = await pressed.count() > 0;
  if (selected !== value) await control(page, { ...player, selected }).click();
}
async function save(page) {
  const button = page.getByRole('button', { name: /^변경 \d+건 저장$/ });
  if (await button.count() === 0) return;
  const refreshed = matrixResponse(page);
  const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/game-rosters/batch'));
  await button.click();
  assert.equal((await saved).status(), 200);
  await refreshed;
  await page.getByRole('button', { name: '저장', exact: true }).last().waitFor();
}
function statuses(data) {
  return data.players.map((player) => [player.userId, player.cells.map((cell) => [cell.gameId, cell.status])]);
}
function role(data, userId) {
  const player = data.players.find((row) => row.userId === userId);
  assert(player);
  return player.cells.filter((cell) => cell.status !== 'NOT_IN_ROSTER').map((cell) => cell.goalkeeper);
}
async function confirmRosterPages(browser, data, selectedIds) {
  const context = await browser.newContext({ storageState: adminState, viewport: { width: 390, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage(); watch(page);
  await page.goto(origin + '/home');
  await page.getByRole('link', { name: '마이', exact: true }).first().waitFor();
  for (const game of data.games) {
    const path = `/teams/${data.teamId}/games/${game.gameId}/roster`;
    const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1' + path).then(readResponse);
    await page.goto(origin + path);
    const roster = await loaded;
    for (const userId of selectedIds) assert.equal(roster.base.find((row) => row.userId === userId)?.goalkeeper, true);
    await page.getByRole('heading', { name: `출전 ${roster.participants.length}명`, exact: true }).waitFor();
    await page.screenshot({ path: `${output}/after-game-${game.gameId}-390.png`, fullPage: true });
  }
}

(async () => {
  assert.match(expectedCommit, /^[0-9a-f]{40}$/);
  fs.mkdirSync(output, { recursive: true });
  report.commit = (await fetch(origin + '/landing')).headers.get('x-teameet-commit');
  assert.equal(report.commit, expectedCommit);
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  report.browserPid = session.browserPid; report.launcherPid = session.nodePid;
  const browser = await chromium.connect(session.endpoint);
  try {
    const context = await browser.newContext({ storageState: adminState, viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    adminPage = await context.newPage(); watch(adminPage);
    const authenticated = adminPage.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/me');
    await adminPage.goto(origin + '/home'); assert.equal((await authenticated).status(), 200);
    await adminPage.getByRole('link', { name: '마이', exact: true }).first().waitFor();
    await adminPage.goto(`${origin}/admin/league-matches/${target.competitionId}/registrations`);
    await adminPage.getByText(target.teamName, { exact: true }).first().waitFor();
    original = await openPanel(adminPage);
    assert.equal(original.teamId, target.teamId); assert.equal(original.viewerRole, 'ADMIN');
    assert(original.games.length >= 2, 'Need at least two upcoming fixture columns for propagation');
    for (const player of original.players) assert(new Set(role(original, player.userId)).size === 1, 'Do not alter mixed legacy fixture designations in QA');
    const players = original.players.filter((player) => role(original, player.userId).every((value) => value === false)).slice(0, 2);
    assert.equal(players.length, 2);
    readyForWrites = true;
    for (const player of players) await setRole(adminPage, player, true);
    await save(adminPage);
    let data = await reloadPanel(adminPage);
    for (const player of players) assert(role(data, player.userId).every((value) => value === true));
    assert.deepEqual(statuses(data), statuses(original));
    report.scenarios.push('admin saves two GK selections; reload retains both across all upcoming fixtures; attendance preserved');
    panel = adminPage.getByRole('region', { name: `${target.teamName} 경기별 명단`, exact: true });
    for (const width of [390, 768, 1440]) {
      await adminPage.setViewportSize({ width, height: 1000 });
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      for (const button of await panel.getByRole('button', { name: /골키퍼/ }).all()) {
        const box = await button.boundingBox(); assert(box && box.width >= 44 && box.height >= 44);
      }
      await panel.screenshot({ path: `${output}/after-admin-${width}.png` });
      report.widths.push({ width, pageOverflow: false, goalkeeperTouchTargets: 'PASS' });
    }
    await confirmRosterPages(browser, data, players.map((player) => player.userId));
    report.scenarios.push('both actual game roster pages show the administrator-selected goalkeepers');
    await setRole(adminPage, players[0], false); await save(adminPage);
    data = await reloadPanel(adminPage);
    assert(role(data, players[0].userId).every((value) => value === false));
    assert(role(data, players[1].userId).every((value) => value === true));
    assert.deepEqual(statuses(data), statuses(original));
    report.scenarios.push('clearing one GK propagates to both fixtures and preserves the other');
  } finally {
    if (readyForWrites && adminPage && original) {
      try {
        await reloadPanel(adminPage);
        for (const player of original.players) await setRole(adminPage, player, role(original, player.userId)[0]);
        await save(adminPage);
        const restored = await reloadPanel(adminPage);
        assert.deepEqual(statuses(restored), statuses(original));
        for (const player of original.players) assert.deepEqual(role(restored, player.userId), role(original, player.userId));
        report.restored = true;
      } catch (error) { report.restoreError = error.message; }
    }
    for (const context of contexts) await context.close();
    fs.writeFileSync(`${output}/after-report.json`, JSON.stringify(report, null, 2));
  }
  assert.equal(report.restored, true);
  assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.httpErrors, []);
  console.log(JSON.stringify(report)); process.exit(0);
})().catch((error) => {
  console.error(error.message);
  fs.writeFileSync(`${output}/after-report.json`, JSON.stringify({ ...report, failure: error.message }, null, 2));
  process.exit(1);
});
