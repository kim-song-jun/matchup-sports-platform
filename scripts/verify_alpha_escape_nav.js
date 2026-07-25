// alpha 배포본에서 탈출 내비게이션을 검증한다(비로그인으로 접근 가능한 공개 화면 한정).
// Run: node scripts/verify_alpha_escape_nav.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-verify');
const PAGES = [
  ['404-임의경로', '/this-route-does-not-exist'],
  ['404-대회', '/tournaments/00000000-0000-4000-8000-999999999999'],
  ['대회목록', '/tournaments'],
  ['랜딩', '/landing'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const results = [];

  for (const [label, route] of PAGES) {
    try {
      // alpha 는 실시간 소켓이 계속 열려 있어 networkidle 에 도달하지 않는다.
      const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const row = await page.evaluate(() => {
        const rendered = (el) => Boolean(el) && el.getClientRects().length > 0;
        const nav = document.querySelector('.tm-bottom-nav');
        const anchors = Array.from(document.querySelectorAll('a')).filter(rendered);
        return {
          navVisible: rendered(nav),
          activeTab: nav ? (Array.from(nav.querySelectorAll('.tm-bottom-tab')).find((t) => t.dataset.active === 'true')?.innerText || '').trim() : null,
          homeShortcut: rendered(document.querySelector('.tm-topbar-actions a[aria-label="홈으로"]')),
          homeWays: anchors.filter((a) => ['/home', '/'].includes(a.getAttribute('href'))).length,
          totalLinks: anchors.length,
          heading: (document.querySelector('h1, h2')?.innerText || '').trim().slice(0, 30),
        };
      });
      await page.screenshot({ path: path.join(OUT, `alpha-${label}.png`), fullPage: true, scale: 'css' });
      results.push({ label, route, http: resp?.status(), ...row });
      console.log(`ok  ${label.padEnd(12)} http=${resp?.status()} home=${row.homeWays} tab=${row.navVisible ? (row.activeTab || 'none') : '-'} btn=${row.homeShortcut ? 'Y' : 'n'} links=${row.totalLinks} "${row.heading}"`);
    } catch (e) {
      results.push({ label, route, error: String(e.message || e).slice(0, 100) });
      console.log(`ERR ${label} — ${String(e.message || e).slice(0, 80)}`);
    }
  }

  await page.close();
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'alpha-verify.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}`);
})();
