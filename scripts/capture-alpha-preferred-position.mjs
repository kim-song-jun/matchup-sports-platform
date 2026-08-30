/**
 * [D14 · #853·#854] alpha 3폭 갤러리 + **종목별로 다르게 그려지는지** 검증.
 *
 * 이 기능의 핵심 주장이 "종목마다 다르게 보인다"라서, 스크린샷만으로는 부족하고
 * **화면에서 읽은 값으로** 확인한다:
 *
 * | 종목 | 기대 |
 * |---|---|
 * | 풋살 | **대형 좌표**로 배치 — 세로 위치가 균등 띠와 어긋난다 |
 * | 축구 | **가로 띠** — 세로가 자리 수로 균등 분할된다 |
 * | 러닝·수영 | 섹션 **자체가 없다**(빈 코트가 아니라 아무것도 없음) |
 *
 * 마지막이 중요하다 — 빈 코트를 보여주는 것과 섹션이 없는 것은 스크린샷으로는 비슷해
 * 보이지만 전자는 "고장난 것처럼" 보인다.
 *
 * **종목별로 따로 센다.** 여러 종목을 켜 놓고 문서 전체에서 세면 풋살의 벌어진 x 가
 * 축구 몫으로 합산돼 "축구도 3개"처럼 보인다 — 종목별 판정이 통째로 무의미해진다.
 * 스코프는 안내문("<종목>에서 주로 서는 자리를 눌러 주세요")을 가진 블록이다.
 *
 * **#854 의 핵심 판정은 "저장하지 않고 종목을 고른 직후에 뜨는가"**다. 예전에는 선택지를
 * 저장된 프로필에서 읽어서, 아직 저장 안 한 종목엔 목록이 없어 UI 가 아예 안 떴다.
 * 그래서 이 스크립트는 **칩만 켜고 저장 버튼을 누르지 않는다.**
 *
 * 캡처 위생: 페이지마다 **httpStatus 확인**(alpha 는 과한 캡처에 1분간 전면 403 을 걸고
 * 403 페이지도 PNG 로는 멀쩡해 보인다). 뷰포트는 **실제 기기 높이** + `fullPage`.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = '.screenshots/d14-preferred-position';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];
const PATH = '/my/settings/sports';

// 대형이 있는 종목 둘과 없는 종목 둘을 함께 켠다 — "없는 쪽은 섹션이 안 생긴다"까지가
// 이 기능의 계약이라, 켜 보지 않으면 증명이 안 된다.
const SPORTS = [
  { name: '풋살', expect: 'formation' },
  { name: '축구', expect: 'stripes' },
  { name: '러닝', expect: 'none' },
  { name: '수영', expect: 'none' },
];

async function login() {
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  if (!email || !password) throw new Error('ALPHA_EMAIL / ALPHA_PASSWORD 가 필요합니다');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

/**
 * 종목 하나의 자리 버튼만 읽는다.
 *
 * 스코프를 안내문으로 잡는 이유: 코트 div 에는 종목을 알려주는 표시가 없고, 안내문만이
 * "이 블록이 어느 종목인지"를 담고 있다. 안내문의 부모가 곧 그 종목의 picker 다.
 */
const READ_ONE = (sportName) => `(() => {
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const intro = [...document.querySelectorAll('p')].find(
    (p) => seen(p) && (p.textContent || '').startsWith(${JSON.stringify(sportName)} + '에서 주로 서는 자리'),
  );
  if (!intro) return { present: false, positionButtons: 0, distinctXCount: 0, xs: [], ys: [], labels: [] };
  const picker = intro.parentElement;
  // 코트 안의 버튼만 — 자리 버튼은 aria-pressed 를 갖는데, 종목 선택 칩도 같은 속성을
  // 쓴다. 스코프 없이 세면 칩이 섞여 들어온다(첫 측정이 정확히 그렇게 틀렸다).
  const court = picker.querySelector('svg[viewBox="0 0 100 100"]')?.closest('div');
  const buttons = [...(court ?? picker).querySelectorAll('button[aria-pressed]')].filter(seen);
  const box = (court ?? picker).getBoundingClientRect();
  const xs = buttons.map((b) => Math.round(b.getBoundingClientRect().x));
  // 세로도 잰다 -- 가로가 전부 중앙이어도 대형이 살아 있으면 y 는 프리셋 값을 따른다.
  // 코트 높이 대비 백분율로 환산해야 폭이 달라도 비교가 된다.
  const ys = buttons.map((b) => {
    const r = b.getBoundingClientRect();
    return Math.round(((r.y + r.height / 2 - box.y) / box.height) * 100);
  });
  return {
    present: true,
    positionButtons: buttons.length,
    // **눈대중이 아니라 숫자로 판정한다.** '벌어져 보인다'는 스크린샷으로는 못 가른다.
    distinctXCount: [...new Set(xs)].length,
    xs,
    ys,
    labels: buttons.map((b) => (b.textContent || '').trim()),
  };
})()`;

/**
 * **x 로 판정하지 않는다 — 이 설계에서는 x 가 항상 중앙이다.**
 *
 * 처음엔 "풋살은 서로 다른 x 가 3개 이상"으로 쟀는데 전 폭에서 x 가 1종만 나왔다.
 * 원인은 화면이 아니라 판정식이었다: `averageSlotPositions` 는 **같은 자리 코드의 슬롯을
 * 평균**해 하나로 합치는데(ALA 버튼이 좌우 둘이면 "둘 중 뭘 고르라는 거지?"가 되므로),
 * 풋살 첫 대형이 좌우대칭(ALA x=20·80)이라 그 평균이 **정확히 50** 이 된다. 나머지
 * 자리도 원래 x=50 이다. 즉 대형이 제대로 적용돼도 x 는 전부 중앙일 수밖에 없다.
 *
 * 실제 계약은 "대형이 있으면 **프리셋 좌표**를 쓴다"이고, 그게 살아 있는지는 **y** 에
 * 남는다. 띠는 자리 수로 균등 분할한 값 `(i+0.5)/n*100` 이므로, 그것과 **어긋나는지**를
 * 본다 — 좌표를 하드코딩하지 않고 띠 공식과의 차이로 판정하므로 프리셋이 바뀌어도 따라간다.
 */
