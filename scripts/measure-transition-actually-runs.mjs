// "전환 애니메이션이 붙어 있다" 와 "전환이 실제로 재생된다" 는 다르다.
// view-transition-name 이 있어도 startViewTransition 이 안 불리면 화면은 그냥 툭 바뀐다.
import { chromium } from 'playwright';
const O = 'https://alpha.teameet.co.kr';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();

await p.addInitScript(() => {
  window.__vt = { calls: 0, types: [], pseudoSeen: false, animNames: [] };
  const orig = document.startViewTransition?.bind(document);
  if (orig) {
    document.startViewTransition = (cb) => {
      window.__vt.calls++;
      return orig(cb);
    };
  } else {
    window.__vt.unsupported = true;
  }
  // ::view-transition 의사요소가 실제로 생기면 그 위에서 애니메이션이 돈다.
  document.addEventListener('animationstart', (e) => {
    const n = e.animationName || '';
    window.__vt.animNames.push(n);
    if (/view-transition|slide|page|tm-(page|route|nav)/i.test(n)) window.__vt.pseudoSeen = true;
  }, true);
});

async function probe(from, toHref, label) {
  await p.goto(`${O}${from}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { window.__vt.calls = 0; window.__vt.animNames = []; window.__vt.pseudoSeen = false; });
  await p.click(`.tm-bottom-tab[href="${toHref}"]`);
  await p.waitForTimeout(2500);
  const vt = await p.evaluate(() => window.__vt);
  const uniq = [...new Set(vt.animNames)].slice(0, 8);
  console.log(`■ ${label}`);
  console.log(`   startViewTransition 호출  ${vt.unsupported ? '(브라우저 미지원)' : vt.calls + '회'}`);
  console.log(`   전환 중 재생된 애니메이션  ${uniq.length ? uniq.join(', ') : '없음'}`);
  console.log(`   → ${vt.calls > 0 ? '전환이 실제로 돈다' : '**전환이 안 돈다 — 화면이 툭 바뀐다**'}`);
}

await probe('/home', '/matches', '홈 → 매치 (탭 전환)');
await probe('/tournaments', '/teams', '대회 → 팀 (탭 전환)');

// 목록 → 상세 (앞으로 가기) 는 방향 인지 전환이 걸려야 하는 경로다.
await p.goto(`${O}/tournaments`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
await p.evaluate(() => { window.__vt.calls = 0; window.__vt.animNames = []; });
const card = await p.$('.tm-scroll-area a[href^="/tournaments/"]');
if (card) {
  await card.click();
  await p.waitForTimeout(2500);
  const vt = await p.evaluate(() => window.__vt);
  console.log(`■ 대회 목록 → 상세 (앞으로 가기)`);
  console.log(`   startViewTransition 호출  ${vt.calls}회`);
  console.log(`   재생된 애니메이션  ${[...new Set(vt.animNames)].slice(0,8).join(', ') || '없음'}`);
  console.log(`   → ${vt.calls > 0 ? '전환이 실제로 돈다' : '**전환이 안 돈다**'}`);
} else console.log('대회 카드 링크를 못 찾음');
await b.close();
