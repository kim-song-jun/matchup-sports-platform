/**
 * 전술보드 3폭 갤러리 캡처 (📱390 / 📲768 / 🖥1440).
 *
 * 찍는 것 — 화면 두 개 × 시점 세 개:
 *   1) 팀 상세의 "다가오는 경기" 섹션 (운영진 시점 / 일반 멤버 시점)
 *   2) 전술보드 (운영진 = 편집 가능 / 일반 멤버 = 보기 전용)
 *   3) 남의 팀 보드를 열었을 때의 거부 화면
 *
 * alpha 는 프로덕션 모드라 **헤더 dev 인증이 401** 이다 — login API 로만 쿠키를 받는다.
 * 그리고 프로덕션 빌드는 쿠키가 아니라 `localStorage['teameet.v1.session']` 힌트를 보고
 * 로그인 여부를 판단하는 화면이 있어서 그것도 함께 심는다(쿠키만 심으면 로그아웃처럼 보인다).
 *
 * **alpha 는 과한 캡처에 전면 403 을 1분간 건다.** 그래서 ① 샷 사이에 간격을 두고
 * ② 매 이동마다 응답 status 를 확인해 403 이면 즉시 멈춘다 — 안 보면 403 페이지를
 * 그대로 찍어 놓고 "레이아웃이 깨졌다"고 오진하게 된다.
 *
 * 사용법:
 *   ALPHA_PASSWORD=... \
 *   TACTICS_TEAM_ID=... TACTICS_GAME_ID=... TACTICS_OTHER_TEAM_ID=... \
 *   node scripts/capture-alpha-tactics-board.mjs [outDir]
 *
 * 계정은 환경변수로만 넘긴다 — 이 저장소는 PUBLIC 이라 값을 파일에 적지 않는다.
 *
 * **요소 존재 확인은 개수가 아니라 가시성으로 한다.** 이 앱은 데스크톱/모바일 JSX 를 따로
 * 그리고 CSS(.tm-show-desktop/.tm-hide-desktop)로 한쪽을 숨긴다 — 그래서 숨은 노드가 **항상
 * DOM 에 있다.** `locator.count()`/`querySelectorAll` 로 세면 모바일 뷰포트에서도 데스크톱
 * 노드가 잡혀 "있다"고 오판한다(2026-08-30 에 실제로 그렇게 판정해 모바일 진입점 부재를
 * 놓칠 뻔했다 — 두 세션이 각자 같은 실수를 했다). `waitForSelector` 기본값(visible)처럼
 * 보이는지를 기준으로 판정할 것.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/alpha-tactics-board';
const PASSWORD = process.env.ALPHA_PASSWORD;
const MANAGER_EMAIL = process.env.TACTICS_MANAGER_EMAIL;
const MEMBER_EMAIL = process.env.TACTICS_MEMBER_EMAIL;
const TEAM_ID = process.env.TACTICS_TEAM_ID;
const GAME_ID = process.env.TACTICS_GAME_ID;
const OTHER_TEAM_ID = process.env.TACTICS_OTHER_TEAM_ID;

const missing = Object.entries({
  ALPHA_PASSWORD: PASSWORD,
  TACTICS_MANAGER_EMAIL: MANAGER_EMAIL,
  TACTICS_MEMBER_EMAIL: MEMBER_EMAIL,
  TACTICS_TEAM_ID: TEAM_ID,
  TACTICS_GAME_ID: GAME_ID,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error(`환경변수가 필요해요: ${missing.join(', ')}`);
  process.exit(1);
}

/**
 * 폭 세 개 — 저장소 갤러리 관례(모바일·태블릿·데스크톱).
 *
 * 높이를 크게 잡는 이유: 모바일·태블릿 셸은 **내부 스크롤 컨테이너**를 쓴다(문서가 자라지
 * 않는다). 그래서 `fullPage: true` 를 줘도 뷰포트 높이만큼만 찍히고 아래 섹션이 통째로
 * 빠진다 — 실제로 팀 상세를 390x900 으로 찍었을 때 화면 절반이 잘렸다. 뷰포트를 길게
 * 잡아 한 화면에 담는다(데스크톱은 문서가 자라므로 fullPage 가 그대로 동작한다).
 */
const WIDTHS = [
  { key: 'mobile', width: 390, height: 2600 },
  { key: 'tablet', width: 768, height: 2600 },
  { key: 'desktop', width: 1440, height: 1200 },
];

