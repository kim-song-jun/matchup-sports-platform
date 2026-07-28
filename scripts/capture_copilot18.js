// Copilot 18차 검증 — 매치 신청자 관리 페이지가 useInfiniteQuery 전환 후에도
// 정상 렌더되는지(no-regression) + 페이지네이션 DOM 상태 확인.
// 호스트 소유 매치 ...000201 (requested 신청자 1명) 기준.
// Output: docs/visual-qa/copilot18-verify/<name>.png  (mobile 390)  Run: node scripts/capture_copilot18.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/copilot18-verify');
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const MATCH_WITH_APPLICANT = '00000000-0000-4000-8000-000000000201';
const VIEWPORT = { width: 390, height: 844 };
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await ctx.addInitScript(([i, e]) => {
    localStorage.setItem('teameet.v1.userId', i);
    localStorage.setItem('teameet.v1.userEmail', e);
  }, HOST);
  const page = await ctx.newPage();
  const errs = [];
  const net4xx = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() >= 400) net4xx.push(`${r.status()} ${new URL(r.url()).pathname}`); });

  await page.goto(`${BASE}/matches/${MATCH_WITH_APPLICANT}/applications`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});

  const assertions = await page.evaluate(() => {
    const txt = document.body.innerText;
    const manageBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === '관리').length;
    const hasLoadMore = Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === '더 보기');
    return {
      신청자관리헤더: txt.includes('신청자 관리'),
      관리버튼수: manageBtns,            // requested 신청자 행마다 1개
      더보기노출: hasLoadMore,           // 신청자 <=50 이면 false 여야 정상
      빈상태: txt.includes('신청자가 없어요'),
    };
  });

  await page.screenshot({ path: path.join(ROOT, 'applications-infinite.png'), fullPage: true, scale: 'css' });
  await page.close();
  await ctx.close();
  await browser.close();

  const result = { assertions, consoleErrors: [...new Set(errs)], net4xx: [...new Set(net4xx)] };
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
