#!/usr/bin/env node
/** 간격 격자 정리(#785 CSS · #797 Tailwind 유틸 · #798 인라인 style)의 alpha 실측.
 *
 *  스크린샷만으로는 2px 차이를 눈으로 확인할 수 없다 — 이 저장소에는 육안 대조로
 *  #ffffff vs #f9fafb 를 놓쳐 회귀를 0건으로 오진한 사고가 있다. 그래서 3폭 캡처와
 *  함께 **실제 요소의 computed 여백을 읽어 4의 배수인지 판정**한다.
 *
 *  자격증명은 환경변수로만(ALPHA_PASSWORD). 없으면 공개 화면만 찍는다.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.OUT_DIR ?? '.screenshots/spacing-grid-0827';
const WIDTHS = [
  ['mobile', 390, 950],
  ['tablet', 768, 1024],
  ['desktop', 1440, 1000],
];
const PAGES = [
  ['landing', '/landing'],
  ['tournaments', '/tournaments'],
  ['league-matches', '/league-matches'],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

/** 화면에 실제로 그려진 여백을 읽어 격자 이탈을 센다. */
const AUDIT = () => {
  const PROPS = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
    'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'rowGap', 'columnGap'];
  let checked = 0;
  const off = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;   // 숨겨진 요소는 화면에 없다
    const cs = getComputedStyle(el);
    for (const p of PROPS) {
      const v = parseFloat(cs[p]);
      if (!Number.isFinite(v) || v === 0) continue;
      checked++;
      // 1~3px 은 광학 보정으로 허용 (tokens.css SPACING 절)
      if (v > 3 && v % 4 !== 0) {
        off.push({ v, p, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40) });
      }
    }
  }
  const byValue = {};
  for (const o of off) byValue[o.v] = (byValue[o.v] || 0) + 1;
  return { checked, offCount: off.length, byValue, sample: off.slice(0, 6) };
};

const results = [];
for (const [pname, path] of PAGES) {
  for (const [wname, width, height] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const resp = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    const status = resp?.status() ?? 0;
    // 라이브 경기가 있는 화면은 폴링이라 networkidle 이 끝나지 않는다 — 명시 대기
    await page.waitForTimeout(2600);
    const audit = await page.evaluate(AUDIT);
    const file = `${pname}-${wname}-${width}.png`;
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
    // 캡처가 403/500 을 찍고 통과로 읽히는 사고를 막는다
    const ok = status === 200;
    results.push({ pname, wname, width, status, ...audit, file, ok });
    console.log(
      `${ok ? '  ' : '★ '}${pname.padEnd(15)} ${String(width).padStart(4)}px  HTTP ${status}  ` +
      `여백 ${String(audit.checked).padStart(4)}개 중 격자 이탈 ${audit.offCount}` +
      (audit.offCount ? `  ${JSON.stringify(audit.byValue)}` : ''),
    );
    if (audit.offCount && audit.sample.length) {
      for (const s of audit.sample) console.log(`      ${s.v}px ${s.p} <${s.tag} class="${s.cls}">`);
    }
    await ctx.close();
  }
}

await browser.close();

const bad = results.filter((r) => !r.ok);
const totalOff = results.reduce((a, r) => a + r.offCount, 0);
const totalChecked = results.reduce((a, r) => a + r.checked, 0);
console.log(`\n합계: 여백 ${totalChecked}개 검사 · 격자 이탈 ${totalOff}개 · HTTP 비200 ${bad.length}건`);
console.log(`저장: ${OUT}`);
if (bad.length) process.exit(1);
