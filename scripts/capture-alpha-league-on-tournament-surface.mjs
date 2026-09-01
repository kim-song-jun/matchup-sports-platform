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
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
// **기본 출력은 `output/` 아래다** — `.gitignore` 에 이미 있다(`.screenshots/` 는 없다).
// untracked 파일 하나가 이 저장소에서 **모든 세션의 `--ff-only` 를 막고**, 커밋된 PNG 가
// 변경 파일 300개를 넘겨 **Copilot 리뷰가 거부된** 전례가 있다. 돌릴 때마다 작업트리를
// 오염시키지 않는다. 다른 곳에 쓰려면 `OUT_DIR` 로 명시한다.
const OUT = process.env.OUT_DIR ?? 'output/league-on-tournament-surface';
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

  const standingsRows = [...document.querySelectorAll('.tm-standings-row')].filter(seen).length;

  // **배지는 일정 섹션 안에서만 센다.** 문서 전체에서 세면 페이지 헤더의 대회 상태 배지가
  // 섞인다 — 완료된 대회의 헤더 배지가 '종료'(v1-tournament-status.ts:18)라서, 카드가
  // 완벽히 리그로 그려져도 "대회 어휘가 섞였다" 는 **오탐**이 난다. (같은 함정을 하단 탭
  // 하네스가 nav 를 문서 전체에서 세다가 겪었다 — 폭과 무관하게 10 이 나왔다.)
  const fixturesSection = [...document.querySelectorAll('section[aria-labelledby="fixtures-heading"]')].filter(seen)[0];
  const badges = fixturesSection === undefined
    ? []
    : [...fixturesSection.querySelectorAll('.tm-badge')].filter(seen).map((e) => (e.textContent || '').trim());
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

/**
 * **배포 창을 피한다 — 순서가 중요하다.**
 *
 * 배포 중에는 502 가 뜨고, 그 창에서 찍으면 **멀쩡한 화면을 결함으로 오진한다.** 그리고
 * 서빙 SHA 만 먼저 보면 *배포 중인* SHA 를 찍고 그게 맞다고 판단할 수 있다. 그래서
 * `① 배포 완료 → ② 서빙 SHA → ③ 내 커밋 포함 여부` 순으로 본다.
 *
 * 직전 배포 run 이 `cancelled` 로 남아 있을 수 있다(뒤 머지가 앞 배포를 대체) — 그때 alpha 가
 * 서빙하는 것은 마지막 **성공** 배포의 SHA 다. 그래서 상태를 문자 그대로 확인한다.
 */
async function preflight() {
  // ① **무엇이 서빙되는가로 판정한다 — "최신 run 이 끝났는가" 가 아니다.**
  //
  // 처음엔 `gh run list --limit 1` 의 status 를 게이트로 썼는데, 그건 **최신 run** 을 보므로
  // 내 배포가 끝난 뒤 **남의 머지가 새 배포를 띄우면 영원히 막힌다**(실측: `f7a4dbe69` 가
  // 서빙 중인데 `9229930f3` 이 in_progress 라 통과 못 했다). 게이트의 목적은 "502 창을
  // 피하는 것" 이고, 그건 **실제 응답을 보는 것**이 정확하다.
  const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  if (!head.ok) throw new Error(`landing HTTP ${head.status} — 배포 중이거나 장애다. 기다려라`);
  const serving = head.headers.get('x-teameet-commit');
  const health = await fetch(`${API}/health`);
  const healthy = health.ok && (await health.json())?.data?.checks?.db === true;
  if (!healthy) throw new Error('health 체크 실패 — 배포 중이거나 DB 문제다');
  console.log(`서빙 커밋: ${serving ?? '(헤더 없음)'} · health ok`);

  // ② 내 변경을 보고 있는가
  const expect = process.env.EXPECT_COMMIT;
  if (!expect) {
    console.log('EXPECT_COMMIT 미지정 — 내 머지 포함 여부는 확인하지 않는다');
  } else if (!serving) {
    throw new Error('서빙 커밋 헤더가 없어 EXPECT_COMMIT 대조를 할 수 없다');
  } else {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', expect, serving], { stdio: 'ignore' });
    } catch {
      throw new Error(`서빙 SHA(${serving.slice(0, 9)})가 ${expect.slice(0, 9)} 를 포함하지 않는다 — 옛 빌드다`);
    }
    console.log(`✅ 서빙 SHA 가 ${expect.slice(0, 9)} 를 포함한다`);
  }

  // ③ 진행 중인 배포는 **막지 않고 경고만** 한다 — 캡처 도중 서빙본이 바뀔 수 있어서
  //    끝나고 다시 재서, 바뀌었으면 그 사실을 결과에 남긴다(조용히 섞이는 게 최악이다).
  try {
    const runs = JSON.parse(execFileSync('gh', [
      'run', 'list', '--workflow', 'deploy-alpha.yml', '--branch', 'dev', '--limit', '3',
      '--json', 'headSha,status',
    ], { encoding: 'utf8' }));
    const inflight = runs.filter((r) => r.status !== 'completed');
    if (inflight.length > 0) {
      console.log(`⚠️  배포 ${inflight.length}건 진행 중(${inflight.map((r) => r.headSha.slice(0, 9)).join(', ')}) — 캡처 중 서빙본이 바뀔 수 있다`);
    }
  } catch {
    console.log('(gh 조회 실패 — 진행 중 배포 확인은 건너뛴다)');
  }
  return serving;
}

