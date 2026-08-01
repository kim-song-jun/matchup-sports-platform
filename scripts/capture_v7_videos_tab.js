const { chromium } = require('playwright');
const OUT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/fp-shots';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto('http://localhost:3013/tournaments/5c46e679-7f80-4e55-a126-6075ca7ad4b2/results', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.querySelector('.tm-skeleton, [aria-busy="true"]') && document.body.innerText.includes('경기 영상'), null, { timeout: 20000 });
  await p.click('text=경기 영상 9');
  await p.waitForTimeout(800);
  const needed = await p.evaluate(() => {
    const sa = document.querySelector('.tm-scroll-area');
    let h = document.documentElement.scrollHeight;
    if (sa) h = Math.max(h, sa.scrollHeight + Math.max(0, sa.getBoundingClientRect().top) + 20);
    return Math.ceil(h);
  });
  await p.setViewportSize({ width: 390, height: Math.min(needed + 8, 6000) });
  await p.waitForTimeout(600);
  await p.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await p.screenshot({ path: `${OUT}/fp_results_videos_m.jpeg`, type: 'jpeg', quality: 82 });
  console.log('✓ fp_results_videos_m');
  await browser.close();
})();
