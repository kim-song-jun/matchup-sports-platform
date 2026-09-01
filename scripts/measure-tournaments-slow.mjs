// /tournaments 는 API 3회·154ms 인데 콘텐츠까지 4.1초였다. 원인 후보를 가른다.
//   H1 RSC 페이로드가 느리다        → ?_rsc= 응답 시간
//   H2 클라이언트 렌더가 무겁다      → long task / 스크립트 실행 시간
//   H3 내 콘텐츠 판정이 틀렸다       → 실제 카드가 언제 DOM 에 들어오는지 직접 관측
//   H4 하이드레이션이 느리다         → 첫 상호작용 가능 시점
import { chromium } from 'playwright';
const O = 'https://alpha.teameet.co.kr';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();

const rsc = [];
p.on('requestfinished', async (r) => {
  if (!r.url().includes('_rsc=')) return;
  const t = r.timing();
  rsc.push(Math.round(t.responseEnd - t.requestStart));
});

await p.goto(`${O}/teams`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);

// 카드가 DOM 에 들어오는 순간을 MutationObserver 로 직접 잡는다(폴링 아님).
await p.evaluate(() => {
  window.__marks = [];
  window.__t0 = performance.now();
  const seen = new Set();
  const check = () => {
    for (const [label, sel] of [
      ['첫 링크', '.tm-scroll-area a[href]'],
      ['카드 3개', '.tm-scroll-area a[href^="/tournaments/"]'],
      ['스켈레톤 등장', '.tm-skeleton'],
    ]) {
      const n = document.querySelectorAll(sel).length;
      const ok = label === '카드 3개' ? n >= 3 : n >= 1;
      if (ok && !seen.has(label)) { seen.add(label); window.__marks.push([label, Math.round(performance.now() - window.__t0)]); }
    }
  };
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
  check();
});

rsc.length = 0;
const t0 = Date.now();
await p.click('.tm-bottom-tab[href="/tournaments"]');
await p.waitForTimeout(9000);

const marks = await p.evaluate(() => window.__marks);
const longTasks = await p.evaluate(() => {
  const e = performance.getEntriesByType('longtask') || [];
  return e.map((x) => Math.round(x.duration)).filter((d) => d > 50);
});
console.log('클릭 후 DOM 마크 (ms):');
marks.forEach(([l, ms]) => console.log(`   ${String(ms).padStart(5)}ms  ${l}`));
console.log(`\nRSC 요청 ${rsc.length}회, 응답시간: ${rsc.join(', ')}ms`);
console.log(`RSC 합 ${rsc.reduce((a, c) => a + c, 0)}ms · 최대 ${Math.max(0, ...rsc)}ms`);
console.log(`long task(>50ms) ${longTasks.length}개: ${longTasks.slice(0, 8).join(', ')}`);
console.log(`\n총 관측 시간 ${Date.now() - t0}ms`);
await b.close();
