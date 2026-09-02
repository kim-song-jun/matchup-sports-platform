/**
 * [리그 일정·순위 표면] 리그의 `/bracket`·`/schedule` 이 **대회와 같은 모양으로 채워지는가**를
 * alpha 에서 값으로 판정하고 3폭 갤러리를 만든다.
 *
 * ## 왜 스크린샷만으로는 안 되나
 * 이 표면은 **껍데기가 먼저 그려지고 내용만 비는** 방식으로 깨진다. 실제로 2026-09-01 에
 * 리그 `/bracket` 은 제목·탭·레이아웃이 정상이고 본문만 *"경기 정보를 찾을 수 없어요"* 였다.
 * 그리고 고친 뒤에도 **순위 탭만** 빈 채로 남았다(표 머리는 그려지고 행이 0). 두 경우 다
 * 스크린샷은 "멀쩡한 화면" 으로 보인다. 그래서 아래를 **값으로** 읽는다.
 *
 * | 항목 | 기대 | 왜 눈으로 안 보나 |
 * |---|---|---|
 * | 에러 문구 | **없어야** 한다 | 접힌 영역에 있으면 첫 화면 스크린샷엔 안 나온다 |
 * | 순위표 행 수 | **> 0** | 표 껍데기만 있고 행이 0이어도 화면은 멀쩡해 보인다 |
 * | 단계 칩 | `정규 라운드` (리그) / `결선` (대회) | 한 단어 차이 — 육안 대조로는 못 가른다 |
 * | 상위 탭 | `리그 순위` (리그) / `순위 · 대진표` (대회) | 위와 같음 |
 * | `조별 순위` 문구 | 리그엔 **없어야** 한다 | 대회 어휘가 남으면 리그 화면이 조를 가진 것처럼 읽힌다 |
 * | 선수 기록 섹션 | 리그엔 **없어야** 한다 | 리그 참가자는 userId 로 안 이어져 집계가 불가능하다 |
 *
 * ## ⚠️ 이 하네스가 **덮지 않는 것** — 통과를 넓게 읽지 마라
 * ```
 * 로딩·에러 창      정착한 화면만 잰다(SETTLE_MS 뒤 1회). 순위 쿼리가 loading·error 일 때
 *                   빈 배열이 "순위 집계 전이에요" 로 읽히는 종류는 **여기서 안 잡힌다** —
 *                   유닛 테스트의 몫이다.
 * 스크린리더 문구    `aria-label` 은 읽지 않는다. 예: 단발 리그에서 `${groupName} 순위` 가
 *                   "리그 순위 순위표" 로 겹치는 것은 눈에도 안 보이고 PNG 에도 안 남는다.
 * 상호작용 이후      `/bracket` 의 순위 탭 클릭 외에는 아무것도 누르지 않는다.
 * ```
 * **전 항목 ✅ 는 "이 표가 재는 것들이 맞다" 는 뜻이지 "화면이 온전하다" 가 아니다.**
 *
 * ## 대조군이 판정의 절반이다
 * 리그만 보면 *"원래 그런 화면"* 과 *"리그에서 깨진 화면"* 을 못 가른다. 그래서 매 항목을
 * **대회와 나란히** 잰다. 특히 `format='league'` 인 **리그 방식 대회**는 진짜 대회이므로
 * 대회 어휘를 그대로 유지해야 한다 — 리그 분기가 넓게 잡히면 여기가 먼저 깨진다.
 *
 * ## 캡처 위생 (앞선 하네스에서 배운 것)
 * - 이 앱은 `main.tm-scroll-area` 가 진짜 스크롤러라 `fullPage: true` 가 뷰포트 높이까지만
 *   찍는다 → 캡처 **직전에만** 스크롤을 문서로 되돌린다. 측정은 그 전에 끝낸다.
 * - alpha 는 과한 캡처에 1분간 전면 403 을 걸고 **403 페이지도 PNG 로는 멀쩡해 보인다**
 *   → 매 이동마다 httpStatus 를 확인하고 결과 표에 남긴다(던지지 않는다).
 * - 배포 창을 피한다: 실행 전 `x-teameet-commit` 을 찍고, **끝난 뒤에도 다시 찍어** 같은지 본다.
 *   측정 도중 서빙본이 바뀌면 그 실행은 버린다.
 * - 인증이 필요 없다 — 이 표면은 비로그인 공개다. 자격증명을 안 받는다.
 *
 * 사용:
 *   node scripts/capture-alpha-league-schedule-surface.mjs
 *   LEAGUE_ID=<거울 id> TOURNAMENT_ID=<대회 id> OUT_DIR=output/… node scripts/…
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
// 기본 출력은 `output/` 아래다 — `.gitignore` 에 이미 있다. untracked 파일 하나가 이 저장소에서
// 모든 세션의 `--ff-only` 를 막은 전례가 있어, 돌릴 때마다 작업트리를 오염시키지 않는다.
const OUT = process.env.OUT_DIR ?? 'output/league-schedule-surface';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];
const GOTO_TIMEOUT = 60_000;
/**
 * 폭·화면 사이 간격. **1.2초로 18회를 돌렸더니 alpha 가 11번째부터 전면 403 을 걸었다**
 * (2026-09-01). 403 은 화면 결함이 아니지만 **그 실행의 나머지 판정을 통째로 못 쓰게 만든다** —
 * 재측정 비용이 간격보다 훨씬 비싸다.
 */
