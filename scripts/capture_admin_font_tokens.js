/**
 * 폰트 크기 토큰 클래스 수정 전/후 비교용 어드민 화면 캡처.
 * 로컬 v1 스택 + 헤더 dev 인증. 화면마다 토큰별 computed font-size 도 함께 찍는다.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const WEB = process.env.WEB_BASE || 'http://localhost:3013';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), '.screenshots', 'admin-font-tokens');
const [userId, userEmail] = process.argv.slice(2);
const PAGES = [['/admin/notices', 'notices'], ['/admin/audit', 'audit'], ['/admin/ops/errors', 'error-logs']];
const WIDTHS = [[390, 900], [768, 1100], [1440, 1100]];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(([id, e]) => {
    localStorage.setItem('teameet.v1.userId', id);
    localStorage.setItem('teameet.v1.userEmail', e);
  }, [userId, userEmail]);
  const page = await context.newPage();
  for (const [route, name] of PAGES) {
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(WEB + route, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForSelector('nav[aria-label="주 메뉴"], button[aria-label="메뉴 열기"]', { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: true });
    }
    const dist = await page.evaluate(() => {
      const out = {};
      for (const el of document.querySelectorAll('*')) {
        const cn = typeof el.className === 'string' ? el.className : '';
        const m = cn.match(/text-\[(?:length:)?var\((--font-size-[a-z-]+)\)\]/);
        if (!m) continue;
        const k = m[1].replace('--font-size-', '');
        const s = getComputedStyle(el).fontSize;
        out[k] ||= {};
        out[k][s] = (out[k][s] || 0) + 1;
      }
      return out;
    });
    console.log(`[${name}]`, JSON.stringify(dist));
  }
  console.log('DONE:', fs.readdirSync(OUT).sort().join(', '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
