/**
 * F3(실사용 수동 QA) 증거 수집 하네스.
 *
 * F3 게이트는 `--qa-evidence-zip` 으로 실제 QA 산출물을 요구한다. 게이트가 합성할 수 있는
 * 물건이 아니므로 여기서 진짜로 화면을 열고 관측한 것만 기록한다 — 화면당 HTTP 상태,
 * 페이지 에러, 콘솔 에러, `/api/v1` 호출 목록과 각 상태코드, 실제로 렌더된 본문 텍스트,
 * 그리고 모바일/태블릿/데스크톱 3폭 스크린샷.
 *
 * 관측하지 않은 것은 적지 않는다. 통과시키려고 값을 만들어 넣지 않는다 — 화면이 에러를
 * 띄우면 그 에러가 그대로 증거로 남는다.
 *
 * 대상 18화면은 Task 127 원장의 screens[] 정의(id/route/actorShell)를 그대로 따른다.
 * 각 화면의 actorShell 이 요구하는 배우로 접속한다: 팀 화면은 해당 팀 owner, 대회 운영
 * 화면은 배정된 스태프(admin), 공개 화면은 비로그인.
 *
 * 실행 전제: v1 스택이 떠 있고(api 8121 / web 3013), 약관 재동의 게이트를 각 배우에 대해
 * 한 번 통과시켜 뒀을 것. 약관은 관리형 약관 기준선을 보기 때문에 DB 에 동의 행을 직접
 * 넣어도 통과되지 않고 "전체 동의" 실클릭만 통과된다 — 그래서 이 스크립트도 화면을 열 때
 * 게이트가 보이면 실제로 클릭한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const WEB = process.env.F3_WEB_BASE ?? 'http://localhost:3013';
const OUT = process.env.F3_OUT_DIR ?? 'scripts/qa/f3-evidence';

const ID = {
  team: process.env.F3_TEAM ?? '00000000-0000-4000-8000-000000000101',
  teamMatch: process.env.F3_TEAM_MATCH ?? '00000000-0000-4000-8000-000000000304',
  schedule: process.env.F3_SCHEDULE ?? '',
  tournament: process.env.F3_TOURNAMENT ?? '',
  fixture: process.env.F3_FIXTURE ?? '',
  user: process.env.F3_USER ?? '',
};

const OWNER = 'owner@teameet.v1';
const STAFF = 'admin@teameet.v1';
const PUBLIC = null;

/** 원장 screens[] 의 id/route 를 그대로 따른다. actor 는 각 행의 actorShell 이 요구하는 배우. */
const SCREENS = [
  { id: 'T-01', actor: OWNER, path: `/teams/${ID.team}` },
  { id: 'T-02', actor: OWNER, path: `/teams/${ID.team}/schedules` },
  { id: 'T-03', actor: OWNER, path: `/teams/${ID.team}/schedules/new` },
  { id: 'T-03b', actor: OWNER, path: `/teams/${ID.team}/schedules/${ID.schedule}/edit` },
  { id: 'T-04', actor: OWNER, path: `/teams/${ID.team}/schedules/${ID.schedule}` },
  { id: 'T-05', actor: OWNER, path: `/team-matches/${ID.teamMatch}/lineup` },
  { id: 'T-06', actor: OWNER, path: `/team-matches/${ID.teamMatch}/result` },
  { id: 'T-07', actor: OWNER, path: `/team-matches/${ID.teamMatch}/result/approval` },
  { id: 'T-08', actor: OWNER, path: `/teams/${ID.team}/records` },
  { id: 'T-09', actor: OWNER, path: '/my/schedule' },
  { id: 'A-01', actor: STAFF, path: `/tournament-ops/tournaments/${ID.tournament}/operations` },
  { id: 'A-02', actor: STAFF, path: `/tournament-ops/tournaments/${ID.tournament}/fixtures/${ID.fixture}/operate` },
  { id: 'A-03', actor: STAFF, path: `/tournament-ops/tournaments/${ID.tournament}/result-review` },
  { id: 'A-04', actor: STAFF, path: `/tournament-ops/tournaments/${ID.tournament}/records/corrections` },
  { id: 'A-05', actor: STAFF, path: `/tournament-ops/tournaments/${ID.tournament}/staff` },
  { id: 'P-01', actor: PUBLIC, path: `/tournaments/${ID.tournament}/schedule` },
  { id: 'P-02', actor: PUBLIC, path: `/tournaments/${ID.tournament}/matches/${ID.fixture}` },
  { id: 'P-03', actor: PUBLIC, path: `/teams/${ID.team}/records` },
  { id: 'P-04', actor: PUBLIC, path: `/users/${ID.user}/records` },
];

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clearTermsGate(page) {
  const agree = page.getByText('전체 동의', { exact: false }).first();
  if ((await agree.count()) === 0) return false;
  await agree.click();
  const cta = page.getByRole('button', { name: /동의하고 계속|계속|확인|시작|동의/ }).last();
  if ((await cta.count()) > 0) {
    await cta.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1200);
  }
  return true;
}

