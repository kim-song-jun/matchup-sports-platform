import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const root = process.env.QA_SOURCE_ROOT ?? process.cwd();
const outputDir = process.env.QA_OUTPUT_DIR ?? path.join(root, 'output/playwright/visual-audit/task179-team-match-mobile-badges');
const phase = process.env.QA_PHASE ?? 'after';
const widths = [320, 360, 390, 430, 768, 1440];
const css = [
  'apps/v1_web/src/app/globals.css',
  'apps/v1_web/src/app/desktop/_shell.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

fs.mkdirSync(outputDir, { recursive: true });

const dot = '<svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true"><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>';
const card = ({ badges, host, title, when, cost = '45,000원' }) => `
  <a class="tm-match-row tm-card-interactive tm-pressable" href="#detail">
    <div class="tm-match-row-thumb" style="background:linear-gradient(145deg,#dbeafe,#93c5fd)"></div>
    <div class="tm-match-row-main">
      <div class="tm-text-caption tm-match-row-meta tm-team-match-row-id">
        <div class="tm-team-match-row-badges">${badges}</div>
        <span class="tm-team-match-row-host"><strong>${host}</strong> · 매너 4.9 · 승 18</span>
      </div>
      <div class="tm-match-row-headline"><div class="tm-text-body-lg tm-match-row-title">${title}</div></div>
      <div class="tm-text-caption tm-match-row-when"><strong>${when}</strong> · 서울특별시성동구성수이로긴주소축구장</div>
      <div class="tm-match-row-foot"><span class="tm-text-caption tm-team-match-row-cond"><span>풋살 · A등급 · 5:5 · 성별 무관</span></span><span class="tm-match-row-cost">${cost}</span></div>
    </div>
  </a>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>
  <main class="tm-app-frame"><div class="tm-scroll-area"><section class="tm-match-list">
    <h1 class="tm-text-heading">팀매치</h1>
    <div class="tm-match-card-stack" data-qa="team-match-cards">
      ${card({
        badges: '<span class="tm-badge tm-badge-grey">플랫폼 주관</span><span class="tm-badge tm-badge-green">' + dot + '승인 완료</span><span class="tm-badge tm-badge-grey tm-card-closed-badge">' + dot + '경기 종료</span>',
        host: '성수동우리동네오래된축구회최강연합팀 vs 용산연합회',
        title: '성수동우리동네오래된축구회최강연합팀정기토요일저녁팀매치',
        when: '2026. 10. 03. 토요일 오후 8:00',
      })}
      ${card({
        badges: '<span class="tm-badge tm-badge-blue">' + dot + '상대 모집 중</span>',
        host: '한강 로버스',
        title: '토요일 오전 친선 경기',
        when: '2026. 10. 10. 토요일 오전 10:00',
        cost: '무료초청',
      })}
    </div>
  </section></div></main></body></html>`;

const fixturePath = path.join(outputDir, 'fixture.html');
fs.writeFileSync(fixturePath, html);
if (process.env.QA_PREPARE_ONLY === '1') {
  console.log(JSON.stringify({ fixturePath }));
  process.exit(0);
}

const browser = process.env.QA_CDP_URL
  ? await chromium.connectOverCDP(process.env.QA_CDP_URL)
  : await chromium.launch({
      headless: false,
      ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : { channel: 'chrome' }),
    });
console.log(JSON.stringify({ runnerPid: process.pid, browser: process.env.QA_CDP_URL ? 'chrome-cdp' : process.env.QA_BROWSER_PATH ?? 'chrome', headed: true }));
const results = [];

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));
    await page.setContent(html, { waitUntil: 'load' });

    const metrics = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.tm-match-row')];
      const badges = [...document.querySelectorAll('.tm-team-match-row-badges > .tm-badge')];
      const geometryOverflow = [...document.querySelectorAll('.tm-match-row, .tm-match-row-main, .tm-team-match-row-badges')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -0.5 || rect.right > document.documentElement.clientWidth + 0.5;
        })
        .map((element) => ({ className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }));
      const clippedBadges = badges
        .filter((badge) => {
          const badgeRect = badge.getBoundingClientRect();
          const cardRect = badge.closest('.tm-match-row').getBoundingClientRect();
          return badgeRect.left < cardRect.left - 0.5 || badgeRect.right > cardRect.right + 0.5 || badgeRect.width === 0 || badgeRect.height === 0;
        })
        .map((badge) => badge.textContent.trim());
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        cardCount: cards.length,
        badgeTexts: badges.map((badge) => badge.textContent.trim()),
        geometryOverflow,
        clippedBadges,
      };
    });

    await page.screenshot({ path: path.join(outputDir, `${phase}-${width}.png`), fullPage: true });
    results.push({ width, consoleErrors, pageErrors, failedRequests, ...metrics });
    await page.close();
  }
} finally {
  await browser.close();
}

const reportPath = path.join(outputDir, `${phase}-report.json`);
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ reportPath, results }, null, 2));

const required = ['플랫폼 주관', '승인 완료', '경기 종료'];
const failures = results.filter((result) => (
  result.documentScrollWidth > result.documentClientWidth + 1
  || result.geometryOverflow.length > 0
  || result.clippedBadges.length > 0
  || result.consoleErrors.length > 0
  || result.pageErrors.length > 0
  || result.failedRequests.length > 0
  || required.some((label) => !result.badgeTexts.includes(label))
));
if (failures.length > 0) process.exitCode = 1;
