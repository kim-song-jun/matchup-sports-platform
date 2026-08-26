// alpha 리그전 3폭 캡처 — 공개 통합 순위표 · 대회 생성 폼(최소 경기 수) · 대진 관리(회전 수 모달).
// 조건부 UI(league 선택 시 / 모달 안)는 실제로 열어서 찍는다 — 기본 화면만 찍으면 검증이 안 된다.
// 헤더 dev 인증은 프로덕션 게이트로 막혀 있어 세션 쿠키를 주입한다.
// Run: ALPHA_SESSION_TOKEN=... LEAGUE_TOURNAMENT_ID=... node scripts/capture_alpha_league_format.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const TID = (process.env.LEAGUE_TOURNAMENT_ID || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-league-format');
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!TOKEN || !TID) {
  console.error('ALPHA_SESSION_TOKEN 과 LEAGUE_TOURNAMENT_ID 가 필요합니다.');
  process.exit(1);
}

const WIDTHS = [['mobile', 390], ['tablet', 768], ['desktop', 1440]];

async function settle(page, ms = 2500) {
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(ms);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(500);
}

/** 통합 순위 섹션이 화면에 보이도록 스크롤한 뒤 그 영역만 찍는다. */
async function shotStandings(page, out, file) {
  const section = page.locator('section[aria-labelledby="league-standings-heading"]').first();
  if (await section.count()) {
    await section.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(700);
    await section.screenshot({ path: path.join(out, file) }).catch(async () => {
      await page.screenshot({ path: path.join(out, file), fullPage: false, scale: 'css' });
    });
    return true;
  }
  await page.screenshot({ path: path.join(out, file), fullPage: false, scale: 'css' });
  return false;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [name, width] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addCookies([
      { name: 'teameet_v1_session', value: TOKEN, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    ]);
    const page = await ctx.newPage();

    // 1) 공개 상세 — 통합 순위 섹션
    await page.goto(`${BASE}/tournaments/${TID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page);
    const found = await shotStandings(page, OUT, `league-standings-${name}-${width}.png`);
    const p1 = await page.evaluate(() => {
      const s = document.querySelector('section[aria-labelledby="league-standings-heading"]');
      const text = s?.innerText ?? '';
      return {
        sectionFound: !!s,
        hasProgressNumbers: /\d+\s*\/\s*\d+/.test(text),
        hasPercent: /\d+%/.test(text),
        hasMagicOrClinched: /매직넘버|우승 확정/.test(text),
        rowCount: s ? s.querySelectorAll('tbody tr').length : 0,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    results.push({ shot: 'standings', name, width, ...p1, sectionScreenshot: found });
    console.log(`  standings ${name}: section=${p1.sectionFound} rows=${p1.rowCount} progress=${p1.hasProgressNumbers} pct=${p1.hasPercent} magic=${p1.hasMagicOrClinched} overflowX=${p1.overflowX}`);

    // 2) 대회 생성 폼 — format=league 선택 시에만 나오는 최소 경기 수
    await page.goto(`${BASE}/admin/tournaments/new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page);
    const beforeSelect = await page.evaluate(() => /최소 경기 수/.test(document.body.innerText));
    // 리그 옵션 선택 (버튼형/셀렉트형 모두 시도)
    const leagueBtn = page.getByRole('button', { name: /리그/ }).first();
    if (await leagueBtn.count()) await leagueBtn.click({ timeout: 5000 }).catch(() => {});
    else {
      const sel = page.locator('select').filter({ hasText: /리그/ }).first();
      if (await sel.count()) await sel.selectOption('league').catch(() => {});
    }
    await page.waitForTimeout(1200);
    const afterSelect = await page.evaluate(() => /최소 경기 수/.test(document.body.innerText));
    await page.screenshot({ path: path.join(OUT, `league-new-form-${name}-${width}.png`), fullPage: true, scale: 'css' });
    results.push({ shot: 'new-form', name, width, minMatchesBefore: beforeSelect, minMatchesAfter: afterSelect });
    console.log(`  new-form  ${name}: 최소경기수 before=${beforeSelect} after=${afterSelect}`);

    // 3) 대진 관리 — 자동 생성 클릭 시 뜨는 회전 수 모달
    await page.goto(`${BASE}/admin/tournaments/${TID}/bracket`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 3000);
    // group phase 조(A조/B조)의 자동 생성만 리그 회전 수 모달을 연다.
    // knockout 조(4강/결승)의 버튼을 누르면 기존 "경기 일정 추가" 확인창이 뜬다 —
    // .first() 로 잡으면 그쪽이 걸리므로 조 이름으로 카드를 좁힌다.
    const groupCard = page.locator('section,article,div').filter({ hasText: /^A조/ }).last();
    const autoBtn = (await groupCard.count())
      ? groupCard.getByRole('button', { name: /자동 생성|자동생성/ }).first()
      : page.getByRole('button', { name: /자동 생성|자동생성/ }).first();
    let modalOpened = false;
    if (await autoBtn.count()) {
      await autoBtn.scrollIntoViewIfNeeded().catch(() => {});
      await autoBtn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1800);
      modalOpened = await page.evaluate(() => /회전 수|싱글 라운드로빈|더블 라운드로빈/.test(document.body.innerText));
    }
    await page.screenshot({ path: path.join(OUT, `league-legs-modal-${name}-${width}.png`), fullPage: false, scale: 'css' });
    results.push({ shot: 'legs-modal', name, width, autoButtonFound: (await autoBtn.count()) > 0, modalOpened });
    console.log(`  legs-modal ${name}: button=${(await autoBtn.count()) > 0} modal=${modalOpened}`);

    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  console.log(`\n캡처 ${results.length}장 -> ${OUT}`);
})();
