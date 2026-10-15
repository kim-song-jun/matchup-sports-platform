// Headed alpha QA. Credentials and session state must stay in private files outside the repository.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const alpha = 'https://alpha.teameet.co.kr';

async function main() {
  if (!process.env.QA_CREDENTIALS_FILE || !process.env.QA_OUTPUT_DIR) throw new Error('QA_CREDENTIALS_FILE and QA_OUTPUT_DIR are required');
  const credentials = JSON.parse(await fs.readFile(process.env.QA_CREDENTIALS_FILE, 'utf8'));
  const output = process.env.QA_OUTPUT_DIR;
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  console.log('Owned headed browser tree:', process.pid, execFileSync('ps', ['--ppid', String(process.pid), '-o', 'pid,ppid,comm'], { encoding: 'utf8' }).trim());
  const evidence = { stage: process.env.QA_STAGE || 'before', origin: alpha, errors: [], consoleErrors: [], failures: [], viewports: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const observe = page => {
      page.on('pageerror', error => evidence.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push({ text: message.text(), url: message.location().url }); });
      page.on('response', response => { if (response.status() >= 400 && response.url().includes('/api/v1/admin/league-matches')) evidence.failures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    };
    context.on('page', observe);
    const page = await context.newPage();
    await page.goto(`${alpha}/login/email?redirect=${encodeURIComponent('/admin/league-matches')}`, { waitUntil: 'domcontentloaded' });
    // Alpha keeps background requests open. Prove hydration with an actual stateful UI action.
    let hydrated = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
      try {
        await page.waitForFunction(() => document.querySelector('input[placeholder="비밀번호"]')?.type === 'text', undefined, { timeout: 500 });
        hydrated = true;
        break;
      } catch { /* A click before hydration has no handler yet; retry that same UI action. */ }
    }
    if (!hydrated) throw new Error('Login form did not hydrate');
    await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
    await page.getByLabel('이메일', { exact: true }).fill(credentials.email);
    await page.getByLabel('비밀번호', { exact: true }).fill(credentials.password);
    const [login] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST'),
      page.getByRole('button', { name: '로그인', exact: true }).click(),
    ]);
    if (!login.ok()) { const error = await login.json(); throw new Error(`Alpha UI login failed (${login.status()}): ${error.code || ''} ${error.message || ''}`); }
    await page.waitForURL(url => url.pathname === '/admin/league-matches', { timeout: 30000 });
    await page.getByRole('heading').first().waitFor();
    const response = await context.request.get(`${alpha}/api/v1/admin/league-matches`);
    if (!response.ok()) throw new Error(`Admin list failed (${response.status()})`);
    const { data } = await response.json();
    const available = data.items.filter(item => !['completed', 'cancelled', 'on_hold'].includes(item.state));
    const league = process.env.QA_LEAGUE_ID
      ? available.find(item => item.leagueId === process.env.QA_LEAGUE_ID)
      : available.find(item => /QA|검증|테스트/i.test(item.title)) || available[0];
    if (!league) throw new Error('No unfinished league available for QA');
    evidence.leagueId = league.leagueId;
    evidence.title = league.title;
    const route = `${alpha}/admin/league-matches/${league.leagueId}`;
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: league.title, exact: true }).waitFor({ timeout: 30000 });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, `detail-${width}.png`), fullPage: true });
      evidence.viewports.push({ width, route: page.url(), editEntry: await page.getByRole('link', { name: '리그 정보', exact: true }).count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
    }
    if (evidence.stage === 'after') {
      await page.getByRole('link', { name: '리그 정보', exact: true }).click();
      await page.getByLabel('리그명', { exact: true }).waitFor();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(output, `edit-${width}.png`), fullPage: true });
        evidence.viewports.push({ width, route: page.url(), hydratedTitle: await page.getByLabel('리그명', { exact: true }).inputValue(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
      }
    }
    if (evidence.stage === 'after' && process.env.QA_VERIFY_SAVE === '1') {
      if (!/^\((QA|테스트)\)|^QA/i.test(league.title)) throw new Error('Write QA requires an explicitly labelled QA/test league');
      const endpoint = `${alpha}/api/v1/admin/league-matches/${league.leagueId}/settings`;
      const readSettings = async () => {
        const response = await context.request.get(endpoint);
        if (!response.ok()) throw new Error(`Settings read failed (${response.status()})`);
        return (await response.json()).data;
      };
      const original = await readSettings();
      const markerTitle = `${original.title} · 수정 QA`;
      const markerRules = `${original.rulesText}\n기본 정보 수정 저장·재조회 검증`.trim();
      const saveFrom = async target => {
        const [response] = await Promise.all([
          target.waitForResponse(response => response.url() === endpoint && response.request().method() === 'PATCH'),
          target.getByRole('button', { name: '변경사항 저장', exact: true }).click(),
        ]);
        return response;
      };
      try {
        const stalePage = await context.newPage();
        await stalePage.goto(`${route}/edit`, { waitUntil: 'domcontentloaded' });
        await stalePage.getByLabel('리그명', { exact: true }).waitFor();
        await page.getByLabel('리그명', { exact: true }).fill(markerTitle);
        await page.getByLabel('설명·운영 안내', { exact: true }).fill(markerRules);
        const saved = await saveFrom(page);
        if (!saved.ok()) throw new Error(`UI save failed (${saved.status()})`);
        await page.waitForURL(url => url.pathname === `/admin/league-matches/${league.leagueId}`);
        await page.getByRole('heading', { name: markerTitle, exact: true }).waitFor();
        const persisted = await readSettings();
        if (persisted.title !== markerTitle || persisted.rulesText !== markerRules) throw new Error('Saved fields did not persist');
        evidence.savedAndReloaded = true;
        if (league.isPublic) {
          const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          publicContext.on('page', observe);
          try {
            const publicPage = await publicContext.newPage();
            await publicPage.goto(`${alpha}/league-matches/${league.leagueId}`, { waitUntil: 'domcontentloaded' });
            const guide = publicPage.getByRole('region', { name: '리그 운영 안내', exact: true });
            await guide.getByText('기본 정보 수정 저장·재조회 검증', { exact: false }).waitFor();
            evidence.publicGuideVisible = (await guide.innerText()).includes(markerRules);
            for (const width of [390, 768, 1440]) {
              await publicPage.setViewportSize({ width, height: 1000 });
              await publicPage.waitForTimeout(350);
              await publicPage.screenshot({ path: path.join(output, `public-guide-${width}.png`), fullPage: true });
              evidence.viewports.push({ width, route: publicPage.url(), overflow: await publicPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
            }
          } finally { await publicContext.close(); }
        }

        await stalePage.getByLabel('리그명', { exact: true }).fill(`${original.title} · 오래된 초안`);
        const conflict = await saveFrom(stalePage);
        if (conflict.status() !== 409) throw new Error(`Expected stale 409, got ${conflict.status()}`);
        await stalePage.getByRole('alert').filter({ hasText: '최신 정보를 다시 불러와 주세요' }).waitFor();
        evidence.expectedStale409 = true;
        evidence.staleDraftPreserved = (await stalePage.getByLabel('리그명', { exact: true }).inputValue()).endsWith('오래된 초안');
        await stalePage.screenshot({ path: path.join(output, 'stale-draft-1440.png'), fullPage: true });
        await stalePage.close();
        await page.getByRole('link', { name: '리그 정보', exact: true }).click();
        await page.getByLabel('리그명', { exact: true }).waitFor();
        await page.getByLabel('리그명', { exact: true }).fill(original.title);
        await page.getByLabel('설명·운영 안내', { exact: true }).fill(original.rulesText);
        const restored = await saveFrom(page);
        if (!restored.ok()) throw new Error(`UI restore failed (${restored.status()})`);
        await page.waitForURL(url => url.pathname === `/admin/league-matches/${league.leagueId}`);
        evidence.restoredViaUI = true;
      } finally {
        const current = await readSettings();
        if (current.title === markerTitle || current.rulesText === markerRules) {
          const { title, rulesText, regionId, startsOn, endsOn, registrationDeadlineAt, updatedAt } = current;
          const restored = await context.request.patch(endpoint, { data: {
            title: title === markerTitle ? original.title : title,
            rulesText: rulesText === markerRules ? original.rulesText : rulesText,
            regionId, startsOn, endsOn, registrationDeadlineAt, expectedUpdatedAt: updatedAt,
          } });
          if (!restored.ok()) throw new Error(`QA cleanup failed (${restored.status()})`);
        }
        const restored = await readSettings();
        evidence.cleanupRestored = restored.title === original.title && restored.rulesText === original.rulesText
          && restored.startsOn === original.startsOn && restored.endsOn === original.endsOn
          && restored.regionId === original.regionId && restored.registrationDeadlineAt === original.registrationDeadlineAt;
        if (!evidence.cleanupRestored) throw new Error('QA values were not fully restored');
      }
    }
    await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally { await browser.close(); console.log('Owned headed browser closed.'); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
