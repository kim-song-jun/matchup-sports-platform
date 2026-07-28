// alpha(프로덕션 모드) 로그인 상태에서 탈출 내비게이션을 검증한다.
// 헤더 dev 인증은 프로덕션 게이트로 막혀 있어 세션 쿠키를 주입한다.
// Run: ALPHA_SESSION_TOKEN=... node scripts/verify_alpha_logged_in_nav.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-verify');
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 이 필요합니다.');
  process.exit(1);
}

const TID = process.env.ALPHA_TOURNAMENT_ID || '';
const PAGES = [
  ['마이', '/my'],
  ['매치목록', '/matches'],
  ['대회목록', '/tournaments'],
  ['공지사항', '/notices'],
  ['설정', '/my/settings'],
  // 탈출구가 없던 하위 화면들 — 이번 변경의 핵심 대상
  ...(TID
    ? [
        ['대회상세', `/tournaments/${TID}`],
        ['내신청', `/tournaments/${TID}/my`],
        ['순위브래킷', `/tournaments/${TID}/bracket`],
      ]
    : []),
  ['404', '/this-route-does-not-exist'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addCookies([
    { name: 'teameet_v1_session', value: TOKEN, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
  ]);
  const page = await ctx.newPage();
  const results = [];

  for (const [label, route] of PAGES) {
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      const row = await page.evaluate(() => {
        const rendered = (el) => Boolean(el) && el.getClientRects().length > 0;
        const nav = document.querySelector('.tm-bottom-nav');
        const anchors = Array.from(document.querySelectorAll('a')).filter(rendered);
        return {
          navVisible: rendered(nav),
          activeTab: nav ? (Array.from(nav.querySelectorAll('.tm-bottom-tab')).find((t) => t.dataset.active === 'true')?.innerText || '').trim() : null,
          homeShortcut: rendered(document.querySelector('.tm-topbar-actions a[aria-label="홈으로"]')),
          homeWays: anchors.filter((a) => ['/home', '/'].includes(a.getAttribute('href'))).length,
          // 로그인 화면으로 튕겼는지 판별 — 인증이 안 먹으면 /login 으로 리다이렉트된다.
          loggedOut: location.pathname.startsWith('/login') || location.pathname === '/landing',
          heading: (document.querySelector('h1, h2')?.innerText || '').trim().slice(0, 24),
        };
      });
      row.url = page.url().replace(BASE, '');
      await page.screenshot({ path: path.join(OUT, `alpha-in-${label}.png`), fullPage: true, scale: 'css' });
      results.push({ label, route, http: resp?.status(), ...row });
      console.log(`${row.loggedOut ? '!! ' : 'ok '} ${label.padEnd(8)} http=${resp?.status()} home=${row.homeWays} tab=${row.navVisible ? (row.activeTab || 'none') : '-'} btn=${row.homeShortcut ? 'Y' : 'n'} url=${row.url} "${row.heading}"`);
    } catch (e) {
      results.push({ label, route, error: String(e.message || e).slice(0, 100) });
      console.log(`ERR ${label} — ${String(e.message || e).slice(0, 80)}`);
    }
  }

  await page.close();
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'alpha-logged-in.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}/alpha-logged-in.json`);
})();
