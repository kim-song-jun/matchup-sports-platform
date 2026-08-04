/**
 * 페르소나별 사용자 여정(flow) 증거 수집.
 *
 * 앞선 F3 하네스(run-v1-f3-manual-qa.mjs)는 원장 screens[] 18화면을 **화면 단위**로 찍는다.
 * 이 하네스는 같은 제품을 **여정 단위**로 걷는다 — `e2e/v1-tests/personas.ts` 에 정의된
 * 페르소나가 각자의 flow 를 순서대로 밟고, 각 단계를 3폭으로 남긴다. 화면 하나가 혼자
 * 멀쩡한 것과, 한 배우가 자기 목적을 끝까지 달성할 수 있는 것은 다른 문제다.
 *
 * 배우는 화면이 아니라 **역할**이 정한다. 같은 팀 화면이라도 owner / manager / member 가
 * 보는 것이 다르므로 셋 다 따로 걷는다. 대회 운영은 platform_ops(어드민 우회)와
 * tournament_director 를 구분한다.
 *
 * 관측한 것만 기록한다. 단계가 에러를 띄우면 그 에러가 그대로 증거로 남고, 통과시키려고
 * 값을 만들어 넣지 않는다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const WEB = process.env.FLOW_WEB_BASE ?? 'http://localhost:3013';
const OUT = process.env.FLOW_OUT_DIR ?? 'scripts/qa/persona-flows';

const ID = {
  team: process.env.FLOW_TEAM ?? '',
  team2: process.env.FLOW_TEAM2 ?? '',
  schedule: process.env.FLOW_SCHEDULE ?? '',
  teamMatch: process.env.FLOW_TEAM_MATCH ?? '',
  match: process.env.FLOW_MATCH ?? '',
  tournament: process.env.FLOW_TOURNAMENT ?? '',
  fixture: process.env.FLOW_FIXTURE ?? '',
  user: process.env.FLOW_USER ?? '',
};

/** personas.ts 의 정의를 따르되, 대회 운영 역할 2종을 더해 9배우로 걷는다. */
const FLOWS = [
  {
    persona: 'visitor',
    name: '신규 방문자',
    actor: null,
    steps: [
      ['랜딩', '/'],
      ['매치 탐색', '/matches'],
      ['대회 일정', `/tournaments/${ID.tournament}/schedule`],
      ['대회 경기 상세', `/tournaments/${ID.tournament}/matches/${ID.fixture}`],
      ['팀 공개 기록', `/teams/${ID.team}/records`],
      ['선수 공개 기록', `/users/${ID.user}/records`],
    ],
  },
  {
    persona: 'host',
    name: '호스트민 · 매치 주최',
    actor: 'host@teameet.v1',
    steps: [
      ['홈', '/matches'],
      ['매치 생성', '/matches/new'],
      ['매치 상세', `/matches/${ID.match}`],
      ['팀 매칭 목록', '/team-matches'],
    ],
  },
  {
    persona: 'applicant',
    name: '지원수 · 참가 신청',
    actor: 'applicant@teameet.v1',
    steps: [
      ['매치 탐색', '/matches'],
      ['매치 상세', `/matches/${ID.match}`],
      ['팀 탐색', '/teams'],
      ['팀 상세(가입 신청)', `/teams/${ID.team}`],
    ],
  },
  {
    persona: 'owner',
    name: '팀장원 · 팀 운영',
    actor: 'owner@teameet.v1',
    steps: [
      ['팀 상세', `/teams/${ID.team}`],
      ['팀 일정 목록', `/teams/${ID.team}/schedules`],
      ['일정 생성', `/teams/${ID.team}/schedules/new`],
      ['일정 상세', `/teams/${ID.team}/schedules/${ID.schedule}`],
      ['일정 수정', `/teams/${ID.team}/schedules/${ID.schedule}/edit`],
      ['팀 전적', `/teams/${ID.team}/records`],
      ['라인업 편성', `/team-matches/${ID.teamMatch}/lineup`],
      ['경기 결과 입력', `/team-matches/${ID.teamMatch}/result`],
    ],
  },
  {
    persona: 'manager',
    name: '매니저준 · 팀 운영 보조',
    actor: 'manager@teameet.v1',
    steps: [
      ['팀 상세', `/teams/${ID.team}`],
      ['팀 일정 목록', `/teams/${ID.team}/schedules`],
      ['라인업 편성', `/team-matches/${ID.teamMatch}/lineup`],
      ['상대팀 결과 승인', `/team-matches/${ID.teamMatch}/result/approval`],
    ],
  },
  {
    persona: 'member',
    name: '멤버현 · 소속팀 활동',
    actor: 'member@teameet.v1',
    steps: [
      ['내 일정', '/my/schedule'],
      ['팀 상세', `/teams/${ID.team}`],
      ['팀 일정 목록', `/teams/${ID.team}/schedules`],
      ['일정 상세', `/teams/${ID.team}/schedules/${ID.schedule}`],
    ],
  },
  {
    persona: 'platform_ops',
    name: '운영자 · 플랫폼 운영',
    actor: 'admin@teameet.v1',
    steps: [
      ['운영 보드', `/tournament-ops/tournaments/${ID.tournament}/operations`],
      ['스태프 배정', `/tournament-ops/tournaments/${ID.tournament}/staff`],
      ['결과 검토', `/tournament-ops/tournaments/${ID.tournament}/result-review`],
      ['결과 정정', `/tournament-ops/tournaments/${ID.tournament}/records/corrections`],
    ],
  },
  {
    persona: 'tournament_director',
    name: '대회 디렉터 · 경기 관리',
    actor: 'admin@teameet.v1',
    steps: [
      ['운영 보드', `/tournament-ops/tournaments/${ID.tournament}/operations`],
      ['경기 운영 콘솔', `/tournament-ops/tournaments/${ID.tournament}/fixtures/${ID.fixture}/operate`],
      ['결과 검토', `/tournament-ops/tournaments/${ID.tournament}/result-review`],
    ],
  },
  {
    persona: 'public_records',
    name: '공개 기록 열람',
    actor: null,
    steps: [
      ['대회 일정', `/tournaments/${ID.tournament}/schedule`],
      ['대회 경기 상세', `/tournaments/${ID.tournament}/matches/${ID.fixture}`],
      ['팀 공개 기록', `/teams/${ID.team}/records`],
      ['선수 공개 기록', `/users/${ID.user}/records`],
    ],
  },
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
    await sleep(1000);
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
    for (const flow of FLOWS) {
      // 여정은 한 컨텍스트 안에서 이어 걷는다 — 단계마다 새 세션을 만들면 그건 여정이 아니다.
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
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
      });
      page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
      page.on('response', (r) => {
        if (r.url().includes('/api/v1/')) apiCalls.push({ status: r.status(), path: r.url().replace(WEB, '') });
      });

      if (flow.actor !== null) {
        await page.goto(`${WEB}/matches`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.evaluate((email) => {
          localStorage.removeItem('teameet.v1.userId');
          localStorage.setItem('teameet.v1.userEmail', email);
        }, flow.actor);
      }

      for (const [index, [label, path]] of flow.steps.entries()) {
        const before = { console: consoleErrors.length, page: pageErrors.length, api: apiCalls.length };
        const response = await page
          .goto(`${WEB}${path}`, { waitUntil: 'networkidle', timeout: 45_000 })
          .catch(() => null);
        await clearTermsGate(page);
        await sleep(2500);

        const stepId = `${flow.persona}-${String(index + 1).padStart(2, '0')}`;
        const dir = `${OUT}/${stepId}`;
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: `${dir}/${vp.name}.png`, fullPage: true });

        const stepApi = apiCalls.slice(before.api);
        records.push({
          stepId,
          persona: flow.persona,
          personaName: flow.name,
          stepIndex: index + 1,
          stepLabel: label,
          actor: flow.actor ?? 'public',
          viewport: vp.name,
          path,
          httpStatus: response?.status() ?? 0,
          pageErrors: pageErrors.slice(before.page),
          consoleErrors: consoleErrors.slice(before.console),
          apiNon2xx: stepApi.filter((a) => a.status >= 400),
          bodyText: (await page.locator('body').innerText().catch(() => ''))
            .replace(/\s+/g, ' ')
            .slice(0, 400),
          screenshot: `${stepId}/${vp.name}.png`,
        });

        const last = records[records.length - 1];
        console.log(
          `${vp.name.padEnd(8)} ${String(last.httpStatus).padEnd(4)} ` +
            `pe=${last.pageErrors.length} api=${last.apiNon2xx.length} ${stepId} ${label}`,
        );
      }

      await page.close();
      await context.close();
    }
  }
} finally {
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/flow-observations.json`, JSON.stringify({ records }, null, 2), 'utf8');

const personas = new Set(records.map((r) => r.persona));
const steps = new Set(records.map((r) => r.stepId));
const problems = records.filter(
  (r) => r.httpStatus !== 200 || r.pageErrors.length > 0 || r.apiNon2xx.length > 0,
);
console.log(`\ncaptured=${records.length} personas=${personas.size} steps=${steps.size} problems=${problems.length}`);
for (const p of problems) {
  console.log(
    `  ${p.stepId} ${p.viewport} http=${p.httpStatus} pe=${p.pageErrors.length} ` +
      `api=${p.apiNon2xx.map((a) => a.status + ' ' + a.path.split('?')[0]).join(',')}`,
  );
}
