#!/usr/bin/env node
/** #816 태블릿 2열 · #815 브랜드 파랑이 alpha 에 실제로 반영됐는지 잰다.
 *
 *  둘 다 "값이 맞는가"로 판정한다. 태블릿은 스크린샷으로도 보이지만 열 수를
 *  눈으로 세는 것보다 좌표로 세는 편이 정확하고, 색은 두 파랑이 원래 미묘하게만
 *  달라 육안으로는 구분되지 않는다(이 저장소에 #ffffff vs #f9fafb 를 놓친 기록이
 *  있다).
 *
 *  공개 경로만 쓰므로 자격증명이 필요 없다.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const STAMP = new Date().toISOString().slice(2, 10).replace(/-/g, '');
const OUT = process.env.OUT_DIR ?? `output/tablet-blue-${STAMP}`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  // ── 1) 태블릿 2열 (#816) ─────────────────────────────────────────
  // 390 은 1열, 768 은 2열, 1024+ 는 3열이어야 한다.
  for (const [w, wantCols] of [[390, 1], [768, 2], [1024, 3], [1440, 3]]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1100 } });
    const resp = await page.goto(BASE + '/tournaments', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const got = await page.evaluate(() => {
      const grid = document.querySelector('.tm-tournament-list-grid');
      if (!grid) return { err: '.tm-tournament-list-grid 없음' };
      const cards = [...grid.children].filter((e) => e.getBoundingClientRect().width > 100);
      if (!cards.length) return { err: '카드 0개' };
      // 같은 행에 있는 카드끼리 top 이 같다 — 좌표로 세면 눈으로 세는 것보다 정확하다
      const tops = new Set(cards.map((e) => Math.round(e.getBoundingClientRect().top)));
      return {
        display: getComputedStyle(grid).display,
        cols: Math.round(cards.length / tops.size),
        cardW: Math.round(cards[0].getBoundingClientRect().width),
        cards: cards.length,
      };
    });
    const status = resp?.status() ?? 0;
    await page.screenshot({ path: `${OUT}/tournaments-${w}.png`, fullPage: false });
    results.push({
      label: `태블릿 그리드 · ${w}px`,
      status,
      ok: status === 200 && !got.err && got.cols === wantCols,
      got,
      want: `${wantCols}열`,
    });
    await page.close();
  }

  // ── 2) 브랜드 파랑 (#815) ────────────────────────────────────────
  // Tailwind 유틸·토큰·투명도 변형이 모두 같은 값을 내야 한다.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const resp = await page.goto(BASE + '/tournaments', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    const got = await page.evaluate(() => {
      const mk = (cls, style) => {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        if (style) d.style.cssText = style;
        document.body.appendChild(d);
        const cs = getComputedStyle(d);
        const r = { bg: cs.backgroundColor, ring: cs.getPropertyValue('--tw-ring-color').trim() };
        d.remove();
        return r;
      };
      // 투명도 변형은 요소를 심어서 못 잰다 — Tailwind 는 **실제로 쓰인 클래스만**
      // 번들에 넣으므로 ring-4 같은 걸 새로 붙이면 규칙 자체가 없다(빈 값).
      // 번들 CSS 에서 규칙을 직접 찾아야 한다.
      let alphaRule = '';
      const walk = (rs) => { for (const r of rs) {
        if (r.styleSheet) { try { walk(r.styleSheet.cssRules); } catch {} }
        if (r.selectorText && r.selectorText.includes('ring-blue-500')) {
          const v = r.style.getPropertyValue('--tw-ring-color');
          if (v && !alphaRule) alphaRule = v;
        }
        if (r.cssRules && r.cssRules.length) walk(r.cssRules);
      }};
      for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }

      return {
        util: mk('bg-blue-500').bg,
        token: mk(null, 'background: var(--blue500)').bg,
        alpha: alphaRule || '(규칙 없음)',
        // 범위 확인 — 600 은 Tailwind 기본이어야 한다
        blue600: mk('bg-blue-600').bg,
      };
    });
    const status = resp?.status() ?? 0;
    const OURS = 'rgb(49, 130, 246)';
    results.push({
      label: '브랜드 파랑 · 유틸=토큰',
      status,
      ok: status === 200 && got.util === OURS && got.token === OURS,
      got: { util: got.util, token: got.token },
      want: `둘 다 ${OURS}`,
    });
    results.push({
      label: '브랜드 파랑 · 투명도 변형',
      status,
      // color-mix 안에 우리 hex 가 들어가야 한다
      // #3182f633 (hex+알파) 또는 color-mix(... var(--color-blue-500) ...) 둘 다 정답이다
      ok: status === 200 && (/#3182f6/i.test(got.alpha) || /--color-blue-500/.test(got.alpha)),
      got: { ring: got.alpha },
      want: '#3182f6 기준 알파 또는 --color-blue-500 참조',
    });
    results.push({
      label: '브랜드 파랑 · 범위(600 불변)',
      status,
      // 600 이 우리 값으로 바뀌었다면 범위가 새어 나간 것이다
      ok: status === 200 && got.blue600 !== OURS,
      got: { blue600: got.blue600 },
      want: `${OURS} 가 아닐 것`,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(
    `${r.ok ? '  ✓ ' : '  ★ '}${r.label.padEnd(24)} HTTP ${r.status}  ${JSON.stringify(r.got)}` +
      (r.ok ? '' : `\n      기대: ${r.want}`),
  );
}
console.log(`\n합계: ${results.length - failed}/${results.length} 통과 · 캡처: ${OUT}`);
if (failed) process.exit(1);
