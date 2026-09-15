// 앞선 두 측정이 전부 4초 오염됐다(스켈레톤 대기 타임아웃이 Promise.all 로 섞임).
// 이번엔 MutationObserver 로 **카드가 DOM 에 들어오는 순간**만 직접 잡는다. 타임아웃 없음.
import { chromium } from 'playwright';
const O = 'https://alpha.teameet.co.kr';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();

async function run(from, toHref, cardSel, label) {
  await p.goto(`${O}${from}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  let apiCount = 0;
  const onReq = (r) => { if (/\/api\/v1\//.test(r.url())) apiCount++; };
  p.on('request', onReq);
  await p.evaluate((sel) => {
    window.__hit = null; window.__t0 = performance.now();
    const check = () => {
      if (window.__hit == null && document.querySelectorAll(sel).length >= 3) {
        window.__hit = Math.round(performance.now() - window.__t0);
      }
    };
    window.__mo = new MutationObserver(check);
    window.__mo.observe(document.body, { childList: true, subtree: true });
    check();
  }, cardSel);
  await p.click(`.tm-bottom-tab[href="${toHref}"]`);
  await p.waitForTimeout(9000);
  const hit = await p.evaluate(() => { window.__mo?.disconnect(); return window.__hit; });
  p.off('request', onReq);
  console.log(`■ ${label.padEnd(14)} 카드 3개까지 ${hit == null ? '9초 내 미도달' : hit + 'ms'}   (API ${apiCount}회)`);
}

await run('/home', '/matches', '.tm-scroll-area a[href^="/matches/"]', '홈 → 매치');
await run('/matches', '/teams', '.tm-scroll-area a[href^="/teams/"]', '매치 → 팀');
await run('/teams', '/tournaments', '.tm-scroll-area a[href^="/tournaments/"]', '팀 → 대회');
await b.close();
