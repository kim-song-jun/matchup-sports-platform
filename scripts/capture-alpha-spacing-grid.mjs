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
// 날짜를 하드코딩하면 다음에 돌릴 때 옛 캡처를 덮어써서 비교가 불가능해진다.
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(2);
const OUT = process.env.OUT_DIR ?? `.screenshots/spacing-grid-${STAMP}`;
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
  // 나눈 결과**라 격자로 잴 대상이 아니다. computed 는 auto 를 이미 픽셀로 바꿔
  // 주므로(getPropertyValue 도 '9px' 를 준다) 선언값은 CSSOM 에서 읽어야 한다.
  //
  // 처음에 CSSOM 순회가 규칙 0개를 돌려줘 allowlist 로 우회했었는데, 원인은
  // **CSSStyleRule 도 cssRules(빈 리스트)를 갖는다**는 것이었다 — CSS Nesting 이
  // 표준화되면서 생긴 성질이라 `if (r.cssRules)` 가 truthy 로 잡혀 971개 규칙이
  // 전부 재귀로 새어 나갔다. 길이를 봐야 하고, 자기 자신 검사가 재귀보다 먼저다.
  const autoSel = { marginTop: [], marginBottom: [], marginLeft: [], marginRight: [] };
  const KEBAB = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const collect = (rules) => {
    for (const r of rules) {
      if (r.selectorText && r.style) {
        for (const k of Object.keys(autoSel)) {
          const v = r.style.getPropertyValue(KEBAB(k)) || r.style.getPropertyValue('margin');
          if (v && /(^|\s)auto(\s|$)/.test(v)) autoSel[k].push(r.selectorText);
        }
      }
      if (r.cssRules && r.cssRules.length) collect(r.cssRules);
    }
  };
  let sheetsRead = 0, sheetsBlocked = 0;
  for (const sheet of document.styleSheets) {
    try { collect(sheet.cssRules); sheetsRead++; }
    catch { sheetsBlocked++; }   // cross-origin 시트는 읽을 수 없다
  }
  const autoRuleCount = Object.values(autoSel).reduce((a, l) => a + l.length, 0);
  const isAuto = (el, p) => {
    const list = autoSel[p];
    if (!list) return false;
    for (const sel of list) { try { if (el.matches(sel)) return true; } catch { /* 미지원 셀렉터 */ } }
    return /(^|\s)auto(\s|$)/.test(el.style[p] || el.style.margin || '');
  };
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
      // 음수 마진(-10px 로 겹치기)도 격자 대상이다. 부호가 아니라 크기로 재야
      // v > 3 이 음수를 통째로 빠뜨리지 않는다 — CSS 게이트(checkSpacingGrid)도
      // Math.abs 로 재고 있어 기준이 갈리면 안 된다.
      const mag = Math.abs(v);
      const rem = mag % 4;
      // 1~3px 은 광학 보정으로 허용 (tokens.css SPACING 절)
      if (mag > 3 && rem > 0.05 && Math.abs(rem - 4) > 0.05) {
        off.push({ v, p, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40) });
      }
    }
  }
  const byValue = {};
  for (const o of off) byValue[o.v] = (byValue[o.v] || 0) + 1;
  return { checked, autoSkipped, autoRuleCount, sheetsRead, sheetsBlocked,
           offCount: off.length, byValue, sample: off.slice(0, 6) };
};

