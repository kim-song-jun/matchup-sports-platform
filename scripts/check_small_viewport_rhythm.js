// ≤360px 소형 뷰포트 좌우 리듬 스팟 체크 — --v1-shell-page-x(16px)와 셸 하드코딩 패딩(20px)의 단차를 잰다.
// Run: node scripts/check_small_viewport_rhythm.js [width]
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3013';
const WIDTH = Number(process.argv[2] || 360);
const TARGETS = ['tm-list-search-form', 'tm-match-type-segment', 'tm-sport-chip-row', 'tm-match-summary-row', 'tm-match-card-stack'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', 'host@teameet.v1');
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/matches`, { waitUntil: 'networkidle', timeout: 40000 });
  const gate = page.locator('text=전체 동의').first();
  if (await gate.count().catch(() => 0)) {
    await gate.click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('button.tm-btn-primary:not([disabled])').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/matches`, { waitUntil: 'networkidle', timeout: 40000 });
  }
  await page.waitForTimeout(3000);
  const out = await page.evaluate((targets) => {
    const vw = document.documentElement.clientWidth;
    const pageX = getComputedStyle(document.documentElement).getPropertyValue('--v1-shell-page-x').trim();
    return {
      vw,
      pageX,
      rows: targets.map((cls) => {
        const el = document.querySelector('.' + cls);
        if (!el) return { cls, missing: true };
        const r = el.getBoundingClientRect();
        return { cls, left: Math.round(r.left), right: Math.round(vw - r.right) };
      }),
    };
  }, TARGETS);
  console.log(`vw=${out.vw}  --v1-shell-page-x=${out.pageX}`);
  out.rows.forEach((r) => console.log(r.missing ? `  ${r.cls}: (없음)` : `  ${r.cls.padEnd(24)} L=${r.left} R=${r.right}`));
  await browser.close();
})();
