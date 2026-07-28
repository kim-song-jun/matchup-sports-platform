// admin 목록 화면 캡처 — 카드 그리드 → 표 전환 검증용.
// 데스크톱은 표, 모바일은 카드 스택으로 렌더되는지 함께 확인한다.
//
// 로컬:  WEB_BASE=http://localhost:3033 node scripts/capture_admin_lists.js
// alpha: WEB_BASE=https://alpha.teameet.co.kr ALPHA_SESSION_TOKEN=... node scripts/capture_admin_lists.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.WEB_BASE || 'http://localhost:3033';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const OUT = path.resolve(__dirname, `../docs/visual-qa/${process.env.OUT_DIR || 'admin-lists'}`);
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

const PAGES = [
  ['audit', '/admin/audit'],
  ['inquiries', '/admin/inquiries'],
  ['popups', '/admin/popups'],
  ['users', '/admin/users'],
];

const VIEWPORTS = [
  ['desktop', 1440],
  ['mobile', 390],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [label, width] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    if (TOKEN) {
      // alpha 는 프로덕션 모드라 헤더 dev 인증이 막혀 있다 — 세션 쿠키를 주입한다.
      await ctx.addCookies([
        { name: 'teameet_v1_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
      ]);
    } else {
      // 로컬은 헤더 dev 인증 — admin 은 email 로 resolve 되므로 userId 는 넣지 않는다.
      await ctx.addInitScript(() => {
        window.localStorage.setItem('teameet.v1.userEmail', 'admin@teameet.v1');
        window.localStorage.removeItem('teameet.v1.userId');
        window.localStorage.setItem('teameet.v1.session', 'active');
      });
    }
    const page = await ctx.newPage();

    for (const [name, route] of PAGES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
        // 목록이 실제로 그려질 때까지 기다린다 — 사이드바 텍스트로 판정하면 로딩 중에도 참이 된다.
        await page.waitForFunction(
          () => document.querySelectorAll('tbody tr').length > 0
            || /없어요|없습니다/.test(document.querySelector('main')?.innerText ?? ''),
          { timeout: 25000 },
        ).catch(() => {});
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.waitForTimeout(500);

        const file = `${name}-${label}-${width}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true, scale: 'css' });
        const probe = await page.evaluate(() => ({
          rows: document.querySelectorAll('tbody tr').length,
          headers: Array.from(document.querySelectorAll('thead th'))
            .map((th) => th.textContent?.trim())
            .filter(Boolean),
        }));
        results.push({ name, label, width, file, ...probe });
        console.log(`${label}(${width}) ${name}: rows=${probe.rows} cols=[${probe.headers.join('|')}]`);
      } catch (err) {
        results.push({ name, label, width, error: String(err.message || err).slice(0, 90) });
        console.log(`ERR ${label} ${name} — ${String(err.message || err).slice(0, 80)}`);
      }
    }

    await page.close();
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}`);
})();
