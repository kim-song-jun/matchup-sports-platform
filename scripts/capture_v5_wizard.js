/* 신청 위저드 3스텝 재캡처 (마감일 정비 후) — capture_v5.js 의 위저드 파트만 */
const { chromium } = require('playwright');
const WEB = 'http://localhost:3013';
const OUT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/fp-shots';
const T_OPEN = 'ee3be1a6-cb15-4707-b29f-a0f2242e2cba';

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
async function tall(page, file) {
  const needed = await page.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    let h = document.documentElement.scrollHeight;
    if (sa) h = Math.max(h, sa.scrollHeight + Math.max(0, sa.getBoundingClientRect().top) + 20);
    return Math.ceil(h);
  });
  const target = Math.min(Math.max(needed + 8, 844), 6000);
  await page.setViewportSize({ width: 390, height: target });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 82 });
  console.log('✓', file);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('teameet.v1.userId', '00000000-0000-4000-8000-000000001001');
    localStorage.setItem('teameet.v1.userEmail', 'coverage-active@teameet.v1');
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/tournaments/${T_OPEN}/apply`, { waitUntil: 'domcontentloaded' });
  await waitLoaded(page);
  const banner = await page.evaluate(() => document.body.innerText.includes('신청이 마감됐어요'));
  if (banner) throw new Error('여전히 마감 상태');
  await tall(page, 'fp_apply_step1_m.jpeg');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('button, label, [role="radio"]')).find((el) => (el.textContent || '').includes('티밋 FC'));
    card.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const next = Array.from(document.querySelectorAll('button')).find((b) => /다음/.test((b.textContent || '').trim()) && !b.disabled);
    next.click();
  });
  await page.waitForTimeout(1800);
  await waitLoaded(page).catch(() => {});
  const step = await page.evaluate(() => document.body.innerText.match(/([0-9])\/3 단계/)?.[1]);
  console.log('현재 스텝:', step);
  await tall(page, 'fp_apply_step2_m.jpeg');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  // 동의는 sr-only input 이 아니라 카드 onClick — "전체 동의" 카드를 실제 클릭
  await page.click('text=전체 동의');
  await page.waitForTimeout(500);
  const checkedCount = await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]:checked').length);
  const depositor = await page.evaluate(() => {
    const inp = Array.from(document.querySelectorAll('input[type="text"]')).find((i) => (i.value || '').length > 0);
    return inp?.value ?? null;
  });
  console.log('체크된 동의:', checkedCount, '/ 입금자명 자동 채움:', depositor);
  await page.evaluate(() => {
    const next = Array.from(document.querySelectorAll('button')).find(
      (b) => /신청하기|다음/.test((b.textContent || '').trim()) && !b.disabled && b.type !== 'reset',
    );
    if (!next) throw new Error('신청하기 버튼이 여전히 비활성');
    next.click();
  });
  await page.waitForTimeout(900);
  // 확인 모달 → "확인하고 신청하기"
  await page.click('text=확인하고 신청하기');
  await page.waitForTimeout(2500);
  await waitLoaded(page).catch(() => {});
  const step3 = await page.evaluate(() => document.body.innerText.match(/([0-9])\/3 단계/)?.[1]);
  console.log('현재 스텝:', step3);
  if (step3 !== '3') throw new Error('3단계 진입 실패');
  await tall(page, 'fp_apply_step3_m.jpeg');
  await browser.close();
  console.log('DONE');
})();