const PACE_MS = Number(process.env.PACE_MS ?? 4_000);
/** 순위는 클라이언트 조회라 렌더까지 시간이 걸린다. `networkidle` 은 폴링 때문에 안 끝난다. */
const SETTLE_MS = 5_000;

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return (await res.json()).data;
}

/** 서빙 커밋 — 측정 전후로 찍어 배포 창을 배제한다. */
async function servingCommit() {
  const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  return res.headers.get('x-teameet-commit') ?? '(헤더 없음)';
}

/**
 * **리그 표본은 둘이어야 한다 — 티어 있는 것과 없는 것.**
 *
 * 순위표 제목은 `tierLabel ?? '리그 순위'` 라 **두 갈래**인데, 처음 이 하네스는 티어 없는
 * 리그 하나만 봤다. 그래서 *"단발 리그는 안쪽 라벨을 숨긴다"* 규칙이 **티어 리그까지 숨기는**
 * 결함을 못 봤다 — 그 경로를 아예 안 밟았기 때문이다(2026-09-01, Copilot 이 코드로 먼저 잡았다).
 *
 * ⚠️ **개수로 두 갈래를 가를 수 없다**: 리그는 티어가 있든 없든 `groupId` 가 leagueId 하나뿐이다.
 * `'1부'`·`'2부'` 는 같은 리그의 두 조가 아니라 **서로 다른 리그**다. 그래서 `groupName` 의
 * **값**으로 표본을 고른다.
 */
async function pickLeagues(probeLimit = 14) {
  if (process.env.LEAGUE_ID) {
    const ids = process.env.LEAGUE_ID.split(',').map((s) => s.trim()).filter(Boolean);
    return ids.map((id, i) => ({ id, note: `LEAGUE_ID 지정 #${i + 1}` }));
  }
  const d = await getJson('/tournaments?limit=50&kind=league');
  if (d.items.length === 0) throw new Error('통합 목록에 리그가 없다 — 문이 닫혔거나 배포 전이다');

  let plain = null;
  let tiered = null;
  for (const item of d.items.slice(0, probeLimit)) {
    let name;
    try {
      const s = await getJson(`/tournaments/${item.id}/schedule`);
      name = (s.standings ?? [])[0]?.groupName ?? null;
      // **경기가 0건이면 단계 칩이 애초에 없다** — 칩 판정을 하려면 경기가 있는 리그를
      // 골라야 한다. 2026-09-01: 예정 리그가 목록에 올라오면서 경기 0건인 리그가 표본으로
      // 뽑혔고, 칩이 없다는 이유로 6행이 ❌ 가 됐다(회귀가 아니라 **표본이 바뀐 것**).
      if ((s.items ?? []).length === 0) continue;
    } catch {
      continue; // 못 읽는 리그는 표본에서 제외한다 — 판정 대상이 아니다
    }
    if (name === null) continue;
    if (name === '리그 순위' && plain === null) plain = { id: item.id, groupName: name, note: "티어 없음 ('리그 순위')" };
    else if (name !== '리그 순위' && tiered === null) tiered = { id: item.id, groupName: name, note: `티어 '${name}'` };
    if (plain && tiered) break;
  }
  const picked = [plain, tiered].filter(Boolean);
  if (picked.length === 0) throw new Error('표본을 못 골랐다 — 리그 순위 응답을 하나도 못 읽었다');
  if (!tiered) console.log('⚠️ 티어 리그를 못 찾았다 — 티어 분기는 이 실행에서 검증되지 않는다.');
  if (!plain) console.log('⚠️ 티어 없는 리그를 못 찾았다 — 단발 분기는 이 실행에서 검증되지 않는다.');
  return picked;
}

