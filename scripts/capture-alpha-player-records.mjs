/**
 * STATS-1 대회 개인 랭킹 3폭 캡처 — 일정 화면 + 공개 수상 페이지 (공개, 비인증).
 * 캡처만 한다. 랭킹 섹션의 링크는 computed 값으로 검증한다.
 *   TOURNAMENT_ID=... OUT_DIR=... node scripts/capture-alpha-player-records.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { chromium } = require_('playwright');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const T = process.env.TOURNAMENT_ID;
const OUT = process.env.OUT_DIR;
if (!T || !OUT) { console.error('TOURNAMENT_ID/OUT_DIR 필요'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { key: '390', width: 390, height: 900, mobile: true },
  { key: '768', width: 768, height: 1100, mobile: false },
  { key: '1440', width: 1440, height: 1100, mobile: false },
];
const PAGES = [
  { key: 'schedule', path: `/tournaments/${T}/schedule` },
  { key: 'awards', path: `/tournaments/${T}/awards` },
];

const browser = await chromium.launch();
try {
  for (const pg of PAGES) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, isMobile: w.mobile, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      // 라이브 폴링 화면 — networkidle 금지(저장소 관례)
      await page.goto(`${ORIGIN}${pg.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const heading = page.getByRole('heading', { name: '득점 순위' });
      if ((await heading.count()) > 0) {
        await heading.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      const links = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find((el) => el.textContent === '득점 순위');
        const sec = h?.closest('section');
        return [...(sec?.querySelectorAll('a[href^="/users/"]') ?? [])].map((a) => ({
          text: a.textContent?.trim(),
          underline: getComputedStyle(a).textDecorationLine,
          label: a.getAttribute('aria-label'),
        }));
      });
      console.log(`${pg.key}/${w.key}: 득점순위 링크 ${links.length}개`, JSON.stringify(links));
      await page.screenshot({ path: `${OUT}/${pg.key}-${w.key}.png`, fullPage: false });
      await ctx.close();
    }
    await new Promise((r) => setTimeout(r, 1500)); // 캡처 과속 403 방지
  }
} finally {
  await browser.close();
}
console.log('done');
