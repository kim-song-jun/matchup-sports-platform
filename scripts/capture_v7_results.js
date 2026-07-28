const { chromium } = require('playwright');
const OUT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/fp-shots';
const T = '5c46e679-7f80-4e55-a126-6075ca7ad4b2';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  for (const [w, h, name] of [[390, 844, 'fp_results_m'], [1440, 900, 'fp_results_d']]) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`http://localhost:3013/tournaments/${T}/results`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !document.querySelector('.tm-skeleton, [aria-busy="true"]') && document.body.innerText.includes('최종 순위'), null, { timeout: 20000 });
    await p.evaluate(() => document.querySelector('.tm-res-expand-btn')?.click());
    await p.waitForTimeout(600);
    const needed = await p.evaluate(() => {
      const sa = document.querySelector('.tm-scroll-area');
      let hh = document.documentElement.scrollHeight;
      if (sa) hh = Math.max(hh, sa.scrollHeight + Math.max(0, sa.getBoundingClientRect().top) + 20);
      return Math.ceil(hh);
    });
    await p.setViewportSize({ width: w, height: Math.min(needed + 8, 6000) });
    await p.waitForTimeout(600);
    await p.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
    await p.screenshot({ path: `${OUT}/${name}.jpeg`, type: 'jpeg', quality: 82 });
    console.log('✓', name);
    await p.close();
  }
  await browser.close();
})();