/**
 * Next 개발 서버가 주입하는 Dev Tools 인디케이터(좌하단 어두운 원)를 캡처에서만 숨긴다.
 * 앱 UI 가 아니라 프레임워크의 dev-only chrome 이라 갤러리에 남으면 제품 결함처럼 읽힌다
 * — 실제로 이 세션에서 "플로팅 버튼이 잘린다" 는 오진을 만들었다. next.config 에서 전역으로
 * 끄면 이 저장소의 모든 개발자가 그 도구를 잃으므로, 캡처하는 쪽에서만 가린다.
 */
const HIDE_DEV_INDICATOR = `
  nextjs-portal, [data-nextjs-dev-tools-button], #next-logo,
  [data-next-badge-root], [data-nextjs-toast] { display: none !important; }
`;

const records = [];
const browser = await chromium.launch();

try {
  for (const vp of VIEWPORTS) {
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      // addStyleTag 는 about:blank 에 붙어 goto 하면 사라진다 — 문서마다 실행되는
      // initScript 로 넣어야 실제 화면에 적용된다.
      await context.addInitScript((css) => {
        const apply = () => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head?.appendChild(style);
        };
        if (document.head) apply();
        else document.addEventListener('DOMContentLoaded', apply);
      }, HIDE_DEV_INDICATOR);
      const page = await context.newPage();

      const consoleErrors = [];
      const pageErrors = [];
      const apiCalls = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
      });
      page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 240)));
      page.on('response', (r) => {
        const u = r.url();
        if (u.includes('/api/v1/')) apiCalls.push({ status: r.status(), path: u.replace(WEB, '') });
      });

      if (screen.actor !== null) {
        await page.goto(`${WEB}/matches`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.evaluate((email) => {
          localStorage.removeItem('teameet.v1.userId');
          localStorage.setItem('teameet.v1.userEmail', email);
        }, screen.actor);
      }

      const response = await page
        .goto(`${WEB}${screen.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
        .catch(() => null);
      const termsSeen = await clearTermsGate(page);
      // networkidle 이후에도 후속 쿼리가 늦게 도착해 빈 화면이 찍히는 사례가 있어 더 기다린다.
      await sleep(3000);

      const dir = `${OUT}/${screen.id}`;
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/${vp.name}.png`, fullPage: true });
      const bodyText = (await page.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ')
        .slice(0, 600);

      records.push({
        screenId: screen.id,
        viewport: vp.name,
        actor: screen.actor ?? 'public',
        path: screen.path,
        httpStatus: response?.status() ?? 0,
        termsGateSeen: termsSeen,
        pageErrors,
        consoleErrors,
        apiCalls: apiCalls.slice(0, 40),
        apiNon2xx: apiCalls.filter((a) => a.status >= 400),
        bodyText,
        screenshot: `${screen.id}/${vp.name}.png`,
      });

      console.log(
        `${vp.name.padEnd(8)} ${String(response?.status() ?? 0).padEnd(4)} ` +
          `pageErr=${pageErrors.length} apiErr=${apiCalls.filter((a) => a.status >= 400).length} ${screen.id}`,
      );

      await page.close();
      await context.close();
    }
  }
} finally {
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/observations.json`, JSON.stringify({ records }, null, 2), 'utf8');

const screensSeen = new Set(records.map((r) => r.screenId));
const broken = records.filter(
  (r) => r.httpStatus !== 200 || r.pageErrors.length > 0 || r.apiNon2xx.length > 0,
);
console.log(`\ncaptured=${records.length} screens=${screensSeen.size} withProblems=${broken.length}`);
for (const r of broken) {
  console.log(
    `  ${r.screenId} ${r.viewport} http=${r.httpStatus} pageErr=${r.pageErrors.length} ` +
      `apiErr=${r.apiNon2xx.map((a) => a.status + ' ' + a.path.split('?')[0]).join(',')}`,
  );
}