async function pickTargets() {
  const leagues = await pickLeagues();

  // 대조군은 **`format='league'` 인 대회**를 우선한다 — 리그 분기가 넓게 잡히면 여기가 먼저 깨진다.
  const tournament = process.env.TOURNAMENT_ID
    ? { id: process.env.TOURNAMENT_ID, note: 'TOURNAMENT_ID 지정' }
    : await (async () => {
        const d = await getJson('/tournaments?limit=50&kind=tournament');
        const hit = d.items.find((i) => i.format === 'league') ?? d.items[0];
        if (!hit) throw new Error('대조군으로 쓸 대회가 없다');
        return { id: hit.id, note: `format=${hit.format} 대회` };
      })();

  return { leagues, tournament };
}

/**
 * 브라우저 안에서 도는 판정 — 여기서 읽은 값만 표에 들어간다.
 *
 * ⚠️ **API 가 준 순위 제목(`expectGroupName`)과의 비교는 여기서 하지 않는다.** 예전엔 이 함수가
 * 그 값을 인자로 받았는데 본문에서 **한 번도 안 썼다** — 받기만 하고 버리는 인자는 *"여기서
 * 비교하는구나"* 로 읽혀서, 정작 비교가 빠져도 눈치채기 어렵다. 실제 비교는 node 쪽
 * `verdict()` 가 `r.expectGroupName` 과 `r.standingsAriaLabel` 로 한다(아래).
 *
 * 비교 자체의 이유는 그대로다: 화면이 API 이름을 안 쓰면 **같은 리그가 화면마다 다른 이름으로
 * 불린다** — 티어 라벨을 한쪽에만 적용한 결함이 그 모양이었다(2026-09-01: `/schedule` 은 '2부',
 * `/bracket` 은 '리그 순위' 하드코딩). 티어 문자열을 하네스에 박지 않고 **두 화면을 맞대어** 잰다.
 */
const READ = () => {
  const text = (document.body.innerText || '').replace(/\n{2,}/g, '\n').trim();
  const tabs = [...document.querySelectorAll('[role="tab"]')].map((e) => e.textContent.trim());
  // 순위표 행 세기. **빈 상태도 `tbody > tr` 이다** — alpha 실측(2026-09-01): 순위가 없을 때
  // `"순위 집계 전이에요"` 가 `td` **한 칸짜리 행**으로 들어간다. 그래서 "행이 하나라도 있으면
  // 순위가 보인다" 로 세면 **빈 화면을 통과시킨다**(이 하네스가 실제로 한 번 그렇게 통과시켰다).
  // 진짜 순위 행은 `#·팀·전적·승점·득실` 이라 칸이 여럿이다 — **칸 수로 가른다.**
  const standingsRows = [...document.querySelectorAll('table tbody tr')].filter(
    (tr) => tr.querySelectorAll('td').length >= 3,
  ).length;
  return {
    textLength: text.length,
    hasError: /오류가 발생했어요|경기 정보를 찾을 수 없어요/.test(text),
    hasEmptyStandings: /순위 집계 전이에요/.test(text),
    standingsRows,
    tabs,
    hasKnockoutChip: tabs.includes('결선') || /(^|\n)결선(\n|$)/.test(text),
    hasRegularRoundChip: tabs.includes('정규 라운드') || /정규 라운드/.test(text),
    hasGroupStandingsCopy: /조별 순위/.test(text),
    hasPlayerRecords: /득점 순위|도움 순위|선수 기록/.test(text),
    // 경기 카드가 하나라도 그려졌나 — 단계 칩은 경기가 있을 때만 생긴다.
    hasFixtureCards: /주차|조별리그|결선/.test(text) || document.querySelectorAll('[role="tab"]').length > 2,
    // ⚠️ **본문 전체를 검색하면 안 된다.** 리그 이름 자체가 `"… 1시즌 2부"` 라서
    // `text.includes('2부')` 는 순위 제목과 무관하게 참이 된다 — 이 하네스가 실제로 그렇게
    // 아무것도 안 재는 ✅ 를 한 번 냈다(2026-09-01). 순위표를 감싼 **섹션의 `aria-label`**
    // 을 앵커로 삼아 그 자리만 본다.
    standingsAriaLabel: (() => {
      const table = document.querySelector('table');
      if (!table) return null;
      let el = table.parentElement;
      while (el) {
        const label = el.getAttribute('aria-label');
        if (label) return label;
        el = el.parentElement;
      }
      return null;
    })(),
  };
};

