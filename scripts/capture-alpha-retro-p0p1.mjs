/**
 * 1차 대회 회고 후속 P0·P1 PR 5건의 3폭 갤러리 캡처.
 *
 * 대상 화면:
 *   lineup      — 대회 경기 라인업 (LINEUP-2 충돌 복구 / LINEUP-5 팀 고정 등번호)
 *   operate     — 현장 운영 콘솔 (LINEUP-7 명단 검인 / LIVE-7 선수 검색 / BRACKET-6 몰수 버튼)
 *   admin-info  — 대회 정보 수정 (DISCIPLINE-1 정지 규정 입력란)
 *
 * 캡처만 한다 — 상태를 바꾸는 조작(저장·제출·커맨드)은 하지 않는다. 검인 토글이나
 * 몰수 다이얼로그처럼 "열어야 보이는" 것은 **열기만** 하고 확정하지 않는다.
 *
 * 라이브 경기가 있는 화면은 10초 폴링이라 `networkidle` 이 절대 끝나지 않는다 —
 * `domcontentloaded` + 명시적 대기를 쓴다(저장소 관례).
 *
 * 자격증명은 파일에 넣지 않는다(이 저장소는 public):
 *   ALPHA_EMAIL=... ALPHA_PASSWORD=... TOURNAMENT_ID=... FIXTURE_ID=... \
 *   OUT_DIR=/path/to/gallery node scripts/capture-alpha-retro-p0p1.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { chromium } = require_('playwright');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
const OUT_DIR = process.env.OUT_DIR;
const TOURNAMENT_ID = process.env.TOURNAMENT_ID;
const FIXTURE_ID = process.env.FIXTURE_ID;
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);

for (const [k, v] of Object.entries({ ALPHA_EMAIL: EMAIL, ALPHA_PASSWORD: PASSWORD, OUT_DIR, TOURNAMENT_ID, FIXTURE_ID })) {
  if (!v) {
    console.error(`${k} 환경변수가 필요합니다.`);
    process.exit(1);
  }
}
mkdirSync(OUT_DIR, { recursive: true });

const WIDTHS = [
  { key: '390', width: 390, height: 844, mobile: true },
  { key: '768', width: 768, height: 1024, mobile: false },
  { key: '1440', width: 1440, height: 1100, mobile: false },
];

const PAGES = [
  {
    key: 'lineup',
    label: '대회 경기 라인업 (LINEUP-2 / LINEUP-5)',
    url: `${ORIGIN}/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}/lineup`,
    // 대회 스태프는 양 팀 명단을 대신 짤 수 있어 **팀 선택 단계**가 먼저 뜬다 — 거기서
    // 멈추면 정작 보여줄 명단 그리드(등번호 자동 채움)가 화면에 없다. 한 팀을 골라
    // 들어가기만 하고 저장·제출은 하지 않는다.
    async prepare(page) {
      const pick = page.getByRole('button', { name: /명단 짜기$/ });
      if ((await pick.count()) === 0) return null; // 이미 그리드면 그대로 찍는다
      await pick.first().click();
      await page.waitForTimeout(3_000);
      // 기본 탭은 "피치 배치"라 등번호가 안 보인다 — 등번호가 있는 "명단" 탭으로 옮긴다.
      const rosterTab = page.getByRole('tab', { name: '명단', exact: true });
      if ((await rosterTab.count()) > 0) {
        await rosterTab.first().click();
        await page.waitForTimeout(1_500);
      }
      return null;
    },
  },
  {
    key: 'operate',
    label: '현장 운영 콘솔 (LINEUP-7 / LIVE-7 / BRACKET-6)',
    url: `${ORIGIN}/admin/live/${TOURNAMENT_ID}/fixtures/${FIXTURE_ID}/operate`,
  },
  {
    key: 'admin-info',
    label: '대회 정보 수정 (DISCIPLINE-1 정지 규정)',
    url: `${ORIGIN}/admin/tournaments/${TOURNAMENT_ID}/info`,
    // 정지 규정 입력란은 **편집 폼 안**에 있다 — 읽기 뷰에는 없다. 열기만 하고 저장하지 않는다.
    async prepare(page) {
      const edit = page.getByRole('button', { name: '대회 정보 수정' });
      if ((await edit.count()) === 0) return 'edit-button-missing';
      await edit.first().click();
      const field = page.getByLabel('경고 누적 출전정지 (장)');
      await field.waitFor({ state: 'visible', timeout: 10_000 });
      await field.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      return null;
    },
  },
  {
    key: 'operate-search',
    label: '선수 검색 (LIVE-7)',
    url: `${ORIGIN}/admin/live/${TOURNAMENT_ID}/fixtures/${FIXTURE_ID}/operate`,
    // 선수 그리드는 액션을 고른 뒤 열리는 대상 선택 단계에서 뜬다. 기록은 하지 않는다.
    async prepare(page) {
      const action = page.getByRole('button', { name: '옐로카드' });
      if ((await action.count()) === 0) return 'action-missing';
      await action.first().click();
      const search = page.getByLabel('등번호 또는 이름으로 선수 찾기');
      await search.waitFor({ state: 'visible', timeout: 10_000 });
      // 변별력 있는 질의를 쓴다. 빈 결과는 필터가 거르는 걸 보여주지 못하고, 반대로
      // 전원이 걸리는 질의(alpha 테스트 계정은 이름이 다 'E2E …' 라 '2' 가 전원 매칭)도
      // 마찬가지다 — 한 명만 남는 질의라야 동작이 화면에 드러난다.
      await search.fill('선수3');
      await page.waitForTimeout(600);
      return null;
    },
  },
  {
    key: 'operate-forfeit',
    label: '몰수·중단 종료 다이얼로그 (BRACKET-6)',
    url: `${ORIGIN}/admin/live/${TOURNAMENT_ID}/fixtures/${FIXTURE_ID}/operate`,
    // 다이얼로그를 **열기만** 한다 — 확정("이대로 종료")은 누르지 않는다. 이 버튼은
    // takeover 를 쥐어야 활성화되는데 콘솔이 마운트 시 스스로 요청하므로 대기만 하면 된다.
    async prepare(page) {
      const trigger = page.getByRole('button', { name: '몰수·중단으로 종료' });
      if ((await trigger.count()) === 0) return 'forfeit-button-missing';
      await trigger.first().waitFor({ state: 'visible', timeout: 10_000 });
      // 비활성 상태에서 클릭하면 아무 일도 안 일어나 빈 화면을 찍게 된다 — 활성화까지 기다린다.
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('button')).some(
            (b) => b.textContent?.includes('몰수·중단으로 종료') && !b.disabled,
          ),
        undefined,
        { timeout: 20_000 },
      );
      await trigger.first().click();
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
      // 사유는 기본값이 '몰수·기권' 이라 고를 필요가 없다. 사유란만 채워 "사유가 있어야
      // 확정 버튼이 열린다"는 이 화면의 핵심을 보이게 한다 — 확정은 누르지 않는다.
      await page.getByRole('textbox').last().fill('원정팀 미출석으로 몰수 처리 (예시)');
      await page.waitForTimeout(600);
      return null;
    },
  },
];

async function sessionCookie() {
  const res = await fetch(`${ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  const raw = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('teameet_v1_session='));
  if (!raw) throw new Error(`login 실패 (HTTP ${res.status})`);
  console.log(`로그인 OK — 배포 커밋 ${res.headers.get('x-teameet-commit')?.slice(0, 8)}`);
  return raw.slice('teameet_v1_session='.length);
}

async function main() {
  const token = await sessionCookie();
  const browser = await chromium.launch();
  const results = [];

  for (const page of PAGES) {
    if (ONLY.length > 0 && !ONLY.includes(page.key)) continue;
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: w.width, height: w.height },
        isMobile: w.mobile,
        hasTouch: w.mobile,
        deviceScaleFactor: 2,
      });
      await ctx.addCookies([
        { name: 'teameet_v1_session', value: token, domain: new URL(ORIGIN).hostname, path: '/', secure: true },
      ]);
      const p = await ctx.newPage();
      let note = '';
      try {
        // 라이브 폴링 화면은 networkidle 이 끝나지 않는다 — domcontentloaded + 고정 대기.
        await p.goto(page.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await p.waitForTimeout(4_000);
        if (page.prepare) {
          const problem = await page.prepare(p);
          if (problem) note = ` ⚠${problem}`;
        }
        const overflow = await p.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        if (overflow) note = ' ⚠가로오버플로';
      } catch (err) {
        note = ` ⚠${err.message.slice(0, 60)}`;
      }
      const file = `${OUT_DIR}/${page.key}-${w.key}.png`;
      await p.screenshot({ path: file, fullPage: false });
      results.push(`${page.key}-${w.key}${note}`);
      console.log(`  캡처 ${page.key} @${w.key}${note}`);
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\n완료 ${results.length}장 → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(`실패: ${err.message}`);
  process.exit(1);
});