function verdict(expect, r) {
  if (expect === 'none') return r.present ? '❌ 섹션이 생겼다' : '✅ 섹션 없음';
  if (!r.present) return '❌ 섹션이 안 뜬다';
  const n = r.ys.length;
  const evenGap = Math.max(...r.ys.map((y, i) => Math.abs(y - ((i + 0.5) / n) * 100)));
  if (expect === 'formation') {
    return evenGap > 2 ? `✅ 대형 좌표(띠와 최대 ${evenGap.toFixed(1)}%p 차이)` : `❌ 띠와 구분 안 됨(${evenGap.toFixed(1)}%p)`;
  }
  return evenGap <= 2 ? '✅ 균등 띠' : `❌ 띠가 아님(${evenGap.toFixed(1)}%p 어긋남)`;
}

async function main() {
  const session = await login();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const rows = [];

  for (const { key, width, height } of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height },
      storageState: {
        cookies: [
          { name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' },
        ],
        origins: [],
      },
    });
    const page = await context.newPage();
    const res = await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = res?.status() ?? 0;
    if (status === 403) throw new Error('alpha 403 (rate limit) — 1분 후 재시도');
    if (status >= 400) throw new Error(`${PATH} HTTP ${status}`);
    await page.waitForTimeout(5000);

    // **종목을 먼저 골라야 포지션 UI 가 뜬다.** 저장은 하지 않는다 — 저장 전에 뜨는지가
    // 이 PR 의 판정이다.
    const missing = [];
    for (const { name } of SPORTS) {
      const chip = page.getByRole('button', { name, exact: true }).first();
      if ((await chip.count()) === 0) { missing.push(name); continue; }
      if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(2500);

    // **측정을 먼저 한다.** 아래에서 캡처를 위해 스크롤 컨테이너를 푸는데, 그건 레이아웃을
    // 바꾸므로 그 뒤에 잰 좌표는 실제 화면의 값이 아니다.
    const measured = [];
    for (const { name, expect } of SPORTS) {
      if (missing.includes(name)) { measured.push({ name, missing: true }); continue; }
      measured.push({ name, expect, r: await page.evaluate(READ_ONE(name)) });
    }

    // **이 앱은 window 로 스크롤하지 않는다** -- body/.tm-app-frame 이 overflow:hidden 이고
    // main.tm-scroll-area 가 진짜 스크롤러다. 그래서 `fullPage: true` 는 document 높이(=뷰포트)
    // 만큼만 찍고 **아래를 통째로 잘라낸다** -- 실제로 첫 캡처가 코트 중간에서 잘렸다.
    // 캡처 직전에만 스크롤을 document 로 되돌려 전체가 담기게 한다.
    await page.addStyleTag({
      content: `html, body, .tm-app-frame { overflow: visible !important; height: auto !important; }
                .tm-scroll-area { overflow: visible !important; height: auto !important; max-height: none !important; }
`,
    });
    // 하단 고정 저장 바는 뷰포트 기준이라, 문서를 늘려 찍으면 **페이지 중간에 박혀**
    // 자리 버튼을 가린다(실제 화면에는 없는 겹침이다). 클래스명을 추측하지 않고
    // **computed position 이 fixed 인 것**을 전부 흐름 안으로 되돌린다 -- 셀렉터를
    // 맞히려던 첫 시도는 빗나갔고, 스크린샷을 열어 보고서야 알았다.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        if (getComputedStyle(el).position !== 'fixed') continue;
        el.style.setProperty('position', 'static', 'important');
        // fixed 일 때 쓰던 오프셋·변형이 남으면 흐름 안에서 폭이 깨진다(저장 바가
        // 좌측으로 밀려 잘렸다). 함께 초기화한다.
        for (const prop of ['left', 'right', 'top', 'bottom', 'transform', 'width']) {
          el.style.setProperty(prop, prop === 'width' ? '100%' : 'auto', 'important');
        }
      }
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/sports-settings--${key}.png`, fullPage: true });
    const shotHeight = await page.evaluate('document.documentElement.scrollHeight');

    for (const { name, expect, r, missing: isMissing } of measured) {
      if (isMissing) { rows.push({ 폭: key, 종목: name, 판정: '⚠️ 칩 없음(마스터 미등록)' }); continue; }
      rows.push({
        폭: key,
        종목: name,
        HTTP: status,
        자리수: r.positionButtons,
        서로다른x: r.distinctXCount,
        x값: r.xs.join(','),
        'y%': r.ys.join(','),
        판정: verdict(expect, r),
        예시: r.labels.slice(0, 4).join(' / '),
      });
    }
    console.log(`${key}: HTTP ${status} · 캡처 높이 ${shotHeight}px`);
    await context.close();
  }
  await browser.close();

  console.log('\n=== 화면에서 읽은 값 (종목별) ===');
  console.table(rows);
  const failed = rows.filter((r) => String(r.판정).startsWith('❌'));
  console.log(`\n캡처: ${OUT}/`);
  console.log(failed.length === 0 ? '전 폭·전 종목 기대와 일치' : `기대 불일치 ${failed.length}건`);
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
