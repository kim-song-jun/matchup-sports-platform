const { chromium } = require('playwright');
const GIF = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/gif-frames';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ko-KR', deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', 'admin@teameet.v1');
  });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('http://localhost:3013/admin/tournaments/5c46e679-7f80-4e55-a126-6075ca7ad4b2', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.body.innerText.length > 300, null, { timeout: 20000 });
  await p.evaluate(() => { Array.from(document.querySelectorAll('[role="tab"], button')).find((b) => (b.textContent || '').trim() === '대진 관리')?.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').includes('final') && b.textContent.includes('결과 입력'));
    btn?.click();
  });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${GIF}/gif_b2.jpeg`, type: 'jpeg', quality: 82 });
  console.log('✓ gif_b2 (편집기 v2 — 썸네일·순서·진행률)');
  await browser.close();
})();
