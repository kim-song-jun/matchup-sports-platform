// 대회 어드민 + 소비자 신청/명단/상태 화면 시각 검증. web 3013(→8121) 전제.
// Output: docs/visual-qa/tournament-flow/<name>.png   Run: node scripts/capture_tournament_admin_flow.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/tournament-flow');
const ADMIN = ['dba4a3c4-f628-4d22-9084-2b11f967120b', 'admin@teameet.v1'];
const MGR101 = ['39adc75a-0702-45bd-b5fd-4cf2d295f7fd', 'owner@teameet.v1'];
const TID = 'ebe29be8-dba6-41c8-8ccf-b1747410b4e7';
const REG101 = '080050c6-8807-44b7-bf86-1c05152fb097';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

// [name, route, auth, width, assertSubstrings]
const SHOTS = [
  ['admin-list', '/admin/tournaments', ADMIN, 1440, ['챔피언십']],
  ['admin-new', '/admin/tournaments/new', ADMIN, 1440, ['만들기', '참가비']],
  ['admin-detail', `/admin/tournaments/${TID}`, ADMIN, 1440, ['챔피언십', '신청']],
  ['consumer-apply', `/tournaments/${TID}/apply`, MGR101, 390, ['팀']],
  ['consumer-my', `/tournaments/${TID}/my?reg=${REG101}`, MGR101, 390, ['참가 확정']],
  ['consumer-roster', `/tournaments/${TID}/registrations/${REG101}/roster`, MGR101, 390, ['명단']],
];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const out = {};
  for (const [name, route, auth, w, asserts] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); }, auth);
    const page = await ctx.newPage();
    const errs = [], net4xx = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
    page.on('response', (r) => { if (r.status() >= 400) { try { net4xx.push(`${r.status()} ${new URL(r.url()).pathname}`); } catch { /* */ } } });
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForTimeout(1300);
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.screenshot({ path: path.join(ROOT, `${name}.png`), fullPage: true, scale: 'css' });
      const txt = await page.evaluate(() => document.body.innerText);
      out[name] = {
        asserts: Object.fromEntries(asserts.map((s) => [s, txt.includes(s)])),
        console: [...new Set(errs)].slice(0, 4),
        net4xx: [...new Set(net4xx)].slice(0, 4),
      };
      console.log(`  OK ${name}`);
    } catch (e) {
      out[name] = { error: (e.message || String(e)).slice(0, 120) };
      console.log(`  FAIL ${name} — ${out[name].error}`);
    }
    await page.close(); await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(out, null, 2));
  console.log('\n' + JSON.stringify(out, null, 2));
})();
