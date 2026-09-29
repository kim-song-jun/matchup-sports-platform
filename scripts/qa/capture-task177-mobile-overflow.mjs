import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;

const root = process.cwd();
const css = [
  'apps/v1_web/src/app/globals.css',
  'apps/v1_web/src/app/desktop/_shell.css',
  'apps/v1_web/src/app/desktop/my.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const outputDir = path.join(root, 'output/playwright/visual-audit/task177-mobile-overflow');
fs.mkdirSync(outputDir, { recursive: true });

const longTeam = '성수동우리동네오래된축구회최강연합팀';
const longTitle = '성수동우리동네오래된축구회최강연합팀정기토요일저녁팀매치';
const longMeta = '2026. 10. 03. 토요일 오후 8:00 · 서울특별시성동구성수이로긴주소축구장';

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>
  <main class="tm-app-frame"><div class="tm-scroll-area"><div class="tm-my-shell tm-my-matches-desktop tm-content-enter">
    <div class="tm-segment-row"><a class="tm-chip tm-chip-active">신청·참여 매치</a><a class="tm-chip">생성한 매치</a></div>
    <div class="tm-team-form-chip-row" style="margin-top:12px"><a class="tm-chip tm-chip-active">전체</a><a class="tm-chip">개인 매치</a><a class="tm-chip">팀 매치</a></div>
    <div class="tm-my-list-stack"><div class="tm-card" style="padding:16px">
      <div class="tm-my-card-context"><span class="tm-badge tm-badge-grey">팀 매치</span><span class="tm-text-caption tm-my-card-context-label">${longTeam}</span></div>
      <div class="tm-my-card-head"><div class="tm-my-card-copy"><div class="tm-text-body-lg tm-my-card-title">${longTitle}</div><div class="tm-text-caption tm-my-card-meta">${longMeta}</div></div><span class="tm-badge tm-my-card-status tm-badge-blue">상대팀 확정</span></div>
      <p class="tm-text-caption tm-my-card-note">완료된 팀 경기예요. 공식 출전 여부는 제출된 라인업과 경기 기록을 기준으로 해요.</p>
      <div class="tm-my-card-actions"><a class="tm-btn tm-btn-sm tm-btn-neutral">상세</a><button class="tm-btn tm-btn-sm tm-btn-neutral">리뷰 대기</button></div>
    </div></div>
  </div></div></main></body></html>`;

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
console.log(JSON.stringify({ runnerPid: process.pid, browser: 'chrome', headed: true }));
const results = [];
try {
  for (const width of [320, 360, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.setContent(html, { waitUntil: 'load' });
    const metrics = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const overflowing = [...document.querySelectorAll('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > viewportWidth + 0.5 || rect.left < -0.5 || element.scrollWidth > element.clientWidth + 0.5;
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          right: Math.round(element.getBoundingClientRect().right * 10) / 10,
        }));
      return {
        viewportWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowing,
      };
    });
    await page.screenshot({ path: path.join(outputDir, `${process.env.QA_PHASE ?? 'capture'}-${width}.png`), fullPage: true });
    results.push({ width, consoleErrors, ...metrics });
    await page.close();
  }
} finally {
  await browser.close();
}

const reportPath = path.join(outputDir, `${process.env.QA_PHASE ?? 'capture'}-report.json`);
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ reportPath, results }, null, 2));

if ((process.env.QA_PHASE ?? 'capture') !== 'before') {
  const failures = results.filter((result) => result.overflowing.length > 0 || result.consoleErrors.length > 0);
  if (failures.length > 0) process.exitCode = 1;
}
