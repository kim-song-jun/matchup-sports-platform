/**
 * [빈 상태 채우기] `.tm-list-empty` 계열의 computed 값을 재서 **선택자 변경 전후를 대조**한다.
 *
 * "화면 변화 0"을 주장하는 PR 은 스크린샷 두 장으로 아무것도 증명하지 못한다 — 이 저장소엔
 * 육안 대조로 `#ffffff` vs `#f9fafb` 를 못 잡아 회귀 0건으로 오진한 전례가 있다. 그래서 값을 잰다.
 *
 * ## 쓰는 법
 * ```
 * node scripts/measure-empty-fill.mjs <라벨>
 * ```
 * 배포 **전**에 한 번, **후**에 한 번 돌려 여덟 숫자를 나란히 놓는다. 하나라도 다르면
 * 그 변경이 화면을 건드린 것이다. ⚠️ 대조가 성립하려면 **두 SHA 사이에 그 PR 말고 아무것도
 * 없어야** 한다 — 다른 PR 이 끼면 차이의 원인을 그 PR 로 좁힐 수 없다.
 */
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
/** 결과가 0건이라 빈 상태가 실제로 켜지는 공개 라우트 — 로그인 없이 잴 수 있는 유일한 곳이다. */
const TARGET = `${BASE}/matches?q=zzzqqq없는검색어`;
const WIDTHS = [390, 1440];
const SETTLE_MS = 4_000;
const PACE_MS = 2_500; // alpha 는 과한 연속 요청에 전면 403 을 건다

/** 브라우저 안에서 도는 측정 — 여기서 읽은 값만 표에 들어간다. */
const MEASURE = () => {
  const scroll = document.querySelector('.tm-scroll-area');
  const empty = scroll?.querySelector('.tm-list-empty');
  const fill = scroll?.querySelector('.tm-empty-state-fill');
  if (!scroll || !empty) return { err: '요소 없음' };

  const style = getComputedStyle(empty);
  const rect = empty.getBoundingClientRect();
  const wrapper = [...scroll.children][0];

  return {
    empty_display: style.display,
    empty_dir: style.flexDirection,
    empty_minH: style.minHeight,
    empty_h: Math.round(rect.height),
    wrap_h: Math.round(wrapper.getBoundingClientRect().height),
    fill_h: fill ? Math.round(fill.getBoundingClientRect().height) : null,
    fill_top: fill ? Math.round(fill.getBoundingClientRect().top) : null,
    overflow: Math.max(0, Math.round(scroll.scrollHeight - scroll.clientHeight)),
  };
};

const label = process.argv[2] ?? '(무라벨)';
const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
const sha = res.headers.get('x-teameet-commit')?.slice(0, 9);

const browser = await chromium.launch();
const rows = [];
try {
  for (const width of WIDTHS) {
    // context 를 폭마다 열고 **닫지 않으면** 반복 실행에서 쌓인다. 내가 띄운 것은 내가 닫는다.
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(SETTLE_MS);
      rows.push({ 폭: width, ...(await page.evaluate(MEASURE)) });
    } finally {
      await context.close();
    }
    await new Promise((resolve) => setTimeout(resolve, PACE_MS));
  }
} finally {
  await browser.close();
}

console.log(`\n[${label}] 서빙 ${sha}`);
console.table(rows);

/**
 * ⚠️ **못 잰 실행이 성공으로 끝나면 안 된다.** 이 스크립트는 배포 전/후 대조에 쓰이는데,
 * `err: '요소 없음'` 이 나온 실행이 exit 0 이면 자동화가 **"측정했고 같았다"** 로 읽는다.
 * 서빙 커밋을 못 읽은 실행도 마찬가지다 — 배포 창이었는지 rate limit 이었는지 못 가르므로
 * 그 숫자를 대조에 쓰면 안 된다.
 */
const failed = rows.filter((row) => row.err).length;
const shaMissing = sha === undefined || sha === null;
if (failed > 0 || shaMissing) {
  console.log(`⚠️ 못 잰 항목 ${failed}건${shaMissing ? ' · 서빙 커밋 못 읽음' : ''} — 이 실행의 숫자를 대조에 쓰지 마라.`);
  process.exitCode = 2;
}