const results = [];
for (const [pname, path] of PAGES) {
  for (const [wname, width, height] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const resp = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    const status = resp?.status() ?? 0;
    // 라이브 경기가 있는 화면은 10초 폴링이라 networkidle 이 끝나지 않는다.
    // 그렇다고 고정 대기로 재면 **아직 스켈레톤인 화면의 여백을 재게 된다** —
    // 데이터가 늦게 오는 목록에서 이탈을 통째로 놓친다. DOM 이 멎을 때까지 기다린다.
    const settle = await page.evaluate(async () => {
      const count = () => document.querySelectorAll('body *').length;
      const skeleton = () =>
        document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], .animate-pulse').length;
      // 노드 수만 보면 **개수가 그대로인 레이아웃 변화**를 놓친다 — 이미지·폰트가
      // 늦게 실려 높이만 바뀌거나, hydration 이 클래스만 갈아끼우는 경우다.
      // 그래서 문서 높이도 함께 안정 조건에 넣는다.
      const sig = () => count() + ':' + Math.round(document.body.scrollHeight);
      let prev = '', stable = 0, waited = 0;
      while (waited < 12000) {
        await new Promise((r) => setTimeout(r, 400));
        waited += 400;
        const cur = sig();
        // 연속 3회(1.2초) 같으면 렌더가 멎은 것으로 본다
        stable = cur === prev ? stable + 1 : 0;
        prev = cur;
        if (stable >= 3 && skeleton() === 0) {
          return { waited, nodes: count(), height: document.body.scrollHeight, skeleton: 0 };
        }
      }
      return { waited, nodes: count(), height: document.body.scrollHeight, skeleton: skeleton() };
    });
    const audit = await page.evaluate(AUDIT);
    const file = `${pname}-${wname}-${width}.png`;
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
    // HTTP 200 만으로는 로그인 벽이나 에러 라우트로 **리다이렉트된 화면**을 못 가린다.
    // 그런 화면을 재고 "이탈 0" 이라 보고하면 아무것도 검증하지 않은 것이다.
    const landedOn = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    const expected = path.replace(/\/$/, '') || '/';
    const sameRoute = landedOn === expected;
    // 캡처가 403/500 이나 엉뚱한 라우트를 찍고 통과로 읽히는 사고를 막는다
    const ok = status === 200 && sameRoute;
    const settled = settle.skeleton === 0;
    // 시트를 하나도 못 읽었으면 auto 판별이 무력화된 상태다 — 그 측정은 못 믿는다.
    const cssomOk = audit.sheetsRead > 0;
    results.push({ pname, wname, width, status, landedOn, sameRoute, ...audit, ...settle, settled, cssomOk, file, ok });
    console.log(
      `${ok ? '  ' : '★ '}${pname.padEnd(15)} ${String(width).padStart(4)}px  HTTP ${status}` +
      (sameRoute ? '  ' : ` → ${landedOn} ⚠️  `) +
      `여백 ${String(audit.checked).padStart(4)}개 중 격자 이탈 ${audit.offCount}` +
      `  (렌더 ${settle.waited}ms·노드 ${settle.nodes}·auto규칙 ${audit.autoRuleCount}` +
      (cssomOk ? '' : '·CSSOM 차단 ⚠️') +
      (settled ? ')' : `·스켈레톤 ${settle.skeleton} 남음 ⚠️)`) +
      (audit.offCount ? `  ${JSON.stringify(audit.byValue)}` : ''),
    );
    if (audit.offCount && audit.sample.length) {
      for (const s of audit.sample) console.log(`      ${s.v}px ${s.p} <${s.tag} class="${s.cls}">`);
    }
    await ctx.close();
  }
}

await browser.close();

// 스켈레톤이 남은 채 잰 측정은 신뢰할 수 없다 — 통과로 읽히면 안 된다
const unsettled = results.filter((r) => !r.settled || !r.cssomOk);
const bad = results.filter((r) => !r.ok);
const totalOff = results.reduce((a, r) => a + r.offCount, 0);
const totalChecked = results.reduce((a, r) => a + r.checked, 0);
console.log(
  `\n합계: 여백 ${totalChecked}개 검사 · 격자 이탈 ${totalOff}개 · HTTP 비200 ${bad.length}건` +
  (unsettled.length ? ` · ⚠️ 렌더 미완 ${unsettled.length}건` : ''),
);
console.log(`저장: ${OUT}`);
// 하네스로 쓰려면 이탈도 실패여야 한다 — 숫자만 찍고 exit 0 이면 자동화에서 놓친다.
if (bad.length || totalOff || unsettled.length) process.exit(1);
