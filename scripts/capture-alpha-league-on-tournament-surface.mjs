/**
 * [read-swap 문] 정규 리그 시즌이 `/tournaments/:id` 에서 **실제로 채워져 보이는가**를
 * alpha 에서 숫자로 판정하고 3폭 갤러리를 만든다.
 *
 * ## 왜 "200 이 떴다" 로 끝내면 안 되나
 * 문을 여는 것과 화면이 채워지는 것은 **다른 일**이다. 이 PR 이전 상태에서도 게이트만
 * 넓히면 200 은 뜬다 — 그리고 진행 중인 리그 시즌에 *"대회 시작 전에 대진표가 공개돼요"*
 * 가 뜬다. 빈 화면보다 나쁘다(틀린 말을 확신 있게 한다). 그래서 아래를 **값으로** 읽는다.
 *
 * | 항목 | 기대 | 왜 눈으로 안 보나 |
 * |---|---|---|
 * | HTTP | 200 (이전 404) | — |
 * | 순위표 행 수 | **> 0** | 표 껍데기만 있고 행이 0이어도 스크린샷은 멀쩡해 보인다 |
 * | 상태 배지 | **"매칭됨"** 류 리그 어휘 | 대회 카드로 그려지면 "예정"이 뜬다 — 배지 한 단어가 유일한 육안 차이다 |
 * | 대회용 빈 문구 | **없어야** 한다 | "대진표 준비 중"이 남아 있으면 리그 분기를 안 탄 것이다 |
 * | 팀 이름 | fallback 아님 | 순위 lookup 이 실패하면 "홈팀 정보 없음"이 뜨는데 그것도 화면엔 글자로 보인다 |
 *
 * ## 캡처 위생 (앞선 하네스에서 배운 것)
 * - 이 앱은 `main.tm-scroll-area` 가 진짜 스크롤러라 `fullPage: true` 가 뷰포트 높이까지만
 *   찍는다 → 캡처 **직전에만** 스크롤을 문서로 되돌린다. 측정은 그 전에 끝낸다.
 * - alpha 는 과한 캡처에 1분간 전면 403 을 걸고 **403 페이지도 PNG 로는 멀쩡해 보인다**
 *   → 매 이동마다 httpStatus 를 확인하고, 폭 사이에 간격을 둔다.
 * - 배포 창을 피한다: 실행 전 `x-teameet-commit` 이 내 머지를 포함하는지 확인할 것.
 *
 * 사용:
 *   ALPHA_SESSION_TOKEN=... LEAGUE_ID=<거울 행 id> node scripts/capture-alpha-league-on-tournament-surface.mjs
 *   (LEAGUE_ID 를 안 주면 공개 리그 목록에서 첫 active 리그를 고른다)
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? '.screenshots/league-on-tournament-surface';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

async function login() {
  const preset = process.env.ALPHA_SESSION_TOKEN;
  if (preset) return preset;
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  if (!email || !password) throw new Error('ALPHA_SESSION_TOKEN 또는 ALPHA_EMAIL/ALPHA_PASSWORD 가 필요합니다');
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
 * 검증 대상 리그를 고른다. **대진이 있는 리그**를 우선한다 — 대진 0건 리그를 고르면
 * 빈 상태 문구만 확인하고 정작 카드 렌더를 못 본다.
 */
async function pickLeague() {
  if (process.env.LEAGUE_ID) return { id: process.env.LEAGUE_ID, note: 'LEAGUE_ID 지정' };
  const res = await fetch(`${API}/league-matches?limit=20`);
  if (!res.ok) throw new Error(`리그 목록 HTTP ${res.status}`);
  const body = await res.json();
  const items = body?.data?.items ?? [];
  if (items.length === 0) throw new Error('공개 리그가 0건이다 — LEAGUE_ID 를 직접 지정해라');
  // 상세를 찍어 대진 수를 보고 고른다. 목록 응답에는 대진 수가 없다.
  for (const item of items) {
    const id = item.leagueId ?? item.id;
    const detail = await fetch(`${API}/league-matches/${id}`);
    if (!detail.ok) continue;
    const fixtures = (await detail.json())?.data?.fixtures ?? [];
    if (fixtures.length > 0) return { id, note: `대진 ${fixtures.length}건` };
  }
  const first = items[0].leagueId ?? items[0].id;
  return { id: first, note: '대진 0건 — 빈 상태 문구만 확인 가능' };
}

