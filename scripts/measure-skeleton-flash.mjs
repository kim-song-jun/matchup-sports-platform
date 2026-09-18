// 스켈레톤이 **얼마나 짧게** 보이는가. 짧게 깜빡이면 그 자체가 "다시 그림" 신호가 된다.
// (사람은 100ms 안팎의 깜빡임을 "로딩"이 아니라 "화면이 튐"으로 읽는다.)
import { chromium } from 'playwright';
const O = 'https://alpha.teameet.co.kr';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();

await p.addInitScript(() => {
  window.__sk = [];
  let shownAt = null;
  const tick = () => {
    const n = document.querySelectorAll('.tm-skeleton').length;
    if (n > 0 && shownAt == null) shownAt = performance.now();
    else if (n === 0 && shownAt != null) {
      window.__sk.push(Math.round(performance.now() - shownAt));
      shownAt = null;
    }
  };
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 16);
});

async function probe(from, toHref, label) {
  await p.goto(`${O}${from}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { window.__sk = []; });
  await p.click(`.tm-bottom-tab[href="${toHref}"]`);
  await p.waitForTimeout(6000);
  const sk = await p.evaluate(() => window.__sk);
  const verdict = sk.length === 0 ? '스켈레톤 안 뜸'
    : sk.every((d) => d < 200) ? '**깜빡임 — 200ms 미만**'
    : sk.some((d) => d >= 400) ? '충분히 보임' : '애매 (200~400ms)';
  console.log(`■ ${label.padEnd(14)} 스켈레톤 노출 ${sk.length ? sk.join('ms, ') + 'ms' : '없음'}  → ${verdict}`);
}

await probe('/home', '/matches', '홈 → 매치');
await probe('/matches', '/teams', '매치 → 팀');
await probe('/teams', '/tournaments', '팀 → 대회');
await probe('/tournaments', '/my', '대회 → 마이');
await b.close();
