// Wave1 변경 surface 집중 캡처 — 매치 상세/생성, 신청자 관리(신규), 팀매치 상세/생성.
// Output: docs/visual-qa/wave1-verify/{mobile,tablet,desktop}/<name>.png
// Requires v1 stack: web :3013 + api :8121 + seeded pg.
// Run: node scripts/capture_wave1.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/wave1-verify');

const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const M = '00000000-0000-4000-8000-000000000202';
const TMATCH = '00000000-0000-4000-8000-000000001406';

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

// Host-authed consumer pages we changed this wave
const PAGES = [
  ['01-match-detail', `/matches/${M}`],
  ['02-match-applications', `/matches/${M}/applications`],
  ['03-matches-list', '/matches'],
  ['04-match-new', '/matches/new'],
  ['05-team-match-detail', `/team-matches/${TMATCH}`],
  ['06-team-match-new', '/team-matches/new'],
  ['07-team-match-new-team', '/team-matches/new/team'],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function safeErr(e) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 120);
}

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}

(async () => {
  const browser = await chromium.launch();
  const summary = {};
  for (const bp of BREAKPOINTS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    const results = { ok: [], fail: [] };
    console.log(`\n===== ${bp.key} (${bp.width}x${bp.height}) =====`);
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([i, e]) => {
      localStorage.setItem('teameet.v1.userId', i);
      localStorage.setItem('teameet.v1.userEmail', e);
    }, HOST);
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const loc = msg.location();
      const where = loc && loc.url ? ` @ ${loc.url.split('/').pop()}:${loc.lineNumber ?? '?'}` : '';
      consoleErrors.push((msg.text().slice(0, 140) + where).slice(0, 200));
    });
    for (const [name, route] of PAGES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
        await shot(page, dir, name);
        results.ok.push(name);
        const finalUrl = page.url().replace(BASE, '');
        console.log('  OK', name, finalUrl !== route ? `(→ ${finalUrl})` : '');
      } catch (e) {
        // fallback: domcontentloaded if networkidle timed out
        try {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await shot(page, dir, name);
          results.ok.push(name + '*');
          console.log('  OK*', name, '(domcontentloaded)');
        } catch (e2) {
          results.fail.push(name);
          console.log('  FAIL', name, safeErr(e2));
        }
      }
    }
    await page.close();
    await ctx.close();
    summary[bp.key] = { ...results, consoleErrors: [...new Set(consoleErrors)].slice(0, 12) };
    console.log(`----- ${bp.key}: OK ${results.ok.length} / FAIL ${results.fail.length} -----`);
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== DONE ===');
  for (const k of Object.keys(summary)) {
    const s = summary[k];
    console.log(`${k}: ok=${s.ok.length} fail=${s.fail.length}${s.fail.length ? ' [' + s.fail.join(',') + ']' : ''} consoleErrs=${s.consoleErrors.length}`);
  }
})();
