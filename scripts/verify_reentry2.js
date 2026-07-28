const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ko-KR' });
  await ctx.addInitScript(() => {
    localStorage.setItem('teameet.v1.userId', '00000000-0000-4000-8000-000000001001');
    localStorage.setItem('teameet.v1.userEmail', 'coverage-active@teameet.v1');
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3013/tournaments/ee3be1a6-cb15-4707-b29f-a0f2242e2cba/apply', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => location.pathname.includes('/my') || /[0-9]\/3 단계/.test(document.body.innerText), null, { timeout: 20000 });
  await p.waitForTimeout(800);
  console.log(JSON.stringify({ finalPath: await p.evaluate(() => location.pathname + location.search) }));
  await browser.close();
})();
