#!/usr/bin/env node
/** 간격 격자 정리(#785 CSS · #797 Tailwind 유틸 · #798 인라인 style)의 alpha 실측.
 *
 *  스크린샷만으로는 2px 차이를 눈으로 확인할 수 없다 — 이 저장소에는 육안 대조로
 *  #ffffff vs #f9fafb 를 놓쳐 회귀를 0건으로 오진한 사고가 있다. 그래서 3폭 캡처와
 *  함께 **실제 요소의 computed 여백을 읽어 4의 배수인지 판정**한다.
 *
 *  공개 경로만 돌기 때문에 자격증명이 필요 없다 — 로그인 뒤 화면까지 보려면
 *  scripts/capture-alpha-card-adaptive.mjs 처럼 ALPHA_PASSWORD 로 세션을 만들어야 한다.
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
  // margin:auto 가 남긴 여백은 저자가 고른 값이 아니라 **브라우저가 남은 공간을
  // 나눈 결과**라 격자로 잴 대상이 아니다. 그런데 그걸 자동으로 알아낼 방법이 없다:
  //   · computed 는 auto 를 이미 픽셀로 바꿔 준다(getPropertyValue 도 '9px' 를 준다)
  //   · CSSOM 으로 선언값을 읽으려 했지만 이 앱에서는 규칙이 0개로 나온다
  //     (실측: styleSheets 2개 모두 접근 가능한데 순회 결과 CSSStyleRule 0개 —
  //      Tailwind v4 의 @layer 구조 때문으로 보인다)
  // 그래서 auto 를 쓰는 셀렉터를 여기 적는다. 늘어나면 추가하되, **추가 전에
  // 반드시 소스에서 auto 인지 확인한다** — 격자 이탈을 예외로 덮는 통로가 되면 안 된다.
  const AUTO_MARGIN = [
    ['.tm-tournament-promo-card-footer', 'marginTop'],   // desktop/tournaments.css:1325 margin-top: auto
    ['.tm-desktop-footer-links', 'marginLeft'],          // desktop/_shell.css:447   margin-left: auto
  ];
  const isAuto = (el, p) => AUTO_MARGIN.some(([sel, prop]) => {
    if (prop !== p) return false;
    try { return el.matches(sel); } catch { return false; }
  });
  let checked = 0, autoSkipped = 0;
  const off = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;   // 숨겨진 요소는 화면에 없다
    const cs = getComputedStyle(el);
    for (const p of PROPS) {
      if (p.startsWith('margin') && isAuto(el, p)) { autoSkipped++; continue; }
      const raw = parseFloat(cs[p]);
      if (!Number.isFinite(raw) || raw === 0) continue;
      checked++;
      // computed 는 11.999999 처럼 나올 수 있다 — 0.05px 허용오차로 반올림해 잰다.
      const v = Math.round(raw * 20) / 20;
      const rem = Math.abs(v % 4);
      // 1~3px 은 광학 보정으로 허용 (tokens.css SPACING 절)
      if (v > 3 && rem > 0.05 && Math.abs(rem - 4) > 0.05) {
        off.push({ v, p, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40) });
      }
    }
  }
  const byValue = {};
  for (const o of off) byValue[o.v] = (byValue[o.v] || 0) + 1;
  return { checked, autoSkipped, offCount: off.length, byValue, sample: off.slice(0, 6) };
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
// 하네스로 쓰려면 이탈도 실패여야 한다 — 숫자만 찍고 exit 0 이면 자동화에서 놓친다.
if (bad.length || totalOff) process.exit(1);
