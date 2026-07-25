// 관리자 대진표 편집 UI 실태 캡처. 조/경기가 없는 빈 상태와 데이터가 있는 상태를 모두 본다.
// Run: node scripts/capture_admin_bracket.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const OUT = path.resolve(__dirname, '../docs/visual-qa/admin-bracket');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@teameet.v1';
const TID = process.env.TID || 'aa000000-0000-4000-8000-000000000001';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;
const PHASE = process.env.PHASE || 'empty';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  // admin 가드는 이메일로 사용자를 resolve 한다(로컬 헤더 인증).
  await ctx.addInitScript((e) => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', e);
  }, ADMIN_EMAIL);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });

  // 재동의 게이트는 admin 계정에도 뜨고 admin 라우트보다 먼저 가로챈다. 통과부터 시킨다.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (!(await page.getByText('새 필수 약관을 확인해 주세요').count())) break;
    await page.getByText('필수 약관 전체 동의').first().click();
    await page.waitForTimeout(500);
    const submit = page.getByRole('button', { name: /동의/ }).last();
    if (await submit.isEnabled().catch(() => false)) await submit.click();
    await page.waitForTimeout(2000);
  }

  await page.goto(`${BASE}/admin/tournaments/${TID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 대진 관리 탭이 이 조사의 대상이다. 탭 전환 후 렌더를 기다린다.
  const bracketTab = page.locator('button', { hasText: '대진 관리' }).first();
  if (await bracketTab.count()) {
    await bracketTab.scrollIntoViewIfNeeded().catch(() => {});
    await bracketTab.click({ force: true });
    // 탭 전환은 클라이언트 상태 변경이라 네트워크 대기로는 안 잡힌다. 실제 전환을 확인한다.
    await page.waitForTimeout(2500);
    const switched = await page.evaluate(() =>
      !document.body.innerText.includes('입금 확인 중'));
    console.log(`대진 관리 탭 전환: ${switched ? 'OK' : '실패(신청 관리 유지)'}`);
  } else {
    console.log('WARN: 대진 관리 탭을 찾지 못함');
  }
  await page.addStyleTag({ content: HIDE }).catch(() => {});

  // 화면에 있는 탭/섹션 이름과 버튼을 그대로 수집해 진입점 실태를 본다.
  const probe = await page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const texts = (sel) => Array.from(document.querySelectorAll(sel)).filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30)).filter(Boolean);
    return {
      url: location.pathname,
      tabs: [...new Set(texts('[role="tab"], .tm-admin-tab, nav button'))].slice(0, 20),
      buttons: [...new Set(texts('button'))].slice(0, 40),
      headings: [...new Set(texts('h1, h2, h3'))].slice(0, 20),
      bodyStart: document.body.innerText.slice(0, 200).replace(/\n+/g, ' | '),
    };
  });
  console.log(JSON.stringify(probe, null, 2));
  await page.screenshot({ path: path.join(OUT, `admin-bracket-${PHASE}.png`), fullPage: true, scale: 'css' });
  fs.writeFileSync(path.join(OUT, `probe-${PHASE}.json`), JSON.stringify({ probe, consoleErrors: [...new Set(errs)].slice(0, 5) }, null, 2));

  await page.close();
  await ctx.close();
  await browser.close();
  console.log(`\nsaved → ${OUT}/admin-bracket-${PHASE}.png`);
})();
