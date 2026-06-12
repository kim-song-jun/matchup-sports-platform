// Responsive capture matrix: every page × mobile/tablet/desktop.
// Output: docs/visual-qa/responsive-v1/{mobile,tablet,desktop}/<name>.png
// Requires the v1 stack running (web :3013 + api :8121 + seeded pg).
// Run: node scripts/capture_responsive.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/responsive-v1');

const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const ADMIN = ['dba4a3c4-f628-4d22-9084-2b11f967120b', 'admin@teameet.v1'];
const ONB = ['00000000-0000-4000-8000-000000001006', 'coverage-not-started@teameet.v1'];

const M = '00000000-0000-4000-8000-000000000202';
const TEAM = '00000000-0000-4000-8000-000000000101';
const TEAM2 = '00000000-0000-4000-8000-000000000102';
const TMATCH = '00000000-0000-4000-8000-000000001406';
const CHAT = '5c6a8892-0405-4594-98b8-92e70d49b869';

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

// Public pages (no auth)
const PUBLIC = [
  ['01-landing', '/landing'],
  ['02-login', '/login'],
  ['03-login-email', '/login/email'],
  ['04-signup', '/signup'],
];

// Consumer pages (host auth)
const CONSUMER = [
  ['09-home', '/home'],
  ['10-matches-list', '/matches'],
  ['11-match-detail', `/matches/${M}`],
  ['12-match-new-info', '/matches/new'],
  ['13-match-new-sport', '/matches/new/sport'],
  ['14-match-new-placetime', '/matches/new/place-time'],
  ['15-team-matches-list', '/team-matches'],
  ['16-team-match-detail', `/team-matches/${TMATCH}`],
  ['17-team-match-new', '/team-matches/new'],
  ['18-teams-list', '/teams'],
  ['19-team-detail', `/teams/${TEAM}`],
  ['20-team-members', `/teams/${TEAM2}/members`],
  ['21-team-new', '/teams/new'],
  ['22-teams-search', '/teams/search', '풋살'],
  ['23-chat-list', '/chat'],
  ['24-chat-room', `/chat/${CHAT}`],
  ['25-search', '/search'],
  ['26-notifications', '/notifications'],
  ['27-notices', '/notices'],
  ['28-my', '/my'],
  ['29-my-profile-edit', '/my/profile/edit'],
  ['30-my-teams', '/my/teams'],
  ['31-my-matches', '/my/matches/created'],
  ['32-my-reviews', '/my/reviews'],
  ['33-my-settings', '/my/settings'],
  ['34-my-settings-notifications', '/my/settings/notifications'],
  ['35-my-settings-sports', '/my/settings/sports'],
  ['36-team-members-private', `/teams/${TEAM}/members`],
];

// Admin list pages (admin auth)
const ADMIN_PAGES = [
  ['admin-02-overview', '/admin'],
  ['admin-03-users', '/admin/users'],
  ['admin-04-matches', '/admin/matches'],
  ['admin-05-teams', '/admin/teams'],
  ['admin-06-team-matches', '/admin/team-matches'],
  ['admin-07-audit', '/admin/audit'],
  ['admin-08-admins', '/admin/admins'],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function safeErr(e) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 90);
}

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}

async function captureSimple(ctx, dir, pages, results) {
  const page = await ctx.newPage();
  for (const [name, route, typeQuery] of pages) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      if (typeQuery) {
        const input = page.locator('input[type="search"], input[type="text"]').first();
        await input.fill(typeQuery).catch(() => {});
        await page.waitForTimeout(1000);
      }
      await shot(page, dir, name);
      results.ok.push(name);
      console.log('  OK', name);
    } catch (e) {
      results.fail.push(name);
      console.log('  FAIL', name, safeErr(e));
    }
  }
  await page.close();
}

async function captureOnboarding(ctx, dir, results) {
  const p = await ctx.newPage();
  const steps = [
    ['05-onboarding-sport', '/onboarding/sport'],
    ['06-onboarding-level', null],
    ['07-onboarding-region', null],
    ['08-onboarding-confirm', '/onboarding/confirm'],
  ];
  try {
    await p.goto(`${BASE}/onboarding/sport`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(600);
    await shot(p, dir, steps[0][0]); results.ok.push(steps[0][0]); console.log('  OK', steps[0][0]);
    // advance to level
    await p.locator('button.tm-auth-option-card', { hasText: '축구' }).first().click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('button', { hasText: '실력 입력하기' }).first().click().catch(() => {});
    await p.waitForURL('**/onboarding/level', { timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(700);
    await shot(p, dir, steps[1][0]); results.ok.push(steps[1][0]); console.log('  OK', steps[1][0]);
    // advance to region
    await p.locator('button,[role="radio"]', { hasText: '중수' }).first().click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('button.tm-btn-primary:not([disabled])').first().click().catch(() => {});
    await p.waitForTimeout(700);
    await shot(p, dir, steps[2][0]); results.ok.push(steps[2][0]); console.log('  OK', steps[2][0]);
    // confirm
    await p.goto(`${BASE}/onboarding/confirm`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(600);
    await shot(p, dir, steps[3][0]); results.ok.push(steps[3][0]); console.log('  OK', steps[3][0]);
  } catch (e) {
    console.log('  onboarding ERR', safeErr(e));
  }
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

    // public (no auth)
    const pub = await browser.newContext(vp);
    await captureSimple(pub, dir, PUBLIC, results);
    await pub.close();

    // onboarding (ONB auth)
    const onb = await browser.newContext(vp);
    await onb.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); localStorage.removeItem('teameet.v1.onboardingDraft'); }, ONB);
    await captureOnboarding(onb, dir, results);
    await onb.close();

    // consumer (host auth)
    const host = await browser.newContext(vp);
    await host.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    await captureSimple(host, dir, CONSUMER, results);
    await host.close();

    // admin (admin auth)
    const adm = await browser.newContext(vp);
    await adm.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); }, ADMIN);
    await captureSimple(adm, dir, ADMIN_PAGES, results);
    await adm.close();

    summary[bp.key] = results;
    console.log(`----- ${bp.key}: OK ${results.ok.length} / FAIL ${results.fail.length} -----`);
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== DONE ===');
  for (const k of Object.keys(summary)) {
    console.log(`${k}: ok=${summary[k].ok.length} fail=${summary[k].fail.length}${summary[k].fail.length ? ' [' + summary[k].fail.join(',') + ']' : ''}`);
  }
})();
