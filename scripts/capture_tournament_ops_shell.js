/**
 * 대회 운영 셸(/tournament-ops) 5개 화면을 390/768/1440 세 폭으로 캡처한다.
 * 로컬 v1 스택 + 헤더 dev 인증(localStorage teameet.v1.userId/userEmail).
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WEB = process.env.WEB_BASE || 'http://localhost:3013';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), '.screenshots', 'tournament-ops-shell');
const [tournamentId, userId, userEmail] = process.argv.slice(2);
if (!tournamentId || !userId || !userEmail) {
  console.error('usage: node scripts/capture_tournament_ops_shell.js <tournamentId> <userId> <userEmail>');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['operations', 'operations'],
  ['result-review', 'result-review'],
  ['records/corrections', 'corrections'],
  ['videos', 'videos'],
  ['staff', 'staff'],
];
const WIDTHS = [[390, 900], [768, 1100], [1440, 1100]];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(([id, email]) => {
    localStorage.setItem('teameet.v1.userId', id);
    localStorage.setItem('teameet.v1.userEmail', email);
  }, [userId, userEmail]);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [browser error]', m.text().slice(0, 160));
  });

  for (const [route, name] of PAGES) {
    const url = `${WEB}/tournament-ops/tournaments/${tournamentId}/${route}`;
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
      /* 셸 내비가 붙을 때까지 기다린다 — 안 기다리면 "로그인 정보를 확인하고 있어요"
         인증 로딩 화면을 찍는다. 실패를 삼키면 인증·게이트가 깨진 화면도 성공한
         스크린샷처럼 저장돼, 이 캡처를 근거로 쓰는 판단이 통째로 틀어진다. 그래서
         catch 하지 않고 그대로 실패시킨다. */
      await page.waitForSelector('nav[aria-label="주 메뉴"], button[aria-label="메뉴 열기"]', { timeout: 120000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: true });
    }
    // 한 화면당 한 번만 본문 텍스트를 찍어 상태를 남긴다(빈 상태/CTA 확인용).
    const text = (await page.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | ');
    console.log(`[${name}] ${text.slice(0, 260)}`);
  }

  // 계약 확인 — 문서에 main 랜드마크가 하나뿐인지, 본문 뒤로가기가 사라졌는지
  for (const [route, name] of PAGES) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${WEB}/tournament-ops/tournaments/${tournamentId}/${route}`, { waitUntil: 'domcontentloaded' });
    // 계약 측정도 같은 이유로 실패를 삼키지 않는다 — 셸이 안 떴는데 CONTRACT 로그가
    // 찍히면 "측정했다"는 말 자체가 거짓이 된다.
    await page.waitForSelector('nav[aria-label="주 메뉴"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const eyebrow = h1?.previousElementSibling;
      const main = document.querySelectorAll('main');
      const inner = main[0]?.firstElementChild;
      return {
        mains: main.length,
        h1: h1?.textContent?.trim() ?? null,
        h1Size: h1 ? getComputedStyle(h1).fontSize : null,
        eyebrow: eyebrow?.textContent?.trim()?.slice(0, 24) ?? null,
        contentWidth: inner ? Math.round(inner.getBoundingClientRect().width) : null,
        backLinksInBody: Array.from(document.querySelectorAll('main a, main button')).filter((el) =>
          /대회로/.test(el.textContent || ''),
        ).length,
      };
    });
    console.log(`CONTRACT ${name}:`, JSON.stringify(info, { }, 0));
  }

  console.log('DONE:', fs.readdirSync(OUT).sort().join(', '));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
