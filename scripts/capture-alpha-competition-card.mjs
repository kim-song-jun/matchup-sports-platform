/**
 * [리그·대회 카드 통합 #887] alpha 3폭 캡처 + **숫자로** 판정.
 *
 * BEFORE/AFTER 를 같은 스크립트로 찍는다 — `OUT_DIR` 만 바꾼다. 서빙 SHA 를 매번 찍어
 * 파일에 남기므로 "무엇을 찍었는지"가 캡처 자체에 박힌다.
 *
 * | 항목 | 왜 눈으로 안 보나 |
 * |---|---|
 * | 티어 배지 vs 상태 배지 **높이** | 몇 px 차이는 스크린샷 대조로 안 갈린다 → `getBoundingClientRect().height` 로 읽는다 |
 * | 리그 카드의 종목 썸네일 | 있/없음은 보이지만 **크기**(56px)는 안 보인다 |
 * | 대회 카드 불변 | "안 바뀌었다"는 before 없이는 주장일 뿐이다 → 같은 지표를 양쪽에서 읽어 대조 |
 *
 * 캡처 위생(이 저장소 하네스에서 배운 것):
 * - `main.tm-scroll-area` 가 진짜 스크롤러라 `fullPage: true` 가 뷰포트까지만 찍는다.
 * - **측정은 스크롤을 되돌리기 전에** 끝낸다.
 * - `httpStatus` 를 확인한다 — alpha 는 과한 캡처에 1분간 403 을 걸고, 403 페이지도
 *   PNG 로는 멀쩡해 보인다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const OUT = process.env.OUT_DIR ?? '.screenshots/competition-card';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];
const PAGES = [
  { key: 'league-matches', path: '/league-matches' },
  { key: 'tournaments', path: '/tournaments' },
];

/** 카드 안 배지 높이와 썸네일 크기를 **숫자로** 읽는다. 육안 대조로는 못 갈리는 값들이다. */
const READ = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const cards = [...document.querySelectorAll('a.tm-card, li a[aria-label$="상세로 이동"]')].filter(seen);
  const badgesOf = (card) => [...card.querySelectorAll('.tm-badge')].filter(seen).map((b) => ({
    text: (b.textContent ?? '').trim().slice(0, 12),
    height: Math.round(b.getBoundingClientRect().height),
    sm: b.className.includes('tm-badge-sm'),
  }));
  // **배지가 둘 이상인 카드**를 골라야 "높이가 같은가"를 물을 수 있다. 리그는 티어가 없는
  // 카드가 많아서 첫 카드만 보면 배지가 하나뿐이라 비교 자체가 성립하지 않는다.
  const multi = cards.map(badgesOf).find((bs) => bs.length > 1) ?? [];
  // 썸네일은 **data-testid 에 의존하지 않는다** — 그 훅은 이 PR 이 추가한 것이라 before 에는
  // 없다. 그걸로 재면 before 가 항상 null 이 되어 대조가 성립하지 않는다. 대신 카드 안의
  // "56px 정사각 요소"를 찾는다(before/after 양쪽에서 같은 기준).
  const square = cards[0]
    ? [...cards[0].querySelectorAll('div')].filter(seen).map((d) => d.getBoundingClientRect())
        .find((r) => Math.round(r.width) === 56 && Math.round(r.height) === 56) ?? null
    : null;
  return {
    cardCount: cards.length,
    firstCardLabel: cards[0]?.getAttribute('aria-label') ?? null,
    firstCardBadges: cards[0] ? badgesOf(cards[0]) : [],
    multiBadgeCard: multi,
    multiBadgeHeightsEqual: multi.length > 1 ? new Set(multi.map((b) => b.height)).size === 1 : null,
    thumbnail56: square ? { w: Math.round(square.width), h: Math.round(square.height) } : null,
    sportChip: !!cards[0]?.querySelector('[aria-label^="종목:"]'),
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  const servingSha = head.headers.get('x-teameet-commit') ?? 'unknown';
  console.log(`서빙 SHA: ${servingSha.slice(0, 9)}  → ${OUT}`);

  const browser = await chromium.launch();
  const report = { servingSha, out: OUT, pages: {} };
  try {
    for (const page of PAGES) {
      report.pages[page.key] = {};
      for (const w of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height } });
        const p = await ctx.newPage();
        // 이 앱은 목록에서 폴링을 돌 수 있어 networkidle 이 안 끝난다 → domcontentloaded + 대기.
        const res = await p.goto(`${BASE}${page.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await p.waitForTimeout(2500);
        const status = res?.status() ?? 0;
        const landed = new URL(p.url()).pathname;
        const measured = await p.evaluate(READ);
        // 측정을 끝낸 뒤에만 스크롤러를 문서로 되돌린다(그래야 fullPage 가 전체를 찍는다).
        await p.evaluate(`(() => {
          const s = document.querySelector('main.tm-scroll-area');
          if (s) { s.style.overflow = 'visible'; s.style.height = 'auto'; }
          document.body.style.overflow = 'visible';
        })()`);
        const file = `${OUT}/${page.key}-${w.key}.png`;
        await p.screenshot({ path: file, fullPage: true });
        report.pages[page.key][w.key] = { status, landed, ...measured };
        console.log(
          `  ${page.key} ${w.key}  HTTP ${status}  ${landed}  카드 ${measured.cardCount}` +
            `  배지(다중카드) ${JSON.stringify(measured.multiBadgeCard.map((b) => b.height))}` +
            `  동일=${measured.multiBadgeHeightsEqual}  썸네일56=${JSON.stringify(measured.thumbnail56)}` +
            `  종목칩=${measured.sportChip}`,
        );
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\n리포트: ${OUT}/report.json`);
}

await main();
