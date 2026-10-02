const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const fixture = JSON.parse(fs.readFileSync('/tmp/teameet-record-fixture.json', 'utf8'));
  const base = 'http://127.0.0.1:3016';
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const now = Math.floor(Date.now() / 1000);
  const signed = 'v1.' + Buffer.from(JSON.stringify({sub: fixture.userIds[0], iat: now, exp: now + 7 * 86400})).toString('base64url');
  const token = signed + '.' + require('node:crypto').createHmac('sha256', 'record-qa-local-only-session-secret-20260921').update(signed).digest('base64url');
  await context.addCookies([{name:'teameet_v1_session', value:token, url:base, httpOnly:true, sameSite:'Lax'}]);
  await context.addInitScript(id => { localStorage.setItem('teameet.v1.session', '1'); localStorage.setItem('teameet.v1.userId', id); }, fixture.userIds[0]);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e=>errors.push(String(e)));
  await page.goto(base + '/home');
  await page.waitForTimeout(1500);
  if (page.url().includes('/terms')) { await page.getByRole('button', {name:/전체 동의/}).click(); await page.getByRole('button', {name:'동의하고 계속하기'}).click(); await page.waitForURL('**/home'); }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, route] of [['detail', `/team-matches/${fixture.match.id}`], ['result', `/team-matches/${fixture.match.id}/result`]]) {
      await page.goto(base + route); await page.waitForTimeout(1800);
      await page.addStyleTag({content:'nextjs-portal { display:none !important; }'});
      const out = `output/playwright/visual-audit/team-match-shared-record/before/${width}-${name}.png`;
      fs.mkdirSync(path.dirname(out), {recursive:true}); await page.screenshot({path:out,fullPage:true});
      console.log(width, name, page.url(), (await page.locator('body').innerText()).slice(-600));
    }
  }
  fs.writeFileSync('output/playwright/visual-audit/team-match-shared-record/before/errors.json', JSON.stringify(errors,null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
