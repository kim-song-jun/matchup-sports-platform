/**
 * 팀 전적(공개, 비인증) 화면 3폭 갤러리 캡처 — PR #714 profileHref 실측용.
 *
 * 이벤트(득점·카드)는 접힘 토글 뒤에 있으므로, 이벤트가 있는 항목을 위에서 두 개
 * 펼친 뒤 캡처한다. 캡처만 한다 — 상태 변경 없음.
 *
 *   TEAM_ID=... OUT_DIR=... node scripts/capture-alpha-team-records.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { chromium } = require_('playwright');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const TEAM_ID = process.env.TEAM_ID;
const OUT_DIR = process.env.OUT_DIR;
for (const [k, v] of Object.entries({ TEAM_ID, OUT_DIR })) {
  if (!v) { console.error(`${k} 환경변수가 필요합니다.`); process.exit(1); }
}
mkdirSync(OUT_DIR, { recursive: true });

const WIDTHS = [
  { key: '390', width: 390, height: 900, mobile: true },
  { key: '768', width: 768, height: 1100, mobile: false },
  { key: '1440', width: 1440, height: 1100, mobile: false },
];

const browser = await chromium.launch();
try {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w.width, height: w.height },
      isMobile: w.mobile,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/teams/${TEAM_ID}/records`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // 이벤트 있는 항목의 접힘 토글을 전부 펼친 뒤, 링크가 있는 항목을 화면에 넣는다.
    for (let guard = 0; guard < 30; guard += 1) {
      const t = page.locator('[aria-expanded="false"]').first();
      if ((await t.count()) === 0) break;
      await t.click();
      await page.waitForTimeout(150);
    }
    const firstLink = page.locator('a[href^="/users/"]').first();
    if ((await firstLink.count()) > 0) {
      await firstLink.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    // 펼친 이벤트의 밑줄 링크 유무를 계산값으로 기록한다(육안 판정 금지 규칙).
    const links = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href^="/users/"]')];
      return anchors.map((a) => ({
        text: a.textContent?.trim(),
        underline: getComputedStyle(a).textDecorationLine,
      }));
    });
    console.log(`${w.key}px: /users/ 링크 ${links.length}개`, JSON.stringify(links.slice(0, 4)));
    await page.screenshot({ path: `${OUT_DIR}/team-records-${w.key}.png`, fullPage: false });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('done');
