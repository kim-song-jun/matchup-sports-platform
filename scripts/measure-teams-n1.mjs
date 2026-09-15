import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const seen = [];
p.on('request', (r) => { if (/\/api\/v1\//.test(r.url())) seen.push(new URL(r.url()).pathname + new URL(r.url()).search); });
await p.goto('https://alpha.teameet.co.kr/matches', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
seen.length = 0;
await p.click('.tm-bottom-tab[href="/teams"]');
await p.waitForTimeout(8000);
const shape = new Map();
for (const s of seen) {
  const k = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ':id').split('?')[0];
  shape.set(k, (shape.get(k) ?? 0) + 1);
}
console.log(`총 ${seen.length}회, 경로 모양별:`);
[...shape.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}회  ${k}`));
await b.close();
