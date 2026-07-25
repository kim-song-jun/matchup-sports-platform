// 대회 하위 화면 탈출 내비게이션 시각 검증 — 하단 탭바 복원 + 상단 홈 버튼.
// web 3013(→8121) 전제. Output: docs/visual-qa/tournament-bottom-nav/<phase>/<name>-<bp>.png
// Run: PHASE=after node scripts/capture_tournament_bottom_nav.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const PHASE = process.env.PHASE || 'after';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/tournament-bottom-nav', PHASE);
const HOST = ['1b6166db-cf64-4a0e-a236-42520ac73a68', 'host@teameet.v1'];
const TID = process.env.TID || 'aa000000-0000-4000-8000-000000000001';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;
const BREAKPOINTS = [
  { key: 'mobile', w: 390, h: 844 },
  { key: 'tablet', w: 768, h: 1024 },
  { key: 'desktop', w: 1440, h: 900 },
];
const RID = process.env.RID || 'aa100000-0000-4000-8000-000000000001';
const PAGES = [
  ['my-registration', `/tournaments/${TID}/my`],
  ['tournament-detail', `/tournaments/${TID}`],
  ['notices', '/notices'],
  // 선수 명단은 스크롤 영역 내부에 sticky 저장 CTA가 있어 탭바와의 공존 확인이 필요하다.
  ['roster', `/tournaments/${TID}/registrations/${RID}/roster`],
];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const out = {};
  for (const bp of BREAKPOINTS) {
    const ctx = await browser.newContext({ viewport: { width: bp.w, height: bp.h }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([i, e]) => {
      localStorage.setItem('teameet.v1.userId', i);
      localStorage.setItem('teameet.v1.userEmail', e);
    }, HOST);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    // 재동의 게이트(새 필수 약관)는 대회 화면보다 먼저 뜨므로 캡처 전에 통과시킨다.
    await page.goto(BASE + '/home', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(800);
    if (await page.getByText('새 필수 약관을 확인해 주세요').count()) {
      await page.getByText('필수 약관 전체 동의').first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /동의/ }).last().click();
      await page.waitForTimeout(1500);
      console.log(`  consent gate passed (${bp.key})`);
    }
    for (const [name, route] of PAGES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1200);
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await page.screenshot({ path: path.join(ROOT, `${name}-${bp.key}.png`), fullPage: true, scale: 'css' });
        // 탈출 경로 실측: 하단 탭바 렌더 여부 + 상단 홈 단축키 존재 + 홈 링크 총계.
        const probe = await page.evaluate(() => {
          // 가시성은 레이아웃 박스 유무로 판정한다. getComputedStyle(el).display 는
          // 조상이 display:none 이어도 자기 값을 그대로 돌려주므로(데스크톱에서
          // .tm-topbar 가 숨겨져도 자식 버튼이 'inline-flex' 로 보임) 오측정된다.
          const isRendered = (el) => Boolean(el) && el.getClientRects().length > 0;
          const nav = document.querySelector('.tm-bottom-nav');
          const homeShortcut = document.querySelector('.tm-topbar-actions a[aria-label="홈으로"]');
          const homeLinks = Array.from(document.querySelectorAll('a[href="/home"]')).filter(isRendered);
          return {
            navInDom: Boolean(nav),
            navVisible: isRendered(nav),
            homeShortcutInDom: Boolean(homeShortcut),
            homeShortcutVisible: isRendered(homeShortcut),
            visibleHomeLinks: homeLinks.length,
          };
        });
        out[`${name}-${bp.key}`] = probe;
        console.log(`  OK ${name}-${bp.key} ${JSON.stringify(probe)}`);
      } catch (e) {
        console.log(`  FAIL ${name}-${bp.key} — ${(e.message || e).slice(0, 120)}`);
        out[`${name}-${bp.key}`] = { error: String(e.message || e).slice(0, 120) };
      }
    }
    out[`_console_${bp.key}`] = [...new Set(errs)].slice(0, 6);
    await page.close();
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'probe.json'), JSON.stringify(out, null, 2));
  console.log(`\n[${PHASE}] saved → ${ROOT}`);
})();
