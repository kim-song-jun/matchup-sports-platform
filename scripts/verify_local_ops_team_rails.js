/** teamAccent 리팩터 후에도 정상 경로(sides 로드됨)의 팀 색이 그대로인지 실화면에서 확인한다. */
const { chromium } = require('playwright');
const path = require('node:path');
const [tournamentId, fixtureId, userId, userEmail] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(([id, email]) => {
    localStorage.setItem('teameet.v1.userId', id);
    localStorage.setItem('teameet.v1.userEmail', email);
  }, [userId, userEmail]);
  const page = await context.newPage();
  await page.goto(`http://localhost:3013/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/operate`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('ul[aria-label="기록된 이벤트 목록"] li', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('ul[aria-label="기록된 이벤트 목록"] li')).map((li) => {
      const rail = li.querySelector('span.w-1');
      const dot = li.querySelector('span.h-2.w-2');
      const cs = (el) => (el ? getComputedStyle(el).backgroundColor : null);
      return {
        text: (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        railColor: cs(rail),
        dotColor: cs(dot),
      };
    }),
  );
  console.log(JSON.stringify(rows, null, 1));
  await page.screenshot({ path: path.join(process.cwd(), '.screenshots/ops-console-step345/verify-rails-1440.png') });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
