// 홈→매치 1ms 가 진짜인지, 출발 페이지에 이미 그 셀렉터가 잡혀서인지 가른다.
import { chromium } from 'playwright';
const O = 'https://alpha.teameet.co.kr';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
for (const [path, sel] of [['/home', '.tm-scroll-area a[href^="/matches/"]'], ['/matches', '.tm-scroll-area a[href^="/teams/"]'], ['/teams', '.tm-scroll-area a[href^="/tournaments/"]']]) {
  await p.goto(`${O}${path}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  const n = await p.evaluate((s) => document.querySelectorAll(s).length, sel);
  console.log(`${path.padEnd(14)} 에 이미 있는 "${sel.split('"')[1]}" 링크: ${n}개  ${n >= 3 ? '← 측정 오염(즉시 참)' : 'OK'}`);
}
await b.close();