/** 샷 사이 간격(ms). alpha 레이트리밋에 걸리지 않도록 넉넉히 둔다. */
const SHOT_GAP_MS = 1500;

async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const cookie = raw.map((c) => c ?? '').find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error(`세션 쿠키를 못 받았어요: ${email}`);
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

async function contextFor(browser, token, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.addCookies([
    { name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' },
  ]);
  // 프로덕션 빌드는 이 힌트로 로그인 여부를 판단한다 — 쿠키만으로는 로그아웃처럼 보인다.
  await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
  return context;
}

async function shoot(context, { path, label, name, waitFor }) {
  const page = await context.newPage();
  const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  // 403 을 안 보고 찍으면 레이트리밋 페이지를 화면 결함으로 오진한다.
  if (status === 403) throw new Error(`alpha 레이트리밋(403) — ${path}. 1분 쉬었다 다시 돌리세요.`);
  if (status >= 400) console.warn(`  ! ${label} HTTP ${status}`);
  // 라이브 폴링 화면이 아니라 networkidle 을 안 쓴다(그쪽은 절대 끝나지 않는다).
  //
  // 8초인 이유: 3.5초로 찍었더니 팀 상세의 "다가오는 경기" 섹션이 통째로 빠졌다. 그 섹션은
  // 조회 중에는 스스로 숨으므로(빈 카드를 얹지 않으려는 의도) **아직 안 온 것과 없는 것이
  // 화면상 같아 보인다** — 캡처가 짧으면 멀쩡한 기능이 "안 나온다"로 찍힌다.
  // 브라우저로 직접 확인한 결과 그 요청은 200 이고 섹션도 뜬다(전술보드 링크 10개).
  await page.waitForTimeout(2500);
  // **시간으로 기다리지 않는다.** 팀 상세의 "다가오는 경기" 섹션은 조회 중에 스스로 숨으므로
  // (빈 카드를 얹지 않으려는 의도) **아직 안 온 것과 없는 것이 화면상 같아 보인다** — 고정
  // 대기로 찍으면 멀쩡한 기능이 "안 나온다"로 박제된다. 실제로 3.5초·8초 둘 다 그 섹션이
  // 통째로 빠진 컷을 만들었고, 브라우저로 직접 열어 보고서야 200 응답에 링크 10개가
  // 멀쩡히 있다는 걸 확인했다. 그래서 그 요소가 나타날 때까지 기다린다.
  if (waitFor !== undefined) {
    try {
      await page.waitForSelector(waitFor, { timeout: 20000 });
    } catch {
      console.warn(`  ! ${label}: ${waitFor} 가 20초 안에 안 나타났다 — 그대로 찍는다`);
    }
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}.png  (HTTP ${status})`);
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, SHOT_GAP_MS));
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

const shots = [
  { who: 'manager', email: MANAGER_EMAIL, path: `/teams/${TEAM_ID}`, slug: 'team-detail-manager', label: '팀 상세(운영진)', waitFor: 'a[href*="/tactics/"]' },
  { who: 'manager', email: MANAGER_EMAIL, path: `/teams/${TEAM_ID}/tactics/${GAME_ID}`, slug: 'tactics-manager', label: '전술보드(운영진·편집 가능)' },
  { who: 'member', email: MEMBER_EMAIL, path: `/teams/${TEAM_ID}`, slug: 'team-detail-member', label: '팀 상세(일반 멤버)', waitFor: 'a[href*="/tactics/"]' },
  { who: 'member', email: MEMBER_EMAIL, path: `/teams/${TEAM_ID}/tactics/${GAME_ID}`, slug: 'tactics-member', label: '전술보드(일반 멤버·보기 전용)' },
];
if (OTHER_TEAM_ID) {
  shots.push({
    who: 'manager',
    email: MANAGER_EMAIL,
    path: `/teams/${OTHER_TEAM_ID}/tactics/${GAME_ID}`,
    slug: 'tactics-denied',
    label: '남의 팀 보드(거부)',
  });
}

const tokens = new Map();
for (const { email } of shots) {
  if (!tokens.has(email)) tokens.set(email, await login(email));
}

for (const { width, height, key } of WIDTHS) {
  console.log(`── ${key} ${width}px ──`);
  for (const shot of shots) {
    const context = await contextFor(browser, tokens.get(shot.email), { width, height });
    try {
      await shoot(context, { path: shot.path, label: shot.label, name: `${shot.slug}-${width}`, waitFor: shot.waitFor });
    } finally {
      await context.close();
    }
  }
}

await browser.close();
console.log(`\n완료 → ${OUT}`);
