// Comprehensive v1 consumer + admin tournament-flow capture for layout/stepper theme audit.
// Mobile 390 (unclamped inner-scroll) + Desktop 1440. deviceScaleFactor 1 (Read-tool friendly).
const { chromium } = require('@playwright/test');

const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const TID = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';
const REG = '167de01f-5e9c-49aa-a014-24fbb256b772';

const UNCLAMP =
  'html:has(.tm-app-frame),body:has(.tm-app-frame){overflow:visible !important;height:auto !important}' +
  '.tm-app-frame{height:auto !important;min-height:0 !important;overflow:visible !important}' +
  '.tm-scroll-area{overflow:visible !important;height:auto !important;max-height:none !important}';

// screen: [name, path, auth] — auth null = unauthenticated
const SCREENS = [
  ['login', '/login', null],
  ['promo', '/tournaments', OWNER],
  ['detail', `/tournaments/${TID}`, OWNER],
  ['apply', `/tournaments/${TID}/apply`, OWNER],
  ['my', `/tournaments/${TID}/my`, OWNER],
  ['roster', `/tournaments/${TID}/registrations/${REG}/roster`, OWNER],
  ['home', '/home', OWNER],
  ['admin-new', '/admin/tournaments/new', ADMIN],
  ['admin-detail', `/admin/tournaments/${TID}`, ADMIN],
];

const BPS = [['mobile', 390], ['desktop', 1440]];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const [bp, width] of BPS) {
    for (const [name, path, auth] of SCREENS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      if (auth) {
        await ctx.addInitScript(([id, e]) => {
          localStorage.setItem('teameet.v1.userId', id);
          localStorage.setItem('teameet.v1.userEmail', e);
        }, [auth.id, auth.email]);
      }
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
      try {
        await page.goto(`http://localhost:3013${path}`, { waitUntil: 'networkidle', timeout: 45000 });
        if (bp === 'mobile') await page.addStyleTag({ content: UNCLAMP });
        await page.waitForTimeout(900);
        const out = `docs/visual-qa/theme-audit/${bp}/${name}.png`;
        await page.screenshot({ path: out, fullPage: true });
        const dim = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
        results.push(`${bp}/${name} -> ${dim.w}x${dim.h}${errs.length ? ' ERR:' + errs.length : ''} [final ${page.url().replace('http://localhost:3013','')}]`);
      } catch (e) {
        results.push(`${bp}/${name} FAILED: ${String(e).slice(0, 80)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(results.join('\n'));
})();