/**
 * 판정. **리그와 대회의 기대가 다르다** — 같은 잣대를 대면 대조군이 늘 실패한다.
 * 리그: 에러 없음 · 순위 행 > 0 · '정규 라운드' 있음 · '결선'/'조별 순위'/선수기록 없음
 * 대회: 에러 없음 · '결선' 유지 (리그 어휘가 새지 않았는가)
 */
function verdict(kind, r) {
  const bad = [];
  if (r.hasError) bad.push('에러 문구');
  if (kind === 'league') {
    // 빈 상태 문구 유무와 **무관하게** 행이 0이면 결함이다 — 문구가 없어도 순위는 안 보인다.
    if (r.standingsRows === 0) bad.push('순위 행 0');
    // 경기가 없으면 칩이 없는 게 맞다 — 있을 때만 어휘를 따진다.
    if (r.hasFixtureCards && !r.hasRegularRoundChip) bad.push("'정규 라운드' 없음");
    if (r.hasKnockoutChip) bad.push("'결선' 남음");
    if (r.hasGroupStandingsCopy) bad.push("'조별 순위' 남음");
    if (r.hasPlayerRecords) bad.push('선수 기록 섹션 노출');
    // API 가 '2부' 라고 부르는 리그를 화면이 '리그 순위' 로 부르면 같은 리그가 두 이름을 갖는다.
    // 화면마다 라벨 모양이 달라(`'2부'` vs `'2부 순위'`) 포함 여부로 본다.
    /**
     * ⚠️ **앵커가 없으면 비교가 통째로 건너뛴다 — 그게 "측정 없이 통과" 다.**
     * 예전엔 `expectGroupName && standingsAriaLabel && !includes` 였다. `standingsAriaLabel`
     * 이 null 이면(= 순위 제목 `aria-label` 이 사라지는 회귀) 세 조건 중 하나가 거짓이라
     * **비교 자체가 안 돌고 ✅ 로 지나간다.** 앵커가 사라지는 것이야말로 이 행이 잡아야 할
     * 회귀인데, 그 회귀가 판정을 무력화하는 구조였다. API 가 이름을 줬으면 화면에도 있어야 한다.
     */
    if (r.expectGroupName) {
      if (!r.standingsAriaLabel) {
        bad.push(`순위 제목 앵커(aria-label) 없음 — API 는 '${r.expectGroupName}' 이라 부른다`);
      } else if (!r.standingsAriaLabel.includes(r.expectGroupName)) {
        bad.push(`순위 제목이 API 와 다름(화면 '${r.standingsAriaLabel}' vs API '${r.expectGroupName}')`);
      }
    }
  } else {
    /**
     * ⚠️ **대조군도 양방향으로 본다.** 예전엔 `정규 라운드` 누수만 봤는데, 그러면 대회에서
     * `결선` 이 **사라져도** ✅ 였다 — 파일 머리의 표는 *"단계 칩: 정규 라운드(리그) / 결선(대회)"*
     * 라고 약속해 놓고 판정은 한쪽만 강제하던 자리다. 리그 분기가 넓게 잡히면 대회 어휘가
     * **없어지는** 쪽으로 깨지는데, 그게 정확히 이 하네스가 잡으라고 만든 결함이다.
     * 리그 쪽과 대칭으로 **경기가 있을 때만** 칩을 따진다(경기 0건이면 칩이 없는 게 맞다).
     */
    if (r.hasRegularRoundChip) bad.push("대회에 '정규 라운드' 샘");
    if (r.hasFixtureCards && !r.hasKnockoutChip) bad.push("대회에 '결선' 없음");
  }
  return bad.length === 0 ? '✅' : `❌ ${bad.join(' · ')}`;
}

