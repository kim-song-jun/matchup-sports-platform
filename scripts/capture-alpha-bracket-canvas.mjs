/**
 * [PR-6] 어드민 대진 화면(대회 /bracket · 정규 리그 상세)을 폭별로 찍고 모바일/태블릿/데스크톱 분기를 값으로 읽는다.
 *
 * - 768 미만: 라운드 탭 + 칸 목록 + "큰 화면에서 편집해요" 안내, 구조 편집 버튼 0개 (스펙 D8)
 * - 768~1023: 편집 캔버스 + 참가팀 트레이가 접힌 한 줄(펼치기 토글, aria-expanded=false). 칸 패널은 시트로 뜬다
 * - 1024 이상: 편집 캔버스 + 펼친 트레이(토글 없음) + 옆 패널
 * 칸 패널 시트는 칸을 눌러야 열려서 읽기 전용으로는 열지 못한다 — 트레이 접힘 상태를 768~1023 판정 신호로 쓴다.
 * 767·1023 은 경계 확인용(갤러리에는 올리지 않는다).
 *
 * 전제: TOURNAMENT_ID·LEAGUE_ID 는 대진이 이미 있는 것이어야 한다(빈 대진은 모바일에서 빈 상태 화면이라 탭이 없다).
 * 세션은 쓰기 권한이 있는 플랫폼 어드민(owner·ops)이어야 한다(안내 문구는 canWrite 일 때만 나온다).
 *
 * ## 읽기만 한다
 * goto · evaluate(읽기) · screenshot 만 쓴다. 입력·제출·mutation 없음 — `alpha-probe-readonly.contract.spec.ts` 가 게이트로 지킨다.
 * alpha 는 과한 캡처에 403 을 건다 — 폭 5 × 화면 2 = 10장을 간격을 두고 찍는다.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? 'docs/visual-qa/admin-bracket-canvas';
const TOURNAMENT_ID = process.env.TOURNAMENT_ID;
const LEAGUE_ID = process.env.LEAGUE_ID;

/** mode: mobile(<768) · tablet(768~1023) · desktop(>=1024) */
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844, mode: 'mobile' },
  { key: 'edge767', width: 767, height: 900, mode: 'mobile' },
  { key: 'tablet', width: 768, height: 1024, mode: 'tablet' },
  { key: 'edge1023', width: 1023, height: 900, mode: 'tablet' },
  { key: 'desktop', width: 1440, height: 900, mode: 'desktop' },
];

const TARGETS = [
  TOURNAMENT_ID && { key: 'tournament', path: `/admin/tournaments/${TOURNAMENT_ID}/bracket`, hasToolbar: true },
  LEAGUE_ID && { key: 'league', path: `/admin/league-matches/${LEAGUE_ID}`, hasToolbar: false },
].filter(Boolean);

async function login() {
  const preset = process.env.ALPHA_SESSION_TOKEN;
  if (preset) return preset;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

/** 보이는 것만 센다 — 숨김 처리된 어드민 셸 노드가 섞이지 않게 한다. */
const READ = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const vis = (sel) => [...document.querySelectorAll(sel)].filter(seen);
  const text = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();

  const roundNav =
    vis('[role="tablist"][aria-label="라운드"]').length +
    vis('label').filter((el) => text(el) === '라운드').length;
  const notice = vis('[role="status"], [role="alert"]').filter((el) => text(el).includes('큰 화면에서 편집해요')).length;
  const structureButtons = vis('button').filter((el) => /템플릿으로 시작|경기 추가|무작위 채우기|대진표 공개/.test(text(el))).length;
  const trayToggles = vis('button[aria-expanded][aria-controls]').filter((el) => /^(펼치기|접기)$/.test(text(el)));
  const trayToggle = trayToggles.length;
  const trayCollapsed = trayToggles.filter((el) => el.getAttribute('aria-expanded') === 'false').length;
  const roots = [document.documentElement, document.querySelector('.tm-scroll-area')].filter(Boolean);
  const overflowX = roots.some((el) => el.scrollWidth - el.clientWidth > 1);
  const smallTargets = vis('main button, main a, main select').filter((el) => {
    const r = el.getBoundingClientRect();
    return Math.min(r.width, r.height) < 44;
  }).length;
  return { roundNav, notice, structureButtons, trayToggle, trayCollapsed, overflowX, smallTargets };
})()`;

function judge(width, target, r) {
  const problems = [];
  if (width.mode === 'mobile') {
    if (r.roundNav < 1) problems.push('라운드 탭/셀렉트가 없음');
    if (r.notice < 1) problems.push('큰 화면 안내가 없음');
    if (r.structureButtons !== 0) problems.push(`구조 편집 버튼 ${r.structureButtons}개 노출`);
  } else {
    if (r.roundNav !== 0) problems.push('큰 화면인데 모바일 라운드 탭이 보임');
    if (r.notice !== 0) problems.push('큰 화면인데 안내 문구가 보임');
    if (target.hasToolbar && r.structureButtons < 1) problems.push('구조 편집 툴바가 없음');
    if (width.mode === 'tablet') {
      if (r.trayToggle < 1) problems.push('태블릿인데 참가팀 트레이 접기 토글이 없음');
      else if (r.trayCollapsed < 1) problems.push('태블릿인데 참가팀 트레이가 기본 펼침');
    } else if (r.trayToggle !== 0) {
      problems.push('데스크톱인데 트레이 접기 토글이 보임');
    }
  }
  if (r.overflowX) problems.push('가로 넘침');
  return problems;
}

async function main() {
  if (TARGETS.length === 0) throw new Error('TOURNAMENT_ID 또는 LEAGUE_ID 가 필요해요');
  const session = await login();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  let failed = false;

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: width.width, height: width.height },
      storageState: {
        cookies: [{ name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }],
        origins: [],
      },
    });
    const page = await context.newPage();
    try {
      for (const target of TARGETS) {
        const res = await page.goto(`${BASE}${target.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const status = res?.status() ?? 0;
        if (status >= 400) {
          failed = true;
          rows.push({ 화면: target.key, 폭: width.key, HTTP: status, 판정: status === 403 ? '403 rate limit — 판정 불가, 잠시 뒤 다시' : `HTTP ${status}` });
          continue;
        }
        await page.waitForTimeout(4000);
        const r = await page.evaluate(READ);
        await page.screenshot({ path: `${OUT}/${target.key}--${width.key}.png` });
        const problems = judge(width, target, r);
        if (problems.length > 0) failed = true;
        rows.push({
          화면: target.key, 폭: width.key, HTTP: status,
          라운드탭: r.roundNav, 안내: r.notice, 구조버튼: r.structureButtons, 트레이토글: r.trayToggle, 트레이접힘: r.trayCollapsed,
          가로넘침: r.overflowX, '44px미만': r.smallTargets,
          판정: problems.length === 0 ? 'OK' : problems.join(' / '),
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } finally {
      await context.close();
    }
  }
  await browser.close();
  console.table(rows);
  console.log(`캡처: ${OUT}/ (갤러리에는 mobile·tablet·desktop 만 올린다 — edge767·edge1023 은 경계 확인용)`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
