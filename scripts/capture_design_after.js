// 디자인 폴리시(W1~W4) 적용 후 핵심 변경 화면 캡처 (before/after 갤러리용).
// before = 기존 81ad72b3 responsive 갤러리, after = 이 스크립트 출력.
// 출력: docs/visual-qa/design-after/{mobile,desktop}/<name>.png
// 페이지명은 기존 responsive-v1 갤러리와 일치시켜 before/after 매핑.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/design-after');
const HOST = 'host@teameet.v1';
const ADMIN = 'admin@teameet.v1';
const ONB = 'coverage-not-started@teameet.v1';
const TOURN = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 1440, height: 900 },
];

// 디자인 웨이브가 가시적으로 바꾼 핵심 화면(기존 갤러리 페이지명과 일치)
const CONSUMER = [
  ['09-home', '/home'],
  ['10-matches-list', '/matches'],
  ['15-team-matches-list', '/team-matches'],
  ['18-teams-list', '/teams'],
  ['21-team-new', '/teams/new'],
  ['22-tournaments-list', '/tournaments'],
  ['28-my', '/my'],
  ['33-my-settings', '/my/settings'],
];
const ADMIN_PAGES = [
  ['admin-02-overview', '/admin'],
  ['admin-03-users', '/admin/users'],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}

async function run(ctx, dir, pages, results) {
  const page = await ctx.newPage();
  for (const [name, route] of pages) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await shot(page, dir, name);
      results.ok.push(name);
      console.log('  OK', name);
    } catch (e) {
      results.fail.push(name);
      console.log('  FAIL', name, (e.message || String(e)).slice(0, 70));
    }
  }
  await page.close();
}

async function runOnboarding(ctx, dir, results) {
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}/onboarding/sport`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(500);
    await shot(p, dir, '05-onboarding-sport');
    results.ok.push('05-onboarding-sport'); console.log('  OK 05-onboarding-sport');
  } catch (e) { console.log('  onboarding ERR', (e.message || String(e)).slice(0, 70)); }
  await p.close();
}

(async () => {
  const browser = await chromium.launch();
  const summary = {};
  for (const bp of BREAKPOINTS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    const results = { ok: [], fail: [] };
    console.log(`\n===== ${bp.key} (${bp.width}x${bp.height}) =====`);
    const vp = { viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 };

    const onb = await browser.newContext(vp);
    await onb.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); localStorage.removeItem('teameet.v1.onboardingDraft'); }, ONB);
    await runOnboarding(onb, dir, results);
    await onb.close();

    const host = await browser.newContext(vp);
    await host.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    await run(host, dir, CONSUMER, results);
    await host.close();

    const adm = await browser.newContext(vp);
    await adm.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, ADMIN);
    await run(adm, dir, ADMIN_PAGES, results);
    await adm.close();

    summary[bp.key] = results;
    console.log(`----- ${bp.key}: OK ${results.ok.length} / FAIL ${results.fail.length} -----`);
  }
  await browser.close();
  console.log('\n=== DONE ===');
  for (const k of Object.keys(summary)) console.log(`${k}: ok=${summary[k].ok.length} fail=${summary[k].fail.length}${summary[k].fail.length ? ' [' + summary[k].fail.join(',') + ']' : ''}`);
})();
