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

async function pickTargets() {
  const league = process.env.LEAGUE_ID
    ? { id: process.env.LEAGUE_ID, note: 'LEAGUE_ID 지정' }
    : await (async () => {
        const d = await getJson('/tournaments?limit=50&kind=league');
        const hit = d.items.find((i) => i.status === 'in_progress') ?? d.items[0];
        if (!hit) throw new Error('통합 목록에 리그가 없다 — 문이 닫혔거나 배포 전이다');
        return { id: hit.id, note: `공개 목록 첫 ${hit.status} 리그` };
      })();

  // 대조군은 **`format='league'` 인 대회**를 우선한다 — 리그 분기가 넓게 잡히면 여기가 먼저 깨진다.
  const tournament = process.env.TOURNAMENT_ID
    ? { id: process.env.TOURNAMENT_ID, note: 'TOURNAMENT_ID 지정' }
    : await (async () => {
        const d = await getJson('/tournaments?limit=50&kind=tournament');
        const hit = d.items.find((i) => i.format === 'league') ?? d.items[0];
        if (!hit) throw new Error('대조군으로 쓸 대회가 없다');
        return { id: hit.id, note: `format=${hit.format} 대회` };
      })();

  return { league, tournament };
}

/** 브라우저 안에서 도는 판정 — 여기서 읽은 값만 표에 들어간다. */
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
    if (!r.hasRegularRoundChip) bad.push("'정규 라운드' 없음");
    if (r.hasKnockoutChip) bad.push("'결선' 남음");
    if (r.hasGroupStandingsCopy) bad.push("'조별 순위' 남음");
    if (r.hasPlayerRecords) bad.push('선수 기록 섹션 노출');
  } else {
    if (r.hasRegularRoundChip) bad.push("대회에 '정규 라운드' 샘");
  }
  return bad.length === 0 ? '✅' : `❌ ${bad.join(' · ')}`;
}

async function capture(browser, { width, height }, url, file, isBracket) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
    const status = res?.status() ?? 0;
    // **403 을 던지지 않고 결과로 남긴다.** alpha 는 과한 캡처에 1분간 전면 403 을 걸고,
    // 403 페이지도 PNG 로는 멀쩡해 보인다 — 던지면 앞선 폭의 정상 결과까지 잃는다.
    if (status >= 400) {
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
    return { status, read, note: '' };
  } finally {
    await context.close();
  }
}

async function main() {
  const { league, tournament } = await pickTargets();
  const before = await servingCommit();
  console.log(`대상 리그 ${league.id} (${league.note})`);
  console.log(`대조군    ${tournament.id} (${tournament.note})`);
  console.log(`서빙(전)  ${before}`);

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];

  const targets = [
    { kind: 'league', label: '리그 /bracket', id: league.id, path: 'bracket' },
    { kind: 'league', label: '리그 /schedule', id: league.id, path: 'schedule' },
    { kind: 'tournament', label: '대회 /bracket', id: tournament.id, path: 'bracket' },
    { kind: 'tournament', label: '대회 /schedule', id: tournament.id, path: 'schedule' },
  ];

  try {
    for (const t of targets) {
      for (const w of WIDTHS) {
        const file = `${t.kind}-${t.path}-${w.key}.png`;
        const url = `${BASE}/tournaments/${t.id}/${t.path}`;
        // **층 1(하네스 실패)과 층 2(화면 결함)를 섞지 않는다.** 섞으면 빈 스크린샷을
        // "화면이 비었다" 로 읽는 그 함정에 그대로 빠진다.
        let r;
        try {
          r = await capture(browser, w, url, file, t.path === 'bracket');
        } catch (error) {
          rows.push({ 화면: t.label, 폭: w.key, HTTP: '-', 순위행: '-', 판정: `⚠️ 하네스 실패 — ${error.message}` });
          continue;
        }
        rows.push({
          화면: t.label,
          폭: w.key,
          HTTP: r.status,
          순위행: r.read ? r.read.standingsRows : '-',
          판정: r.read ? verdict(t.kind, r.read) : `❌ ${r.note}`,
          파일: r.read ? file : '-',
        });
        await new Promise((resolve) => setTimeout(resolve, 1200)); // 403 회피용 간격
      }
    }
  } finally {
    await browser.close();
  }

  const after = await servingCommit();
  console.table(rows);
  console.log(`서빙(후)  ${after}`);
  if (before !== after) {
    console.log('⚠️ 측정 도중 서빙본이 바뀌었다 — 이 실행은 버리고 다시 돌려라(배포 창).');
  }
  writeFileSync(`${OUT}/summary.json`, JSON.stringify({ league, tournament, before, after, rows }, null, 2));
  console.log(`\n출력: ${OUT}`);

  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  const harness = rows.filter((r) => String(r.판정).startsWith('⚠️')).length;
  if (harness > 0) {
    console.log(`⚠️ 하네스 실패 ${harness}건 — 화면에 대해 판정하지 마라.`);
    process.exitCode = 2;
  } else if (failed > 0 || before !== after) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 2;
});