async function main() {
  const session = await login();
  const league = await pickLeague();
  console.log(`대상 리그: ${league.id} (${league.note})`);

  const servingBefore = await preflight();

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

    // **실패를 두 층으로 나눈다.** 섞어서 "실패" 로 보고하면 화면 문제인지 하네스
    // 문제인지 판정할 수 없다 — 그리고 층 1 인데 화면에 대해 말하면 **빈 스크린샷을
    // "화면이 비었다" 로 읽는** 그 함정에 그대로 빠진다.
    //   층 1  하네스가 못 돌았다(goto 타임아웃 · evaluate 실패 · 셀렉터 없음) → 화면 판정 **불가**
    //   층 2  하네스는 돌았고 판정이 ❌                                      → 화면 결함
    try {

      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const status = res?.status() ?? 0;
      // **403 을 던지지 않고 결과로 남긴다.** alpha 는 과한 캡처에 1분간 전면 403 을 걸고,
      // 403 페이지도 PNG 로는 멀쩡해 보인다 — 던져 버리면 앞선 폭의 정상 결과까지 잃고,
      // 남은 스크린샷을 "화면이 비었다" 로 오진하게 된다. 표에 남겨 무엇이 rate limit 이고
      // 무엇이 진짜 결함인지 갈리게 한다.
      if (status >= 400) {
        const why = status === 403
          ? '403 rate limit — 1분 뒤 이 폭만 다시 돌려라 (화면 결함 아님)'
          : status === 404
            ? '404 — 문이 아직 닫혀 있거나 배포 전이다'
            : `HTTP ${status}`;
        rows.push({ 폭: key, HTTP: status, 순위행: '-', 판정: `❌ ${why}` });
        continue;
      }
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
    } catch (error) {
      // 여기 오는 것은 전부 층 1 이다 — 판정 ❌ 는 예외를 던지지 않고 행으로 남는다.
      rows.push({
        폭: key,
        HTTP: '-',
        순위행: '-',
        판정: `⛔ 층1 하네스 실패 — 화면 판정 불가: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      });
    } finally {
      // close 를 한 곳에 모은다 — 조기 반환마다 적으면 하나를 빠뜨린다.
      await context.close();
    }
    // alpha rate limit — 폭 사이에 간격을 둔다.
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  await browser.close();

  // 캡처 도중 배포가 끝나 서빙본이 바뀌었으면 **결과가 두 빌드에 걸쳐 있다.**
  const servingAfter = (await fetch(`${BASE}/landing`, { method: 'HEAD' })).headers.get('x-teameet-commit');
  if (servingBefore && servingAfter && servingBefore !== servingAfter) {
    console.log(`\n⚠️  캡처 중 서빙본이 바뀌었다: ${servingBefore.slice(0, 9)} → ${servingAfter.slice(0, 9)}`);
    console.log('   결과가 두 빌드에 걸쳐 있다 — 다시 돌려라.');
  }

  console.log('\n=== 화면에서 읽은 값 ===');
  console.table(rows);
  console.log(`\n캡처: ${OUT}/`);

  // **층 1 이 하나라도 있으면 화면에 대해 아무 말도 하지 않는다.** 하네스가 못 돈 폭이
  // 있는데 나머지로 "통과" 라고 적으면, 판정하는 쪽이 그걸 화면 결론으로 읽는다.
  const layer1 = rows.filter((r) => String(r.판정).startsWith('⛔'));
  const layer2 = rows.filter((r) => String(r.판정).includes('❌'));

  if (layer1.length > 0) {
    console.log(`\n⛔ 층1(하네스 실패) ${layer1.length}건 — **화면 판정 불가**`);
    for (const r of layer1) console.log(`   ${r.폭}: ${r.판정}`);
    console.log('   → 화면에 대해 결론 내지 마라. 하네스를 먼저 고치고 다시 돌린다.');
    process.exitCode = 2;
    return;
  }

  if (layer2.length === 0) {
    console.log('\n✅ 전 폭 기대와 일치 — 문이 열렸고 화면이 리그 축 데이터로 채워졌다');
    return;
  }
  console.log(`\n❌ 층2(화면 결함) ${layer2.length}건`);
  for (const r of layer2) console.log(`   ${r.폭}: ${r.판정}`);
  console.log('   → 문은 열렸는데 화면이 안 채워진 상태일 수 있다(부분). 후속 PR 대상.');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
