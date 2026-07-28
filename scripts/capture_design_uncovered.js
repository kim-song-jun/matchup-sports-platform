// 미커버 surface 캡처 — 인증/온보딩 스텝/생성 위저드/설정 하위/관리자 등 W5·W6서 빠진 화면.
// 출력: docs/visual-qa/design-uncovered/{mobile,desktop}/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/design-uncovered');
const HOST = 'host@teameet.v1';
const ADMIN = 'admin@teameet.v1';
const ONB = 'coverage-not-started@teameet.v1';

const BP = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 1440, height: 900 },
];
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

// 공개 화면(인증)
const PUBLIC = [
  ['u01-landing', '/landing'],
  ['u02-login', '/login'],
  ['u03-login-email', '/login/email'],
  ['u04-signup', '/signup'],
];
// host 인증 화면(생성 위저드·설정·마이·공지)
const HOST_PAGES = [
  ['u05-match-new-info', '/matches/new'],
  ['u06-team-new', '/teams/new'],
  ['u07-settings', '/my/settings'],
  ['u08-settings-noti', '/my/settings/notifications'],
  ['u09-settings-sports', '/my/settings/sports'],
  ['u10-my-teams', '/my/teams'],
  ['u11-my-matches-created', '/my/matches/created'],
  ['u12-notices', '/notices'],
];
// 관리자 화면
const ADMIN_PAGES = [
  ['u13-admin-matches', '/admin/matches'],
  ['u14-admin-teams', '/admin/teams'],
  ['u15-admin-team-matches', '/admin/team-matches'],
  ['u16-admin-audit', '/admin/audit'],
];

async function shot(p, dir, name) {
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  await p.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await p.evaluate(() => document.fonts.ready).catch(() => {});
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}
async function run(ctx, dir, pages) {
  const p = await ctx.newPage();
  for (const [name, route] of pages) {
    try { await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }); await shot(p, dir, name); console.log('  OK', name); }
    catch (e) { console.log('  FAIL', name, (e.message || String(e)).slice(0, 60)); }
  }
  await p.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of BP) {
    const dir = path.join(ROOT, bp.key); fs.mkdirSync(dir, { recursive: true });
    console.log(`\n===== ${bp.key} =====`);
    const vp = { viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 };
    const pub = await browser.newContext(vp); await run(pub, dir, PUBLIC); await pub.close();
    const onb = await browser.newContext(vp);
    await onb.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); localStorage.removeItem('teameet.v1.onboardingDraft'); }, ONB);
    const op = await onb.newPage();
    try { await op.goto(`${BASE}/onboarding/sport`, { waitUntil: 'networkidle', timeout: 30000 });
      await op.locator('button.tm-auth-option-card', { hasText: '축구' }).first().click().catch(() => {});
      await op.waitForTimeout(300);
      await op.locator('button', { hasText: '실력 입력하기' }).first().click().catch(() => {});
      await op.waitForURL('**/onboarding/level', { timeout: 4000 }).catch(() => {});
      await op.waitForTimeout(500); await shot(op, dir, 'u17-onboarding-level'); console.log('  OK u17-onboarding-level');
      await op.goto(`${BASE}/onboarding/confirm`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await op.waitForTimeout(500); await shot(op, dir, 'u18-onboarding-confirm'); console.log('  OK u18-onboarding-confirm');
    } catch (e) { console.log('  onb ERR', (e.message || String(e)).slice(0, 50)); }
    await op.close(); await onb.close();
    const host = await browser.newContext(vp);
    await host.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    await run(host, dir, HOST_PAGES); await host.close();
    const adm = await browser.newContext(vp);
    await adm.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, ADMIN);
    await run(adm, dir, ADMIN_PAGES); await adm.close();
  }
  await browser.close();
  console.log('\n=== DONE ===');
})();
