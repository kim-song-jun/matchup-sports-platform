// 팀 전적(공개) 화면의 승/무/패 강조 표시 검증 캡처.
// Output: docs/visual-qa/team-records-emphasis/<label>-<theme>-<w>.png
// Run: node scripts/capture_team_records_result_emphasis.js [before|after] [baseUrl]
//   WAIT_FOR_MARKER=1 이면 alpha 배포 반영(행 좌측 색 띠 마커)까지 최대 30분 폴링 후 캡처.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = process.argv[2] || 'before';
const BASE = process.argv[3] || 'https://alpha.teameet.co.kr';
// 승·무·패가 모두 섞여 있는 alpha 팀 ("1팀", 9경기 4승 3무 2패)
const TEAM_ID = process.env.TEAM_ID || '32fb8b00-a877-407c-aa9c-7b4bb95872b5';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/team-records-emphasis');
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;
const WIDTHS = [390, 768, 1440];
const URL = `${BASE}/teams/${TEAM_ID}/records`;
/**
 * 배포 반영 판정 — HTML 문자열 매칭은 쓰지 않는다. React 인라인 스타일은 CSR DOM에서
 * `border-left: 4px`(공백 포함)로 직렬화돼 무공백 마커와 어긋났고, 실제로는 반영됐는데
 * 87회 폴링이 전부 miss 나는 헛대기를 했다. 렌더 결과의 computed 값으로 판정한다.
 */
async function isReflected(page) {
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll('span')].filter((s) => ['승', '무', '패'].includes(s.textContent.trim()));
    if (!chips.length) return false;
    const drawn = chips.find((c) => c.textContent.trim() === '무');
    // 무승부 칩 텍스트가 --text-body(라이트 #4e5968)여야 대비 회귀 수정본이다.
    return Boolean(drawn) && getComputedStyle(drawn).color === 'rgb(78, 89, 104)';
  });
}

async function waitForDeploy(browser) {
  const deadlineMs = Date.now() + Number(process.env.WAIT_MINUTES ?? 30) * 60 * 1000;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    for (let attempt = 1; Date.now() < deadlineMs; attempt++) {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(5000);
      if (await isReflected(page)) {
        console.log(`  deploy reflected (attempt ${attempt})`);
        return true;
      }
      console.log(`  not yet (attempt ${attempt})`);
      await page.waitForTimeout(45000);
    }
    return false;
  } finally {
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  try {
    if (process.env.WAIT_FOR_MARKER === '1' && !(await waitForDeploy(browser))) {
      console.error('  TIMEOUT: alpha에 아직 반영되지 않음 — 캡처를 건너뜀');
      process.exitCode = 1;
      return;
    }
    for (const theme of ['light', 'dark']) {
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
        const page = await ctx.newPage();
        // 이 앱의 다크모드는 `:root.dark` 클래스 기반이라 colorScheme만으론 전환되지 않는다.
        // 실제 사용자 경로와 같은 선호도 키(`tm-theme`, lib/theme.ts)를 심어 FOUC 방지
        // 인라인 스크립트가 클래스를 붙이게 한다.
        await ctx.addInitScript((t) => {
          try { window.localStorage.setItem('tm-theme', t); } catch { /* 스토리지 차단 환경 */ }
        }, theme);
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3500);
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await page.waitForTimeout(400);
        const name = `${LABEL}-${theme}-${width}.png`;
        await page.screenshot({ path: path.join(ROOT, name), fullPage: true, scale: 'css' });
        console.log('  OK', name);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
})();
