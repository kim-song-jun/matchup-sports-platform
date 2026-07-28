// alpha(프로덕션 모드) 어드민 목록 페이지네이션 3폭 캡처.
// 헤더 dev 인증은 프로덕션 게이트로 막혀 있어 세션 쿠키를 주입한다.
// Run: ALPHA_SESSION_TOKEN=... node scripts/capture_alpha_admin_pagination.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-admin-pagination');
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 이 필요합니다.');
  process.exit(1);
}

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
];

const PAGES = [
  ['users', '/admin/users', '회원'],
  ['teams', '/admin/teams', '팀'],
  ['audit', '/admin/audit', '감사 로그'],
  ['errors', '/admin/ops/errors', '에러 로그'],
  ['popups', '/admin/popups', '팝업'],
];

async function settle(page) {
  // alpha 는 실시간 소켓이 계속 붙어 있어 networkidle 에 도달하지 않는다.
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('tbody tr').length > 0 ||
        document.querySelectorAll('ul[role="list"] > li').length > 0 ||
        /없어요|없습니다/.test(document.querySelector('main')?.innerText ?? ''),
      { timeout: 30000 },
    )
    .catch(() => {});
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(900);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [name, width] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addCookies([
      { name: 'teameet_v1_session', value: TOKEN, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    ]);
    const page = await ctx.newPage();

    for (const [slug, route, label] of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);

      const file = `alpha-${slug}-${name}-${width}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true, scale: 'css' });

      const probe = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="목록 페이지"]');
        return {
          rows: document.querySelectorAll('tbody tr').length,
          cards: document.querySelectorAll('ul[role="list"] > li').length,
          paginationBar: !!nav,
          paginationText: nav?.querySelector('p')?.textContent?.trim() ?? null,
        };
      });

      // 페이지 2로 실제로 이동하는지 — 바가 있을 때만 확인한다.
      let page2 = null;
      if (probe.paginationBar) {
        const next = page.locator('nav[aria-label="목록 페이지"] button', { hasText: /^2$/ }).first();
        if (await next.count()) {
          await next.click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1500);
          page2 = await page.evaluate(() => {
            const nav = document.querySelector('nav[aria-label="목록 페이지"]');
            const current = nav?.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null;
            return { current, text: nav?.querySelector('p')?.textContent?.trim() ?? null };
          });
          const file2 = `alpha-${slug}-page2-${name}-${width}.png`;
          await page.screenshot({ path: path.join(OUT, file2), fullPage: true, scale: 'css' });
          page2.file = file2;
        }
      }

      results.push({ label, slug, name, width, file, ...probe, page2 });
      console.log(
        `${label} ${name}(${width}) rows=${probe.rows} cards=${probe.cards} bar=${probe.paginationBar} "${probe.paginationText ?? ''}" page2=${page2?.current ?? '-'}`,
      );
    }

    await page.close();
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}`);
})();
