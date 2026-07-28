// Copilot 20차 검증 — 팀매치 상세(호스트 팀 뷰)의 신청팀 상태 라벨이
// 'requested' 원문이 아니라 '승인 대기'로 매핑되는지 확인.
// 호스트 페르소나가 host_team인 팀매치 ...000301 (requested 신청팀 1) 기준.
// Output: docs/visual-qa/copilot20-verify/team-match-status-label.png  Run: node scripts/capture_copilot20.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/copilot20-verify');
// host_team applications 조회는 manager+ 권한 필요 → 팀 000101 owner 페르소나 사용.
const HOST = ['39adc75a-0702-45bd-b5fd-4cf2d295f7fd', 'owner@teameet.v1'];
const TMATCH = '00000000-0000-4000-8000-000000000301';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([i, e]) => {
    localStorage.setItem('teameet.v1.userId', i);
    localStorage.setItem('teameet.v1.userEmail', e);
  }, HOST);
  const page = await ctx.newPage();
  const errs = [];
  const net4xx = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() >= 400) net4xx.push(`${r.status()} ${new URL(r.url()).pathname}`); });

  await page.goto(`${BASE}/team-matches/${TMATCH}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});

  const assertions = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      승인대기_라벨: txt.includes('승인 대기'),
      원문requested_노출: /\brequested\b/.test(txt),  // false 여야 정상
    };
  });

  await page.screenshot({ path: path.join(ROOT, 'team-match-status-label.png'), fullPage: true, scale: 'css' });
  await page.close(); await ctx.close(); await browser.close();

  const result = { assertions, consoleErrors: [...new Set(errs)], net4xx: [...new Set(net4xx)] };
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
