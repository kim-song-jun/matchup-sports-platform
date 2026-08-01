/* step3(입금 안내) 재캡처 — registration 이 awaiting_payment 라 재진입 시 3단계로 복원됨 */
const { chromium } = require('playwright');
const OUT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/fp-shots';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('teameet.v1.userId', '00000000-0000-4000-8000-000000001001');
    localStorage.setItem('teameet.v1.userEmail', 'coverage-active@teameet.v1');
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3013/tournaments/ee3be1a6-cb15-4707-b29f-a0f2242e2cba/apply', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => ((document.querySelector('main') || document.body).innerText || '').length > 60, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const step = await page.evaluate(() => document.body.innerText.match(/([0-9])\/3 단계/)?.[1]);
  console.log('재진입 스텝:', step);
  if (step !== '3') throw new Error('3단계 재진입 실패');
  const needed = await page.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    let h = document.documentElement.scrollHeight;
    if (sa) h = Math.max(h, sa.scrollHeight + Math.max(0, sa.getBoundingClientRect().top) + 20);
    return Math.ceil(h);
  });
  await page.setViewportSize({ width: 390, height: Math.min(Math.max(needed + 8, 844), 6000) });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/fp_apply_step3_m.jpeg`, type: 'jpeg', quality: 82 });
  console.log('✓ fp_apply_step3_m.jpeg');
  await browser.close();
})();
