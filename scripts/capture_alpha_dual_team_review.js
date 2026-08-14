// alpha 겸직(양 팀 소속) 후기 화면 3폭 캡처.
// 검증 포인트: 한 경기에 상대팀 대상이 두 방향으로 뜨고, 각 카드에
// "OO 대표로 작성" 라벨이 붙는가 (겸직일 때만 노출되는 라벨).
// Run: ALPHA_SESSION_TOKEN=... node scripts/capture_alpha_dual_team_review.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
// 겸직 계정(A팀·B팀 동시 소속)이 양방향 대상을 갖는 대회 경기
const FIXTURE_ID = process.env.ALPHA_FIXTURE_ID || 'e31f0b0e-7fe9-4cb4-89d1-780945f5a36d';
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-dual-team-review');
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
  ['list', '/my/reviews'],
  ['source', `/my/reviews/tournament_fixture/${FIXTURE_ID}`],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [pageName, urlPath] of PAGES) {
    for (const [widthName, width] of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addCookies([
        { name: 'teameet_v1_session', value: TOKEN, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
      ]);
      const page = await ctx.newPage();

      // alpha 는 실시간 소켓이 계속 붙어 있어 networkidle 에 도달하지 않는다.
      await page.goto(`${BASE}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      // 리뷰 대상 카드나 빈 상태 문구가 그려질 때까지 기다린다.
      await page.waitForFunction(
        () => {
          const text = document.querySelector('main')?.innerText ?? '';
          return document.querySelectorAll('.tm-review-target-card, .tm-review-list-card').length > 0
            || /없어요|없습니다|불러오지/.test(text);
        },
        { timeout: 30000 },
      ).catch(() => {});
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      await page.waitForTimeout(800);

      const file = path.join(OUT, `${pageName}-${widthName}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });

      // 겸직 라벨이 실제로 렌더됐는지 함께 기록한다 — 스크린샷만으로는
      // "라벨이 없는 것"과 "화면이 안 뜬 것"을 구분하기 어렵다.
      const probe = await page.evaluate(() => {
        const main = document.querySelector('main');
        const text = main?.innerText ?? '';
        return {
          targetCards: document.querySelectorAll('.tm-review-target-card').length,
          reviewerLabels: (text.match(/대표로 작성/g) || []).length,
          teamNames: [...new Set((text.match(/E2E 알파 [AB]팀/g) || []))],
        };
      });
      results.push({ page: pageName, width, file: path.basename(file), ...probe });
      console.log(`${pageName}/${widthName}(${width}): 대상카드=${probe.targetCards} 겸직라벨=${probe.reviewerLabels} 팀=${probe.teamNames.join(',')}`);

      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  console.log(`\n저장 위치: ${OUT}`);
})();
