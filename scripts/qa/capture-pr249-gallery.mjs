/**
 * PR #249 시각 검증 갤러리 캡처.
 *
 * 대상은 이 PR이 새로 만들거나 바꾼 v1_web 라우트뿐이다. 각 라우트를 모바일 390 / 태블릿 768 /
 * 데스크톱 1440 세 폭으로 찍는다.
 *
 * 인증은 v1 헤더 dev 인증을 쓴다: localStorage 의 `teameet.v1.userId` 를 지우고
 * `teameet.v1.userEmail` 만 두면 `v1-auth.guard.ts` 가 email 로 유저를 resolve 한다.
 *
 * 시드 유저는 재동의 대상이라 모든 페이지가 약관 게이트로 막힌다. 게이트는 관리형 약관 기준선을
 * 보기 때문에 DB 에 동의 행을 직접 넣어도 통과되지 않는다 — "전체 동의" 를 실제로 클릭해야 한다.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3013';
const OUT = process.env.CAPTURE_OUT_DIR ?? 'scripts/qa/pr249-gallery';
/**
 * 팀 101 의 owner 다. 라인업/결과 화면은 그 경기 당사자 팀의 owner·manager 만 볼 수 있어서
 * (403/409 가 정상 동작이다) admin 계정으로는 기능 화면이 아니라 권한 거부 화면만 찍힌다.
 */
const EMAIL = process.env.CAPTURE_USER_EMAIL ?? 'owner@teameet.v1';

const TEAM = '00000000-0000-4000-8000-000000000101';
/** host_team_id 가 위 TEAM 인 완료된 팀 매치. */
const TEAM_MATCH = '00000000-0000-4000-8000-000000000304';
const USER = '974fec07-f3ab-42d6-9450-7ef942d60a7d';

const ROUTES = [
  { slug: 'my-schedule', path: '/my/schedule', title: '내 일정' },
  { slug: 'team-schedules', path: `/teams/${TEAM}/schedules`, title: '팀 일정 목록' },
  { slug: 'team-schedule-new', path: `/teams/${TEAM}/schedules/new`, title: '팀 일정 생성' },
  { slug: 'team-records', path: `/teams/${TEAM}/records`, title: '팀 공식 기록' },
  { slug: 'tm-lineup', path: `/team-matches/${TEAM_MATCH}/lineup`, title: '라인업 편성' },
  { slug: 'tm-result', path: `/team-matches/${TEAM_MATCH}/result`, title: '경기 결과 입력' },
  {
    slug: 'tm-result-approval',
    path: `/team-matches/${TEAM_MATCH}/result/approval`,
    title: '상대 팀 결과 승인',
  },
  { slug: 'user-records', path: `/users/${USER}/records`, title: '선수 공식 기록' },
];

/**
 * 대회 운영 화면. 대회는 admin API(`POST /admin/tournaments`)로 만든다 — 저장소의 대회 시더 둘은
 * 각각 alpha 이미지(`seed-alpha-tournament-qa.ts`)와 GitHub Actions(`task10-runtime-manifest.cli.ts`)
 * 전용으로 하드 게이트돼 있어 로컬에서 못 쓴다. 게이트는 `_gate.tsx` 의 `deriveRole()` 이 배정 행이
 * 없는 어드민을 PLATFORM_OPS 로 간주하므로 스태프 배정 없이 통과한다.
 *
 * 결과 검토·정정 두 화면은 `V1GameOperationFlag` 의 GAME_READ 행이 있어야 본문이 뜬다. 마이그레이션은
 * 테이블만 만들고 행은 시드하지 않으며, 행을 만드는 유일한 경로인 tuple-transition 은 유효한
 * 게이트 증거 번들(gateBundlePath/gateBundleHash)을 요구하고 그 번들 생성기가 CI 전용이다. 따라서
 * 로컬 캡처에서는 "조회 모드 설정이 초기화되지 않았어요" 가드 화면이 찍히며, 그것이 신규 DB의 실제
 * 상태다 — 번들을 위조해 통과시키지 않는다.
 */
const OPS_ROUTES = (tournamentId) => [
  { slug: 'ops-operations', path: `/tournament-ops/tournaments/${tournamentId}/operations`, title: '운영 보드' },
  { slug: 'ops-result-review', path: `/tournament-ops/tournaments/${tournamentId}/result-review`, title: '결과 검토' },
  { slug: 'ops-corrections', path: `/tournament-ops/tournaments/${tournamentId}/records/corrections`, title: '결과 정정' },
  { slug: 'ops-staff', path: `/tournament-ops/tournaments/${tournamentId}/staff`, title: '스태프 배정' },
];
if (process.env.CAPTURE_TOURNAMENT_ID) {
  ROUTES.push(...OPS_ROUTES(process.env.CAPTURE_TOURNAMENT_ID));
}

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * 약관 게이트가 떠 있으면 "전체 동의" 카드를 누르고 CTA 를 눌러 통과시킨다. 게이트가 없으면
 * 아무것도 하지 않는다. 한 번 통과하면 같은 컨텍스트의 이후 페이지에서는 다시 뜨지 않는다.
 */
async function passTermsGate(page) {
  const agreeAll = page.getByText('전체 동의', { exact: false }).first();
  if ((await agreeAll.count()) === 0) return false;
  await agreeAll.click();
  const cta = page
    .getByRole('button', { name: /동의하고 계속|계속|확인|시작/ })
    .first();
  if ((await cta.count()) > 0) {
    await cta.click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  return true;
}

const results = [];

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    // localStorage 는 오리진이 로드된 뒤에만 쓸 수 있으므로 초기 진입 후 주입한다.
    const boot = await context.newPage();
    await boot.goto(`${BASE}/matches`, { waitUntil: 'domcontentloaded' });
    await boot.evaluate((email) => {
      localStorage.removeItem('teameet.v1.userId');
      localStorage.setItem('teameet.v1.userEmail', email);
    }, EMAIL);
    await boot.goto(`${BASE}/matches`, { waitUntil: 'networkidle' });
    await passTermsGate(boot);
    await boot.close();

    for (const route of ROUTES) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
      });
      const response = await page
        .goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
        .catch(() => null);
      await passTermsGate(page);
      // networkidle 이후에도 후속 쿼리가 늦게 도착해 빈 화면이 찍히는 사례가 있어 더 기다린다.
      await page.waitForTimeout(3000);
      const dir = `${OUT}/${route.slug}`;
      mkdirSync(dir, { recursive: true });
      const file = `${dir}/${vp.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      results.push({
        slug: route.slug,
        title: route.title,
        path: route.path,
        viewport: vp.name,
        status: response?.status() ?? 0,
        consoleErrors: consoleErrors.length,
        file,
      });
      console.log(
        `${vp.name.padEnd(8)} ${String(response?.status() ?? 0).padEnd(4)} ` +
          `err=${String(consoleErrors.length).padEnd(3)} ${route.path}`,
      );
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((r) => r.status !== 200);
console.log(`\ncaptured=${results.length} non200=${failures.length}`);
for (const f of failures) console.log(`  NON-200 ${f.status} ${f.viewport} ${f.path}`);
const withErrors = results.filter((r) => r.consoleErrors > 0);
for (const e of withErrors) console.log(`  CONSOLE ${e.consoleErrors} ${e.viewport} ${e.path}`);
