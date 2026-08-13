// 피치 보드가 코드가 지정한 aspect-ratio(1/1.544)대로 그려지지 않는 원인을 실제 브라우저의
// computed style 로 좁힌다 — 어느 조상이 높이를 눌렀는지 체인을 따라 올라가며 찍는다.
import { chromium } from 'playwright';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const TOURNAMENT_ID = process.env.TOURNAMENT_ID || '663d78c6-fa99-4007-a81b-06937ff14c19';
const FIXTURE_ID = process.env.FIXTURE_ID || 'c9eed3d8-10c5-4dc5-970f-770fc487f978';
const WIDTH = Number(process.env.WIDTH || 1440);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
await ctx.addCookies([{
  name: 'teameet_v1_session', value: TOKEN, domain: new URL(BASE).hostname,
  path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
}]);
const page = await ctx.newPage();
await page.goto(`${BASE}/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}/lineup`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(2000);
const teamPick = page.getByRole('button', { name: /명단 짜기/ }).first();
if (await teamPick.count().then((n) => n > 0).catch(() => false)) {
  await teamPick.click({ timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
}

const report = await page.evaluate(() => {
  const board = document.querySelector('[aria-label="피치 배치 보드"]');
  if (!board) return { error: '보드 없음' };
  const chain = [];
  let node = board;
  for (let i = 0; i < 5 && node; i += 1) {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    chain.push({
      level: i === 0 ? 'board' : `parent${i}`,
      tag: node.tagName.toLowerCase(),
      cls: (node.className || '').toString().slice(0, 40),
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      ratio: +(r.height / r.width).toFixed(3),
      aspectRatio: cs.aspectRatio,
      display: cs.display,
      flexDirection: cs.flexDirection,
      alignItems: cs.alignItems,
      height: cs.height,
      maxHeight: cs.maxHeight,
      minHeight: cs.minHeight,
      flexBasis: cs.flexBasis,
      flexShrink: cs.flexShrink,
      width: cs.width,
      maxWidth: cs.maxWidth,
      boxSizing: cs.boxSizing,
      padding: cs.padding,
    });
    node = node.parentElement;
  }
  // 포메이션 select 도 함께 실측
  const select = document.querySelector('select.tm-input-select');
  const sel = select ? (() => {
    const r = select.getBoundingClientRect();
    const cs = getComputedStyle(select);
    return {
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      minHeight: cs.minHeight, fontSize: cs.fontSize,
      optionCount: select.options.length,
      selectedText: select.options[select.selectedIndex]?.text ?? null,
      textOverflows: select.scrollWidth > select.clientWidth,
    };
  })() : null;
  return { chain, select: sel };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