async function capture(browser, { width, height }, url, file, isBracket, expectGroupName) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
    const status = res?.status() ?? 0;
    // **403 을 던지지 않고 결과로 남긴다.** alpha 는 과한 캡처에 1분간 전면 403 을 걸고,
    // 403 페이지도 PNG 로는 멀쩡해 보인다 — 던지면 앞선 폭의 정상 결과까지 잃는다.
    if (status >= 400 || status === 0) {
      const why =
        status === 403
          ? '403 rate limit — 1분 뒤 이 폭만 다시 (화면 결함 아님)'
          : status === 404
            ? '404 — 배포 전이거나 경로가 닫혀 있다'
            : `HTTP ${status}`;
      return { status, read: null, note: why };
    }
    await page.waitForTimeout(SETTLE_MS);
    let read = await page.evaluate(READ);

    /**
     * **`/bracket` 은 두 번 읽어야 한다.** 이 화면은 상위 탭이 둘(일정 / 순위)이고 기본이
     * 일정이라, 순위표는 **DOM 에 아예 없다.** 처음 이 하네스는 한 번만 읽고 리그
     * `/bracket` 을 ✅ 로 통과시켰다 — 순위 탭이 비어 있다는 걸 그날 실측으로 이미 알고
     * 있었는데도. 행 수가 0 이고 빈 상태 문구도 없으니 판정이 아무것도 안 문 것이다.
     * (게이트가 있는데 안 무는 그 모양이다.)
     *
     * 그래서 **칩·어휘는 기본 탭에서, 순위 행은 순위 탭에서** 읽고 합친다.
     */
    if (isBracket) {
      const clicked = await page.evaluate(() => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((e) =>
          /순위/.test(e.textContent || ''),
        );
        if (!tab) return false;
        tab.click();
        return true;
      });
      if (!clicked) {
        return { status, read: null, note: '순위 탭을 못 찾았다 — 하네스가 판정할 수 없다' };
      }
      await page.waitForTimeout(2_000);
      const standingsView = await page.evaluate(READ);
      read = {
        ...read,
        standingsRows: standingsView.standingsRows,
        hasEmptyStandings: standingsView.hasEmptyStandings,
        // 순위 제목은 **순위 탭에서만** 보인다 — 기본 탭 값으로 판정하면 늘 null 이다.
        standingsAriaLabel: standingsView.standingsAriaLabel,
        // 에러는 어느 탭에서든 뜨면 결함이다.
        hasError: read.hasError || standingsView.hasError,
      };
      // 갤러리는 기본 탭(일정) 화면을 찍는다 — 사용자가 처음 보는 것이 그쪽이다.
      await page.evaluate(() => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((e) =>
          /경기 일정/.test(e.textContent || ''),
        );
        tab?.click();
      });
      await page.waitForTimeout(1_200);
    }

    // 캡처 직전에만 스크롤을 문서로 되돌린다(측정은 위에서 끝났다).
    await page.addStyleTag({
      content: `html, body, .tm-app-frame { overflow: visible !important; height: auto !important; }
                .tm-scroll-area { overflow: visible !important; height: auto !important; max-height: none !important; }`,
    });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        if (getComputedStyle(el).position !== 'fixed') continue;
        el.style.setProperty('position', 'static', 'important');
        for (const prop of ['left', 'right', 'top', 'bottom', 'transform', 'width']) {
          el.style.setProperty(prop, prop === 'width' ? '100%' : 'auto', 'important');
        }
      }
    });
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
    return { status, read: { ...read, expectGroupName }, note: '' };
  } finally {
    await context.close();
  }
}

