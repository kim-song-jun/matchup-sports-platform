// 1차 순회에서 남은 공백 재측정: 유효 ID 상세 화면, 404/오류 화면, 신청 없는 사용자의
// 참가신청 위저드. 측정 항목은 audit_v1_escape_nav.js 와 동일.
// Run: node scripts/audit_v1_escape_nav_gaps.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const OUT = path.resolve(__dirname, '../docs/visual-qa/escape-nav-audit');
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;
const MATCH = process.env.MATCH_ID || '00000000-0000-4000-8000-000000000201';
const TEAM_MATCH = process.env.TEAM_MATCH_ID || '00000000-0000-4000-8000-000000000301';
const USER = process.env.USER_ID || '5115c3d1-6373-44d7-a20a-c0552fb43078';
const TID = process.env.TID || 'aa000000-0000-4000-8000-000000000001';

// [라벨, 경로, 로그인 이메일(null 이면 비로그인), 스크린샷 저장 여부]
const CASES = [
  ['매치 상세', `/matches/${MATCH}`, 'host@teameet.v1', true],
  ['매치 신청자관리', `/matches/${MATCH}/applications`, 'host@teameet.v1', false],
  ['팀매칭 상세', `/team-matches/${TEAM_MATCH}`, 'host@teameet.v1', true],
  ['공개 프로필', `/users/${USER}`, 'host@teameet.v1', false],
  ['404 매치', '/matches/00000000-0000-4000-8000-999999999999', 'host@teameet.v1', true],
  ['404 대회', '/tournaments/00000000-0000-4000-8000-999999999999', 'host@teameet.v1', true],
  ['404 임의경로', '/this-route-does-not-exist', 'host@teameet.v1', true],
  // 신청 이력이 없는 사용자로 위저드 진입(호스트는 confirmed 라 /my 로 리다이렉트된다)
  ['참가신청 위저드', `/tournaments/${TID}/apply`, 'applicant@teameet.v1', true],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [label, route, email, shot] of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    if (email) await ctx.addInitScript((e) => localStorage.setItem('teameet.v1.userEmail', e), email);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });

    try {
      // 재동의 게이트는 계정별로 뜨고 동의는 서버에 저장된다. 카드가 그려지기 전에
      // 클릭하면 조용히 실패하므로 networkidle 까지 기다리고, 통과를 확인한 뒤 진행한다.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.goto(BASE + '/home', { waitUntil: 'networkidle', timeout: 40000 });
        await page.waitForTimeout(900);
        if (!(await page.getByText('새 필수 약관을 확인해 주세요').count())) break;
        await page.getByText('필수 약관 전체 동의').first().click();
        await page.waitForTimeout(500);
        const submit = page.getByRole('button', { name: /동의/ }).last();
        if (await submit.isEnabled().catch(() => false)) await submit.click();
        await page.waitForTimeout(1800);
      }
      if (await page.getByText('새 필수 약관을 확인해 주세요').count()) {
        throw new Error('consent gate not passed');
      }
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForTimeout(900);
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      const row = await page.evaluate(() => {
        const rendered = (el) => Boolean(el) && el.getClientRects().length > 0;
        const nav = document.querySelector('.tm-bottom-nav');
        const anchors = Array.from(document.querySelectorAll('a')).filter(rendered);
        return {
          navVisible: rendered(nav),
          activeTab: nav ? (Array.from(nav.querySelectorAll('.tm-bottom-tab')).find((t) => t.dataset.active === 'true')?.innerText || '').trim() : null,
          homeShortcut: rendered(document.querySelector('.tm-topbar-actions a[aria-label="홈으로"]')),
          homeWays: anchors.filter((a) => ['/home', '/'].includes(a.getAttribute('href'))).length,
          back: rendered(document.querySelector('a[aria-label="뒤로가기"]')),
          totalLinks: anchors.length,
          heading: (document.querySelector('h1, h2')?.innerText || document.body.innerText.slice(0, 40)).trim().slice(0, 30),
        };
      });
      row.url = page.url().replace(BASE, '');
      if (shot) await page.screenshot({ path: path.join(OUT, `gap-${label.replace(/[ /]/g, '_')}.png`), fullPage: true, scale: 'css' });
      results.push({ label, route, ...row, consoleErrors: [...new Set(errs)].slice(0, 2) });
      const mark = row.homeWays > 0 || row.navVisible ? 'ok ' : '!! ';
      console.log(`${mark} ${label.padEnd(14)} home=${row.homeWays} tab=${row.navVisible ? (row.activeTab || 'none') : '-'} btn=${row.homeShortcut ? 'Y' : 'n'} back=${row.back ? 'Y' : 'n'} links=${row.totalLinks} "${row.heading}"`);
    } catch (e) {
      results.push({ label, route, error: String(e.message || e).slice(0, 120) });
      console.log(`ERR ${label} — ${String(e.message || e).slice(0, 80)}`);
    }
    await page.close();
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'audit-gaps.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}/audit-gaps.json`);
})();
