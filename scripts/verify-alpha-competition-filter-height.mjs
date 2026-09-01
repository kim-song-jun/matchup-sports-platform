/**
 * [필터 높이] 대회 목록의 **필터 영역이 지금보다 커지지 않았는가**를 3폭에서 잰다.
 *
 * 사용자가 B안을 고르며 못박은 조건이다 — *"세로 높이를 지금보다 늘리지 않는 게
 * 이 안의 핵심"*. 그래서 이 하네스의 판정은 **하나**다: 필터 영역 ≤ 기준선.
 *
 * ## 왜 요소 높이를 더하지 않고 **좌표 차**로 재나
 * CSS 만 읽어서는 실제 렌더 높이가 안 나온다(마진·갭·래핑이 안 보인다). 그리고 요소별
 * 높이를 더하면 **마진이 겹치는 만큼 실제보다 크게** 나온다. 그래서 *"섹션 제목이 시작하는
 * y"* 와 *"첫 카드가 시작하는 y"* 의 **차이**로 잰다 — 사용자가 실제로 보는 것이 그 거리다.
 *
 * ## 기준선은 측정으로 정한다, 상수로 박지 않는다
 * ```
 * 2026-09-01 실측 — **164px (3폭 모두 동일)**
 * ```
 * ⚠️ 처음엔 요소 높이를 더해 **148** 이라 보고했다(제목 28 + 유형 52 + 종목칩 48). 그건
 * **요소 사이 간격이 빠진 값**이다 — 사용자가 실제로 보는 거리는 제목 시작부터 첫 카드까지의
 * **좌표 차**이고 그게 164 다. 높이를 더하는 방식은 마진·갭을 못 세므로 기준선으로 쓸 수 없다.
 * 이 값을 그대로 상수로 두면 **폭마다 다른 값**을 하나로 판정하게 된다. 그래서 폭별 기준선을
 * 인자로 받고, 안 주면 아래 실측값을 쓴다. 기준선을 갱신할 땐 **왜 늘었는지**를 함께 적어라.
 *
 * ## 이 하네스가 덮지 않는 것
 * ```
 * 시트 동작   열림·포커스 트랩·ESC 는 유닛/E2E 의 몫이다
 * 필터 결과   무엇이 걸러지는지는 verify-alpha-draft-status-filter.mjs 가 본다
 * 미관        "못생겼나"는 사람이 본다 — 여기서는 높이만 잰다
 * ```
 *
 * 사용:
 *   node scripts/verify-alpha-competition-filter-height.mjs
 *   BASELINE_390=164 BASELINE_768=... node scripts/...
 */
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844, baseline: Number(process.env.BASELINE_390 ?? 164) },
  { key: 'tablet', width: 768, height: 1024, baseline: Number(process.env.BASELINE_768 ?? 164) },
  { key: 'desktop', width: 1440, height: 900, baseline: Number(process.env.BASELINE_1440 ?? 164) },
];
const SETTLE_MS = 4_000;

async function servingCommit() {
  const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  return res.headers.get('x-teameet-commit') ?? '(헤더 없음)';
}

/**
 * 대회 탭에서 `?status=draft` 로 들어왔을 때 **요약 줄에 '준비 중' 이 남는가**.
 *
 * 칩(입구)만 막고 URL(뒷문)을 안 막으면 *"요약엔 준비 중이라 쓰여 있는데 목록은 0건이고
 * 해제할 칩도 없는"* 막다른 상태가 된다. **데이터는 안 새므로 API 로는 안 잡힌다** — 화면
 * 상태라 렌더로만 확인된다.
 */
const MEASURE_SUMMARY_LEAK = () => {
  const summary = document.querySelector('.tm-competition-filter-summary');
  if (summary === null) return { err: '요약 줄을 못 찾았다' };
  const text = (summary.textContent || '').trim();
  return { summaryText: text, leaks: /준비 중/.test(text) };
};