async function main() {
  const { leagues, tournament } = await pickTargets();
  const before = await servingCommit();
  for (const l of leagues) console.log(`대상 리그 ${l.id} (${l.note})`);
  console.log(`대조군    ${tournament.id} (${tournament.note})`);
  console.log(`서빙(전)  ${before}`);

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];

  const targets = [
    ...leagues.flatMap((l, i) => {
      const tag = leagues.length > 1 ? `${i + 1}` : '';
      return ['bracket', 'schedule'].map((path) => ({
        kind: 'league',
        label: `리그${tag} /${path}`,
        id: l.id,
        path,
        slug: `league${tag}`,
        // API 가 준 순위 제목. 화면이 이 이름을 쓰는지 두 화면 모두에서 본다.
        expectGroupName: l.groupName ?? null,
      }));
    }),
    { kind: 'tournament', label: '대회 /bracket', id: tournament.id, path: 'bracket', slug: 'tournament' },
    { kind: 'tournament', label: '대회 /schedule', id: tournament.id, path: 'schedule', slug: 'tournament' },
  ];

  try {
    for (const t of targets) {
      for (const w of WIDTHS) {
        const file = `${t.slug}-${t.path}-${w.key}.png`;
        const url = `${BASE}/tournaments/${t.id}/${t.path}`;
        // **층 1(하네스 실패)과 층 2(화면 결함)를 섞지 않는다.** 섞으면 빈 스크린샷을
        // "화면이 비었다" 로 읽는 그 함정에 그대로 빠진다.
        let r;
        try {
          r = await capture(browser, w, url, file, t.path === 'bracket', t.expectGroupName ?? null);
        } catch (error) {
          rows.push({ 화면: t.label, 폭: w.key, HTTP: '-', 순위행: '-', 판정: `⚠️ 하네스 실패 — ${error.message}` });
          continue;
        }
        /**
         * ⚠️ **읽지 못한 것을 화면 결함으로 적지 않는다.** 예전엔 `note` 를 무조건 `❌` 로
         * 감쌌는데, 그 note 에는 *"403 rate limit"* 이나 *"하네스가 판정할 수 없다"* 처럼
         * **못 쟀다** 는 사연이 섞여 들어온다. 그러면 실패 집계와 exit code 가 진짜 화면
         * 결함과 같아진다 — 이 하네스가 위에서 선언한 ⚠️/❌ 분리를 스스로 어기는 자리다.
         * 판별은 note 문구가 아니라 **상태코드**로 한다(문구는 바뀌지만 403 은 안 바뀐다).
         */
        const unmeasurable = r.status === 403 || r.status === 429 || r.status === 0;
        rows.push({
          화면: t.label,
          폭: w.key,
          HTTP: r.status,
          순위행: r.read ? r.read.standingsRows : '-',
          판정: r.read ? verdict(t.kind, r.read) : unmeasurable ? `⚠️ ${r.note} — 못 쟀다` : `❌ ${r.note}`,
          파일: r.read ? file : '-',
        });
        await new Promise((resolve) => setTimeout(resolve, PACE_MS)); // 403 회피용 간격
      }
    }
  } finally {
    await browser.close();
  }

  const after = await servingCommit();
  console.table(rows);
  console.log(`서빙(후)  ${after}`);
  // **"못 읽음" 과 "바뀜" 은 다른 사건이다.** rate limit 이 걸리면 이 HEAD 도 막혀 헤더가
  // 안 오는데, 그걸 "배포 창" 으로 보고하면 **원인을 엉뚱한 데로 돌린다**(실제로 한 번 그랬다).
  const headerMissing = after === '(헤더 없음)' || before === '(헤더 없음)';
  const swapped = !headerMissing && before !== after;
  if (headerMissing) {
    console.log('⚠️ 서빙 커밋 헤더를 못 읽었다 — 배포 창인지 rate limit 인지 이 실행으로는 못 가른다.');
  } else if (swapped) {
    console.log('⚠️ 측정 도중 서빙본이 바뀌었다 — 이 실행은 버리고 다시 돌려라(배포 창).');
  }
  writeFileSync(`${OUT}/summary.json`, JSON.stringify({ leagues, tournament, before, after, rows }, null, 2));
  console.log(`\n출력: ${OUT}`);

  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  const harness = rows.filter((r) => String(r.판정).startsWith('⚠️')).length;
  if (harness > 0) {
    console.log(`⚠️ 하네스 실패 ${harness}건 — 화면에 대해 판정하지 마라.`);
    process.exitCode = 2;
  } else if (failed > 0 || swapped || headerMissing) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 2;
});
