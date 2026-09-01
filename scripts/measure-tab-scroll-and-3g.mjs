// 후보 A: 탭을 오갔다 돌아오면 스크롤이 유지되는가 (네이티브 앱은 유지한다)
// 후보 B: 느린 모바일 네트워크에서는 스켈레톤이 얼마나 오래 보이는가
import { chromium } from 'playwright';
const O = 'https://alpha.teameet.co.kr';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();

console.log('■ 후보 A — 탭 왕복 시 스크롤 유지');
await p.goto(`${O}/tournaments`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
const before = await p.evaluate(() => {
  const a = document.querySelector('.tm-scroll-area');
  if (!a || a.scrollHeight <= a.clientHeight + 50) return null;
  a.scrollTop = 500;
  return a.scrollTop;
});
if (before == null) { console.log('   대회 목록이 짧아 굴릴 수 없음'); }
else {
  await p.waitForTimeout(600);
  await p.click('.tm-bottom-tab[href="/teams"]');
  await p.waitForTimeout(2500);
  await p.click('.tm-bottom-tab[href="/tournaments"]');
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => document.querySelector('.tm-scroll-area')?.scrollTop ?? -1);
  console.log(`   굴림 ${before}px → 팀 탭 → 대회 탭 복귀 후 ${after}px`);
  console.log(`   → ${after > 300 ? '유지됨' : '**맨 위로 초기화 — 네이티브 앱과 다르다**'}`);
}

console.log('\n■ 후보 B — 느린 4G 에서 스켈레톤 노출 시간');
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
// 실측 가능한 모바일 조건: 다운 1.6Mbps / 업 750kbps / RTT 150ms (느린 4G)
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150,
});
await p.addInitScript(() => {
  window.__sk = []; let at = null;
  const tick = () => {
    const n = document.querySelectorAll('.tm-skeleton').length;
    if (n > 0 && at == null) at = performance.now();
    else if (n === 0 && at != null) { window.__sk.push(Math.round(performance.now() - at)); at = null; }
  };
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 16);
});
for (const [from, to, label] of [['/home', '/matches', '홈 → 매치'], ['/matches', '/teams', '매치 → 팀']]) {
  await p.goto(`${O}${from}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { window.__sk = []; });
  await p.click(`.tm-bottom-tab[href="${to}"]`);
  await p.waitForTimeout(9000);
  const sk = await p.evaluate(() => window.__sk);
  console.log(`   ${label.padEnd(12)} 스켈레톤 ${sk.length ? sk.join('ms, ') + 'ms' : '안 뜸'}`);
}
await b.close();
