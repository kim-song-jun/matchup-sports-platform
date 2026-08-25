// alpha 실측 — 기록 연결 승인(attest) 동선(PR #774) 전 구간 릴레이.
// 사용: ALPHA_REQUESTER_EMAIL=<팀원> ALPHA_ATTESTOR_EMAIL=<홈팀 리더> \
//       ALPHA_ATTESTOR_ALT_EMAIL=<원정팀 리더> ALPHA_PASSWORD=<공통 비밀번호> \
//       node scripts/verify-alpha-identity-attest.mjs
//
// 확인자를 **양 팀 리더 2명** 받는 이유: 승인 자격은 참가자가 속한 사이드 팀의
// owner/manager 에게만 있는데, 사이드↔팀 매핑을 공개 API 로 알 방법이 없다(공개 기록의
// lineup 은 경기 시작 전 null). 한 명만 받아 "안 보이면 다른 사이드로 재신청"하면
// **자격 밖 사이드에 만든 요청이 취소 불가**(revoke 는 활성 링크 전용)라 24h 잔여물이
// 남는다. 그래서 요청은 **정확히 1건만** 만들고, 두 리더 중 그 요청이 보이는 쪽을
// 확인자로 삼아 반드시 종결시킨다.
// 릴레이: 팀원이 신청 → 리더의 인앱 알림 도착 → 리더의 승인함 목록에 노출 →
//         화면(승인 카드) 캡처 → 리더가 거절(reject)로 종결 → 승인함에서 사라짐.
// 거절로 끝내는 이유: approve 는 실제 신원 연결을 만든다 — 실측 잔여물을 남기지 않기
// 위해 reject 로 원상 복구한다(참가자는 다시 claim 가능 상태로 돌아간다).
// 기대값이 하나라도 어긋나면 즉시 throw(exit != 0).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://alpha.teameet.co.kr';
const OUT = process.env.OUT_DIR ?? '.screenshots/identity-attest-0826';
const HINT = process.env.LEAGUE_HINT ?? '';
const MAX_LEAGUES = Number(process.env.MAX_LEAGUES ?? 5);
const REQUESTER_EMAIL = process.env.ALPHA_REQUESTER_EMAIL;
const ATTESTOR_EMAIL = process.env.ALPHA_ATTESTOR_EMAIL;
const ATTESTOR_ALT_EMAIL = process.env.ALPHA_ATTESTOR_ALT_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
if (!REQUESTER_EMAIL || !ATTESTOR_EMAIL || !ATTESTOR_ALT_EMAIL || !PASSWORD) {
  throw new Error(
    'ALPHA_REQUESTER_EMAIL/ALPHA_ATTESTOR_EMAIL/ALPHA_ATTESTOR_ALT_EMAIL/ALPHA_PASSWORD 환경변수가 필요합니다',
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(`검증 실패: ${message}`);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  // getSetCookie() 를 먼저 쓴다 — get() 은 Set-Cookie 가 여러 개일 때 하나로 합친다.
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const session = cookies
    .map((cookie) => /teameet_v1_session=([^;]+)/.exec(cookie ?? '')?.[1])
    .find(Boolean);
  assert(session, `${email} 로그인 실패 (${res.status})`);
  return session;
}

async function api(path, { session, method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(session ? { cookie: `teameet_v1_session=${session}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const parsed = await res.json().catch(() => null);
  return { status: res.status, data: parsed?.data ?? null, code: parsed?.code ?? parsed?.error?.code ?? null };
}

const requesterSession = await login(REQUESTER_EMAIL);
const attestorSessions = [await login(ATTESTOR_EMAIL), await login(ATTESTOR_ALT_EMAIL)];
console.log('login: requester + attestor x2 ok');

// --- 대상 대진 탐색: 신청자가 참가팀 멤버로 미연결 후보를 가진 리그 대진 ---
const list = await api('/league-matches?limit=50');
const allLeagues = list.data?.items ?? [];
const leagues = (HINT ? allLeagues.filter((l) => l.title.includes(HINT)) : allLeagues).slice(0, MAX_LEAGUES);
let target = null;
outer: for (const league of leagues) {
  const detail = await api(`/league-matches/${league.leagueId}`);
  for (const fx of (detail.data?.fixtures ?? []).slice(0, 4)) {
    const claim = await api(
      `/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}/claimable-participants`,
      { session: requesterSession },
    );
    if (claim.status === 200 && (claim.data?.participants?.length ?? 0) > 0) {
      target = { league, fx, claim: claim.data };
      break outer;
    }
    console.log(`probe ${league.title} / ${fx.teamMatchId}: claim=${claim.status} candidates=${claim.data?.participants?.length ?? 'N/A'}`);
  }
}
assert(target, '신청자가 참가팀 멤버이고 미연결 후보가 있는 대진을 찾지 못했습니다');
const { league, fx } = target;
const gameId = target.claim.gameId;
console.log('target:', league.title, '/', fx.teamMatchId, 'gameId:', gameId, 'candidates:', target.claim.participants.length);

// --- 1) 팀원이 신청 (요청은 정확히 1건만 만든다 — 취소 수단이 없다) ---
const candidate = target.claim.participants[0];
const clientCommandId = `attest-verify-${Date.now()}`;
const requested = await api(`/games/${gameId}/participants/${candidate.participantId}/identity-link-requests`, {
  session: requesterSession,
  method: 'POST',
  body: { expectedVersion: target.claim.version, clientCommandId },
  idempotencyKey: clientCommandId,
});
console.log(`request: ${requested.status} ${requested.code ?? ''} participant=${candidate.displayName}`);
assert(
  requested.status === 201 || requested.status === 200 || requested.code === 'IDENTITY_LINK_REQUEST_PENDING',
  `신청이 예상 밖 응답 — ${requested.status} ${requested.code}`,
);

// --- 2) 두 리더 중 이 요청이 보이는 쪽이 승인 자격자다 ---
// (자격 밖 리더에게 안 보이는 것이 정상 — 사이드 스코프 필터가 동작한다는 증거이기도 하다.)
let attestorSession = null;
let pending = null;
let row = null;
for (const [index, session] of attestorSessions.entries()) {
  const listed = await api(`/games/${gameId}/identity-link-requests/pending`, { session });
  assert(listed.status === 200, `승인함 목록이 200 이 아님 — ${listed.status} ${listed.code}`);
  const found = (listed.data?.requests ?? []).find((r) => r.participantId === candidate.participantId);
  console.log(`pending(attestor#${index + 1}): ${found ? 'visible' : '자격 밖(정상)'}`);
  if (found) {
    attestorSession = session;
    pending = listed;
    row = found;
    break;
  }
}
assert(row, '두 팀 리더 모두에게 요청이 보이지 않음 — 사이드 자격 판정을 확인하세요');
console.log(`pending: ok — requestId=${row.requestId} participant="${row.participantDisplayName}" requester=${row.requesterNickname}`);

// --- 3) 리더의 인앱 알림 도착 ---
// 알림은 신청 트랜잭션 안에서 쓰이므로 신청 성공 = 알림 존재다(지연 없음). 다만 확인자의
// 알림함이 활발하면 최근 20건 밖으로 밀릴 수 있어 창을 넓히고 **참가자 이름까지** 맞춘다
// — 제목만 맞추면 이전 실행의 다른 참가자 알림을 잡아 통과할 수도 있다(Copilot 리뷰).
// 조회 자체의 실패(401/5xx)를 "알림 없음"으로 읽으면 원인을 엉뚱한 데서 찾게 된다 —
// 매 회 status 를 먼저 검증하고, 반영 지연에 대비해 짧게만 재시도한다(Copilot 리뷰).
let arrived = null;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const notifications = await api('/notifications?limit=50', { session: attestorSession });
  assert(
    notifications.status === 200,
    `알림 목록 조회가 200 이 아님 — ${notifications.status} ${notifications.code} (알림 없음이 아니라 조회 실패다)`,
  );
  arrived = (notifications.data?.items ?? []).find(
    (n) =>
      n.title === '기록 연결 승인 요청이 도착했어요' &&
      typeof n.body === 'string' &&
      n.body.includes(candidate.displayName),
  );
  if (arrived) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert(arrived, `리더의 알림함에 "${candidate.displayName}" 승인 요청 알림이 없음(5회 조회)`);
// 목록 응답은 deepLink 를 `target.route` 안에 담아 내려준다(notifications.service.ts list()).
// 최상위 `deepLink`/`route` 로 읽으면 undefined 라 "딥링크 없음"으로 오판한다.
const route = arrived.target?.route ?? null;
console.log(`notification: ok — route=${route} body="${arrived.body}"`);
assert(typeof route === 'string' && route.length > 0, `알림 딥링크가 비어 있음 — target=${JSON.stringify(arrived.target)}`);

// --- 4) 화면: 리더 시점 승인 카드 3폭 캡처 ---
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
  { name: 'teameet_v1_session', value: attestorSession, domain: 'alpha.teameet.co.kr', path: '/' },
]);
// 승인함은 로컬 세션 힌트가 있을 때만 /auth/me probe 를 보낸다(비로그인 401 소음 방지) —
// 실제 로그인 플로우가 심는 값이라, 쿠키만 심는 하네스도 같이 심어야 실사용과 같아진다.
// (이 한 줄이 없어 첫 실측에서 카드가 안 떴다 — 제품 결함이 아니라 하네스 갭이었다.)
await context.addInitScript(() => {
  window.localStorage.setItem('teameet.v1.session', 'active');
});
const url = `${BASE}/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}`;
for (const [label, width, height] of [
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['desktop-1440', 1440, 900],
]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const cardVisible = await page.getByText('기록 연결 승인 요청').isVisible().catch(() => false);
  console.log(`page ${label}: attest-card=${cardVisible ? 'visible' : 'MISSING'}`);
  await page.screenshot({ path: `${OUT}/attest-card-${label}.png`, fullPage: true });
  assert(cardVisible, `${label} 에서 승인 카드가 보이지 않음`);
  await page.close();
  await new Promise((r) => setTimeout(r, 400));
}

// --- 4-b) 알림 딥링크 착지: 리그 대진은 /team-matches/:id 가 리그 상세로 redirect 된다.
// 스트리밍 SSR 의 redirect 는 raw fetch 로 200 이 오므로 **브라우저 최종 URL**로 판정한다.
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const landed = page.url();
  const cardVisible = await page.getByText('기록 연결 승인 요청').isVisible().catch(() => false);
  console.log(`deeplink landing: ${landed} attest-card=${cardVisible ? 'visible' : 'MISSING'}`);
  assert(
    landed.includes(`/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}`),
    `알림 딥링크가 리그 경기 상세로 착지하지 않음 — ${landed}`,
  );
  assert(cardVisible, '알림에서 착지한 화면에 승인 카드가 없음');
  await page.close();
}
await browser.close();

// --- 5) 거절(reject)로 종결 → 승인함에서 사라짐 (원상 복구) ---
const attestCommandId = `attest-verify-decide-${Date.now()}`;
const decided = await api(
  `/games/${gameId}/participants/${candidate.participantId}/identity-link-requests/${row.requestId}/attest`,
  {
    session: attestorSession,
    method: 'POST',
    body: { expectedVersion: pending.data.version, clientCommandId: attestCommandId, decision: 'reject' },
    idempotencyKey: attestCommandId,
  },
);
console.log(`attest(reject): ${decided.status} ${decided.code ?? ''}`);
assert(decided.status === 200 || decided.status === 201, `거절이 실패 — ${decided.status} ${decided.code}`);

const after = await api(`/games/${gameId}/identity-link-requests/pending`, { session: attestorSession });
const remains = (after.data?.requests ?? []).some((r) => r.requestId === row.requestId);
assert(!remains, '거절 후에도 승인함에 요청이 남아 있음');
console.log('after-reject: pending cleared — done ->', OUT);
