// alpha 실측 — "내 기록 연결(claim)" 리그 확장(PR #770) 검증.
// 사용: ALPHA_EMAIL=<참가팀 계정> ALPHA_PASSWORD=<비밀번호> node scripts/verify-alpha-league-claim.mjs
// 검증 항목:
//   1) 비인증 GET claimable-participants -> 401 (V1AuthGuard)
//   2) 참가팀 멤버 GET -> 200 + { gameId, version, participants[] } 계약
//   3) 리그 스코프 게이트 -> 다른 leagueId 로 같은 teamMatchId 를 조회하면 404
//   4) 화면: 리그 경기 상세 배너 + 모달(390/768/1440) 캡처
// 주의: alpha 는 과한 캡처에 403 을 건다 — 페이지 수를 늘리지 말 것.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://alpha.teameet.co.kr';
const OUT = process.env.OUT_DIR ?? '.screenshots/league-claim-0825';
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('ALPHA_EMAIL/ALPHA_PASSWORD 환경변수가 필요합니다');

async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, data: body?.data ?? null, code: body?.code ?? body?.error?.code ?? null };
}

// --- 로그인 (세션은 stateless HMAC 쿠키 — login API 가 유일한 발급 경로) ---
const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const setCookie = loginRes.headers.get('set-cookie') ?? '';
const session = /teameet_v1_session=([^;]+)/.exec(setCookie)?.[1];
if (!session) throw new Error(`로그인 실패: ${loginRes.status}`);
const authHeaders = { cookie: `teameet_v1_session=${session}` };
console.log('login: ok');

// --- 대상 대진 탐색: 기록(record)이 공개(200)이고 이 계정이 참가팀 멤버(200)인 대진 ---
const list = await api('/league-matches?limit=50');
const leagues = list.data?.items ?? [];
let target = null;
const leagueIds = leagues.map((l) => l.leagueId);
outer: for (const league of leagues) {
  const detail = await api(`/league-matches/${league.leagueId}`);
  const fixtures = (detail.data?.fixtures ?? []).slice(0, 4);
  for (const fx of fixtures) {
    const record = await api(`/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}/record`);
    if (record.status !== 200) continue;
    const claim = await api(
      `/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}/claimable-participants`,
      { headers: authHeaders },
    );
    console.log(`probe ${league.title} / ${fx.teamMatchId}: record=200 claim=${claim.status}`);
    if (claim.status === 200) {
      target = { league, fx, claim: claim.data };
      break outer;
    }
  }
}
if (!target) throw new Error('이 계정이 참가팀 멤버인 기록 공개 대진을 찾지 못했습니다');
const { league, fx } = target;
console.log('target:', league.leagueId, league.title, '/', fx.teamMatchId);

// --- 1) 비인증 -> 401 ---
const anon = await api(`/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}/claimable-participants`);
console.log(`anon: ${anon.status} (expect 401)`);

// --- 2) 계약 필드 ---
const c = target.claim;
console.log(
  `claim: gameId=${typeof c.gameId} version=${typeof c.version} participants=${Array.isArray(c.participants) ? c.participants.length : 'N/A'}`,
);
if (c.participants.length > 0) {
  const p = c.participants[0];
  console.log(`  first: sideId=${typeof p.sideId} displayName=${typeof p.displayName} jersey=${p.jerseyNumber}`);
}

// --- 3) 리그 스코프 게이트: 다른 리그 id + 같은 teamMatchId -> 404 ---
const otherLeagueId = leagueIds.find((id) => id !== league.leagueId) ?? '00000000-0000-4000-8000-000000000000';
const crossed = await api(
  `/league-matches/${otherLeagueId}/fixtures/${fx.teamMatchId}/claimable-participants`,
  { headers: authHeaders },
);
console.log(`cross-league: ${crossed.status} code=${crossed.code} (expect 404 LEAGUE_FIXTURE_GAME_NOT_FOUND)`);

// --- 4) 화면 캡처: 배너 3폭 + 모달(390) ---
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
  { name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/' },
]);
const url = `${BASE}/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}`;
for (const [label, width, height] of [
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['desktop-1440', 1440, 900],
]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  // 라이브 폴링 페이지는 networkidle 이 끝나지 않는다 — domcontentloaded + 대기.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const bannerVisible = await page.getByText('이 경기에 뛰었는데 내 기록이 없나요?').count();
  console.log(`page ${label}: banner=${bannerVisible > 0 ? 'visible' : 'MISSING'}`);
  await page.screenshot({ path: `${OUT}/claim-banner-${label}.png`, fullPage: true });
  if (label === 'mobile-390') {
    await page.getByRole('button', { name: '명단에서 나 찾기' }).click();
    await page.waitForTimeout(1500);
    const title = await page.locator('#claim-my-record-title').textContent().catch(() => null);
    console.log(`modal title: ${title}`);
    await page.screenshot({ path: `${OUT}/claim-modal-mobile-390.png`, fullPage: false });
  }
  await page.close();
  await new Promise((r) => setTimeout(r, 400));
}
await browser.close();
console.log('done ->', OUT);
