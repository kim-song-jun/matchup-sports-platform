// 대회 소비자 화면 시각 검증 — 목록 + 상세. web 3013(→8121) 전제.
// Output: docs/visual-qa/tournament-consumer/<name>-<bp>.png  Run: node scripts/capture_tournament_consumer.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/tournament-consumer');
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const TID = process.env.TID || 'ebe29be8-dba6-41c8-8ccf-b1747410b4e7';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;
const BREAKPOINTS = [{ key: 'mobile', w: 390, h: 844 }, { key: 'desktop', w: 1440, h: 900 }];
const PAGES = [['list', '/tournaments'], ['detail', `/tournaments/${TID}`]];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const out = {};
  for (const bp of BREAKPOINTS) {
    const ctx = await browser.newContext({ viewport: { width: bp.w, height: bp.h }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    const page = await ctx.newPage();
    const errs = [], net4xx = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    page.on('response', (r) => { if (r.status() >= 400) { try { net4xx.push(`${r.status()} ${new URL(r.url()).pathname}`); } catch { /* */ } } });
    for (const [name, route] of PAGES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
        await page.waitForTimeout(1200);
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await page.screenshot({ path: path.join(ROOT, `${name}-${bp.key}.png`), fullPage: true, scale: 'css' });
        if (bp.key === 'mobile') {
          const txt = await page.evaluate(() => document.body.innerText);
          out[name] = {
            챔피언십: txt.includes('2026 여름 풋살 챔피언십'),
            조별순위: txt.includes('순위') || txt.includes('승점'),
            공지: txt.includes('대진표가 발표'),
            잠실: txt.includes('잠실'),
          };
        }
        console.log(`  OK ${name}-${bp.key}`);
      } catch (e) {
        console.log(`  FAIL ${name}-${bp.key} — ${(e.message || e).slice(0, 120)}`);
      }
    }
    out[`_console_${bp.key}`] = [...new Set(errs)].slice(0, 6);
    out[`_net4xx_${bp.key}`] = [...new Set(net4xx)].slice(0, 6);
    await page.close(); await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(out, null, 2));
  console.log('\n' + JSON.stringify(out, null, 2));
})();