/** 브라우저 안에서: 섹션 제목 시작 y ~ 첫 카드 시작 y 의 거리. */
const MEASURE = () => {
  const title = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === '대회 목록',
  );
  // 첫 목록 카드 — 프로모 배너가 아니라 **목록 영역 안의** 카드여야 한다.
  const cards = [...document.querySelectorAll('a[href^="/tournaments/"]')].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.height > 40 && title !== undefined && r.top > title.getBoundingClientRect().top;
  });
  if (title === undefined) return { err: '섹션 제목을 못 찾았다' };
  if (cards.length === 0) return { err: '목록 카드를 못 찾았다' };
  const t = title.getBoundingClientRect().top;
  const c = cards[0].getBoundingClientRect().top;
  const seg = document.querySelector('[aria-label="대회 유형"]');
  const summary = document.querySelector('.tm-competition-filter-summary, .tm-list-filter-button');
  const chipRow = document.querySelector('.tm-sport-chip-row, [aria-label="종목 필터"]');
  return {
    filterHeight: Math.round(c - t),
    hasSegment: seg !== null,
    hasSummary: summary !== null,
    hasChipRow: chipRow !== null,
  };
};

async function main() {
  const before = await servingCommit();
  console.log(`서빙(전)  ${before}\n`);

  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height } });
      const page = await ctx.newPage();
      try {
        const res = await page.goto(`${BASE}/tournaments`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const status = res?.status() ?? 0;
        if (status >= 400) {
          rows.push({ 폭: w.key, HTTP: status, 필터높이: '-', 기준선: w.baseline, 구성: '-', 판정: status === 403 ? '❌ 403 rate limit (화면 결함 아님)' : `❌ HTTP ${status}` });
          continue;
        }
        await page.waitForTimeout(SETTLE_MS);
        const m = await page.evaluate(MEASURE);
        if (m.err) {
          // **하네스 실패와 화면 결함을 섞지 않는다** — 못 재고서 화면에 대해 말하지 않는다.
          rows.push({ 폭: w.key, HTTP: status, 필터높이: '-', 기준선: w.baseline, 구성: '-', 판정: `⚠️ ${m.err}` });
          continue;
        }
        const parts = [m.hasSegment ? '유형' : null, m.hasSummary ? '요약' : null, m.hasChipRow ? '종목칩' : null].filter(Boolean).join('+');
        rows.push({
          폭: w.key,
          HTTP: status,
          필터높이: m.filterHeight,
          기준선: w.baseline,
          구성: parts || '(없음)',
          판정: m.filterHeight <= w.baseline ? '✅' : `❌ ${m.filterHeight - w.baseline}px 늘었다`,
        });
      } finally {
        await ctx.close();
      }
      await new Promise((r) => setTimeout(r, 4_000)); // 403 회피 간격
    }
  } finally {
    /* 요약 누수 측정에서 계속 쓴다 — 아래에서 닫는다 */
  }
  const browser2 = browser;

  // ── 요약 줄 누수: 대회 탭 + ?status=draft (모바일 한 폭이면 충분하다 — 폭과 무관한 성질이다)
  {
    const ctx = await browser2.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    try {
      const res = await page.goto(`${BASE}/tournaments?kind=tournament&status=draft`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const status = res?.status() ?? 0;
      if (status >= 400) {
        rows.push({ 폭: '요약누수', HTTP: status, 필터높이: '-', 기준선: '-', 구성: '-', 판정: `⚠️ HTTP ${status} — 못 쟀다` });
      } else {
        await page.waitForTimeout(SETTLE_MS);
        const r = await page.evaluate(MEASURE_SUMMARY_LEAK);
        rows.push({
          폭: '요약누수',
          HTTP: status,
          필터높이: '-',
          기준선: "'준비 중' 없어야",
          구성: r.err ? '-' : `"${(r.summaryText ?? '').slice(0, 20)}"`,
          판정: r.err ? `⚠️ ${r.err}` : r.leaks ? "❌ 대회 탭 요약에 '준비 중' 이 남는다" : '✅',
        });
      }
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  console.table(rows);
  const after = await servingCommit();
  console.log(`서빙(후)  ${after}`);
  const headerMissing = before === '(헤더 없음)' || after === '(헤더 없음)';
  if (headerMissing) console.log('⚠️ 서빙 커밋 헤더를 못 읽었다 — 배포 창인지 rate limit 인지 못 가른다.');
  else if (before !== after) console.log('⚠️ 측정 도중 서빙본이 바뀌었다 — 버리고 다시 돌려라.');

  const harness = rows.filter((r) => String(r.판정).startsWith('⚠️')).length;
  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  if (harness > 0) {
    console.log(`⚠️ 하네스 실패 ${harness}건 — 화면에 대해 판정하지 마라.`);
    process.exitCode = 2;
  } else if (failed > 0 || headerMissing || before !== after) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 2;
});
