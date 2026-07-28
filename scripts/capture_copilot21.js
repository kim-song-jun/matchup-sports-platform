// Copilot 21차 검증 —
//  (a) 팀매치 생성 완료 화면: 하드코딩 team-match-1 링크 제거 → '목록으로'(/team-matches)
//  (b) 매치 신청자 관리: eligibility 로드 상태 라벨 정상(수동/자동), 로딩 중 중립 문구
// Output: docs/visual-qa/copilot21-verify/<name>.png   Run: node scripts/capture_copilot21.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/copilot21-verify');
const OWNER = ['39adc75a-0702-45bd-b5fd-4cf2d295f7fd', 'owner@teameet.v1'];
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const MATCH_WITH_APPLICANT = '00000000-0000-4000-8000-000000000201'; // 수동 승인 매치
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function withPage(browser, auth, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([i, e]) => {
    localStorage.setItem('teameet.v1.userId', i);
    localStorage.setItem('teameet.v1.userEmail', e);
  }, auth);
  const page = await ctx.newPage();
  const errs = [], net4xx = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() >= 400) net4xx.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const out = await fn(page);
  await page.close(); await ctx.close();
  return { ...out, consoleErrors: [...new Set(errs)], net4xx: [...new Set(net4xx)] };
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const result = {};

  // (a) complete screen — host (mock/demo flow)
  result.complete = await withPage(browser, HOST, async (page) => {
    await page.goto(`${BASE}/team-matches/new/complete`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    const a = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const listLink = links.find((l) => l.textContent.trim() === '목록으로');
      return {
        목록으로_라벨: !!listLink,
        목록으로_href: listLink ? new URL(listLink.href).pathname : null,
        구상세보기_라벨: links.some((l) => l.textContent.trim() === '상세 보기'),
        team_match_1_링크: links.some((l) => l.getAttribute('href') === '/team-matches/team-match-1'),
      };
    });
    await page.screenshot({ path: path.join(ROOT, 'complete.png'), fullPage: true, scale: 'css' });
    return { assertions: a };
  });

  // (b) applications eligibility label — HOST of match 201 (manual-approval match)
  result.applications = await withPage(browser, HOST, async (page) => {
    await page.goto(`${BASE}/matches/${MATCH_WITH_APPLICANT}/applications`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(900);
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    const a = await page.evaluate(() => {
      const txt = document.body.innerText;
      return {
        수동승인_라벨: txt.includes('수동 승인 매치'),
        중립문구_잔존: txt.includes('승인 방식 확인 중'), // 로드 완료 후엔 false 여야 정상
      };
    });
    await page.screenshot({ path: path.join(ROOT, 'applications.png'), fullPage: true, scale: 'css' });
    return { assertions: a };
  });

  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
