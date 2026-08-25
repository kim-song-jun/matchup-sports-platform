// alpha 어드민 "리그 대진 timing 설정" UI 3폭 캡처 (PR #741 갤러리용).
// 실행: ALPHA_SESSION_TOKEN=... ALPHA_TEAM_A=... ALPHA_TEAM_B=... node scripts/capture-league-fixture-timing-ui.mjs
// - (테스트) 리그를 새로 만들어(참가팀 2개) 생성 폼을 띄우고, 시간창 역산 제안 →
//   '이대로 적용' → 미리보기(타임라인)까지 채운 상태를 390/768/1440로 캡처한다.
// - 자격증명·팀 id는 저장소에 적지 않는다(PUBLIC repo) — 전부 환경변수.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const TEAM_A = process.env.ALPHA_TEAM_A;
const TEAM_B = process.env.ALPHA_TEAM_B;
if (!TOKEN || !TEAM_A || !TEAM_B) throw new Error('ALPHA_SESSION_TOKEN / ALPHA_TEAM_A / ALPHA_TEAM_B 환경변수가 필요해요.');

const OUT_DIR = new URL('../.screenshots/league-fixture-timing-0825/', import.meta.url).pathname;
mkdirSync(OUT_DIR, { recursive: true });

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `teameet_v1_session=${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// sportId는 참가팀 상세에서, regionId는 마스터 지역 트리의 시·군·구(level 2)에서 읽는다
// (리그는 LEAGUE_REGION_INVALID로 level 1 시·도를 거부한다 — 하드코딩 금지).
const teamDetail = await api('GET', `/teams/${TEAM_A}`);
const sportId = teamDetail.data?.sport?.sportId;
const regionsRes = await api('GET', '/master/regions');
const topRegions = Array.isArray(regionsRes.data) ? regionsRes.data : regionsRes.data?.regions ?? [];
const regionId = topRegions.flatMap((r) => r.children ?? [])[0]?.id;
if (!sportId || !regionId) throw new Error(`sportId/regionId를 찾지 못했어요 (sport: ${sportId}, region: ${regionId})`);

const created = await api('POST', '/admin/league-matches', {
  title: `(테스트) 타이밍 UI 캡처 ${new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '')}`,
  sportId,
  regionId,
  startsOn: '2026-08-31T00:00:00.000Z', // KST 월요일 → 수요일 지정 시 첫 매치데이 9/2
  endsOn: '2026-12-01T00:00:00.000Z',
  teamIds: [TEAM_A, TEAM_B],
});
const leagueId = created.data.leagueId;
console.log('캡처용 리그 생성 완료');

const browser = await chromium.launch();
for (const [label, width, height] of [['mobile-390', 390, 1400], ['tablet-768', 768, 1400], ['desktop-1440', 1440, 1200]]) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies([
    { name: 'teameet_v1_session', value: TOKEN, domain: 'alpha.teameet.co.kr', path: '/', secure: true, httpOnly: true },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/league-matches/${leagueId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fixture-day-of-week', { timeout: 30_000 });

  await page.selectOption('#fixture-day-of-week', '3');
  await page.fill('#fixture-time', '22:00');
  await page.fill('#fixture-end-time', '00:00');
  await page.fill('#fixture-game-duration', '15');
  await page.fill('#fixture-break-minutes', '5');
  // 역산 제안 → 적용 → 미리보기(타임라인)
  await page.getByRole('button', { name: '이대로 적용' }).click();
  await page.getByRole('button', { name: '미리보기' }).click();
  await page.waitForTimeout(2000); // 폴링 페이지라 networkidle 금지 — 명시 대기

  await page.screenshot({ path: `${OUT_DIR}admin-fixture-timing-${label}.png`, fullPage: true });
  const check = await page.evaluate(() => ({
    suggestion: document.body.innerText.includes('가능해요'),
    planCard: document.body.innerText.includes('하루 운영 계산'),
    timeline: document.body.innerText.includes('1주차 —'),
    firstSlot: document.body.innerText.includes('22:00~22:15'),
  }));
  console.log(label, JSON.stringify(check));
  await context.close();
}
await browser.close();
console.log('완료:', OUT_DIR);
