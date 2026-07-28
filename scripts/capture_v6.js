/* v6 캡처 — 결과 페이지(파랑 감축 후) + 명단 플로우 3상태. 톨 뷰포트 방식 */
const { chromium } = require('playwright');
const OUT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/fp-shots';
const GIF = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/gif-frames';
const WEB = 'http://localhost:3013';
const T = '5c46e679-7f80-4e55-a126-6075ca7ad4b2';
const REG = 't2reg00-0000-4000-8000-000000000001';

async function waitLoaded(page) {
  await page.waitForFunction(() => {
    if (document.querySelector('.tm-skeleton, [aria-busy="true"], [class*="skeleton" i]')) return false;
    return ((document.querySelector('main') || document.body).innerText || '').trim().length > 60;
  }, null, { timeout: 20000 });
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    const len = await page.evaluate(() => document.body.innerHTML.length);
    if (len === prev) break;
    prev = len;
    await page.waitForTimeout(400);
  }
}
async function tall(page, file, width, baseH) {
  const needed = await page.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    let h = document.documentElement.scrollHeight;
    if (sa) h = Math.max(h, sa.scrollHeight + Math.max(0, sa.getBoundingClientRect().top) + 20);
    return Math.ceil(h);
  });
  await page.setViewportSize({ width, height: Math.min(Math.max(needed + 8, baseH), 6000) });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  console.log('✓', file.split('/').pop());
}

(async () => {
  const browser = await chromium.launch();

  // 익명: 결과 페이지 m/d (조별 아코디언 펼침)
  const anon = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  for (const [w, h, name] of [[390, 844, 'fp_results_m'], [1440, 900, 'fp_results_d']]) {
    const p = await anon.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${WEB}/tournaments/${T}/results`, { waitUntil: 'domcontentloaded' });
    await waitLoaded(p);
    await p.evaluate(() => document.querySelector('.tm-res-expand-btn')?.click());
    await p.waitForTimeout(600);
    await tall(p, `${OUT}/${name}.jpeg`, w, h);
    await p.close();
  }
  // gif_b3 갱신 (결승 스트립 — 절제된 카드)
  const g = await anon.newPage();
  await g.setViewportSize({ width: 800, height: 900 });
  await g.goto(`${WEB}/tournaments/${T}/results`, { waitUntil: 'domcontentloaded' });
  await waitLoaded(g);
  await g.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await g.screenshot({ path: `${GIF}/gif_b3.jpeg`, type: 'jpeg', quality: 82 });
  console.log('✓ gif_b3');
  await g.close();
  await anon.close();

  // 참가팀 대표: 명단 3상태
  const owner = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  await owner.addInitScript(() => {
    localStorage.setItem('teameet.v1.userId', '00000000-0000-4000-8000-000000001001');
    localStorage.setItem('teameet.v1.userEmail', 'coverage-active@teameet.v1');
  });
  const r = await owner.newPage();
  await r.setViewportSize({ width: 390, height: 844 });
  await r.goto(`${WEB}/tournaments/${T}/registrations/${REG}/roster`, { waitUntil: 'domcontentloaded' });
  await waitLoaded(r);
  await tall(r, `${OUT}/fp_roster_list_m.jpeg`, 390, 844); // 5명 등록 상태
  // 추가 폼 열기
  await r.setViewportSize({ width: 390, height: 844 });
  await r.waitForTimeout(300);
  await r.evaluate(() => { Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '+ 추가')?.click(); });
  await r.waitForTimeout(700);
  await tall(r, `${OUT}/fp_roster_addform_m.jpeg`, 390, 844);
  // 폼 닫고 삭제 확인 모달
  await r.setViewportSize({ width: 390, height: 844 });
  await r.waitForTimeout(300);
  await r.evaluate(() => { Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'X')?.click(); });
  await r.waitForTimeout(400);
  await r.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).filter((b) => (b.textContent || '').trim() === '삭제').pop();
    btn?.click();
  });
  await r.waitForTimeout(700);
  await r.screenshot({ path: `${OUT}/fp_roster_delete_m.jpeg`, type: 'jpeg', quality: 82 });
  console.log('✓ fp_roster_delete_m.jpeg');
  await r.keyboard.press('Escape');
  await r.waitForTimeout(300);
  // 데스크탑 roster
  await tall(r, `${OUT}/fp_roster_d.jpeg`, 1440, 900);
  // 모바일 roster 기본(목록) fp_roster_m 교체
  await r.setViewportSize({ width: 390, height: 844 });
  await r.waitForTimeout(500);
  await tall(r, `${OUT}/fp_roster_m.jpeg`, 390, 844);
  await r.close();
  await owner.close();
  await browser.close();
  console.log('DONE');
})();