/** **보이는 것만 센다.** 모바일·데스크톱 노드가 DOM 에 둘 다 있고 CSS 로 하나만 표시된다. */
const READ = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const text = (sel) => [...document.querySelectorAll(sel)].filter(seen).map((e) => (e.textContent || '').trim());

  const standingsRows = [...document.querySelectorAll('.tm-standings-row')].filter(seen).length;
  const badges = text('.tm-badge');
  const body = document.body.innerText;

  return {
    standingsRows,
    hasStandingsHeading: body.includes('통합 순위'),
    hasFixturesHeading: body.includes('일정 · 대진'),
    // 리그 어휘 — 대회 카드로 그려지면 이 단어들이 안 나온다.
    leagueBadges: badges.filter((b) => ['매칭됨', '완료', '취소됨', '모집 중', '마감', '기한 만료'].includes(b)),
    // 대회 어휘가 섞이면 카드가 잘못 그려진 것이다.
    tournamentOnlyBadges: badges.filter((b) => b === '예정' || b === '종료'),
    // 대회용 빈 상태 문구가 남아 있으면 리그 분기를 안 탄 것이다.
    hasTournamentPlaceholder: body.includes('대진표 준비 중') || body.includes('대회 시작 전에 대진표가'),
    hasLeagueEmptyCopy: body.includes('아직 등록된 경기가 없어요'),
    // 순위 lookup 이 실패하면 이 fallback 이 화면에 글자로 남는다.
    fallbackNames: (body.match(/홈팀 정보 없음|상대팀 정보 없음/g) ?? []).length,
  };
})()`;

function verdict(r) {
  const out = [];
  out.push(r.hasStandingsHeading ? '✅ 순위 섹션' : '❌ 순위 섹션 없음');
  out.push(r.standingsRows > 0 ? `✅ 순위 ${r.standingsRows}행` : '❌ 순위 0행 (표만 있고 비었다)');
  if (r.hasFixturesHeading && r.leagueBadges.length > 0) {
    out.push(`✅ 리그 카드 (${[...new Set(r.leagueBadges)].join(',')})`);
  } else if (r.hasLeagueEmptyCopy) {
    out.push('✅ 리그용 빈 상태 문구');
  } else {
    out.push('❌ 일정 섹션이 리그로 안 그려짐');
  }
  out.push(r.tournamentOnlyBadges.length === 0 ? '✅ 대회 어휘 없음' : `❌ 대회 배지 ${r.tournamentOnlyBadges.join(',')}`);
  out.push(!r.hasTournamentPlaceholder ? '✅ 대회용 빈 문구 없음' : '❌ "대진표 준비 중" 남아 있다');
  out.push(r.fallbackNames === 0 ? '✅ 팀 이름 정상' : `❌ fallback 이름 ${r.fallbackNames}건`);
  return out.join(' · ');
}

async function main() {
  const session = await login();
  const league = await pickLeague();
  console.log(`대상 리그: ${league.id} (${league.note})`);

  // 배포 창을 피한다 — 서빙 SHA 를 먼저 남긴다(내 머지 포함 여부는 호출자가 대조).
  const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  console.log(`서빙 커밋: ${head.headers.get('x-teameet-commit') ?? '(헤더 없음)'}`);

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  const path = `/tournaments/${league.id}`;

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

    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = res?.status() ?? 0;
    if (status === 403) throw new Error('alpha 403 (rate limit) — 1분 후 재시도');
    if (status >= 400) throw new Error(`${path} HTTP ${status} — 문이 아직 닫혀 있거나 배포 전이다`);
    // 순위는 클라이언트 조회라 렌더까지 시간이 걸린다. networkidle 은 폴링 때문에 안 끝난다.
    await page.waitForTimeout(5000);

    const r = await page.evaluate(READ);
    rows.push({ 폭: key, HTTP: status, 순위행: r.standingsRows, 판정: verdict(r) });

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
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/league-detail--${key}.png`, fullPage: true });
    console.log(`${key}: 캡처 완료`);
    await context.close();
    // alpha rate limit — 폭 사이에 간격을 둔다.
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  await browser.close();

  console.log('\n=== 화면에서 읽은 값 ===');
  console.table(rows);
  const failed = rows.filter((r) => String(r.판정).includes('❌'));
  console.log(`\n캡처: ${OUT}/`);
  console.log(failed.length === 0 ? '전 폭 기대와 일치' : `기대 불일치 ${failed.length}건`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
