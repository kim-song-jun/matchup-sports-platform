/**
 * alpha 리그 알림 실측 — Wave 3 이 연결한 3개 시점이 실제로 발송되는지 확인한다.
 *
 * 감사 H-1: 팀장 계정 알림 30건이 전부 "팀 매치 라인업을 확인해 주세요" 한 종류였고
 * 리그 관련은 0건이었다. 그래서 이 검증의 판정 기준은 **"리그 알림이 새로 생겼는가"** 다.
 *
 * 절차:
 *   1) 팀장 계정의 알림 baseline 을 찍는다(개수 + 최신 id).
 *   2) 운영자로 리그 체계 -> 시즌 -> 대진을 만든다(= 배정 알림 트리거).
 *   3) 팀장 알림을 다시 찍어 **새로 생긴 것만** 비교한다.
 *
 * 사용법:
 *   ALPHA_PASSWORD=... ALPHA_ADMIN_EMAIL=... ALPHA_CAPTAIN_EMAIL=... \
 *   node scripts/verify_alpha_league_notifications.mjs
 */
const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const PASSWORD = process.env.ALPHA_PASSWORD;
const ADMIN = process.env.ALPHA_ADMIN_EMAIL;
const CAPTAIN = process.env.ALPHA_CAPTAIN_EMAIL;
if (!PASSWORD || !ADMIN || !CAPTAIN) {
  console.error('ALPHA_PASSWORD / ALPHA_ADMIN_EMAIL / ALPHA_CAPTAIN_EMAIL 환경변수가 필요해요.');
  process.exit(1);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error('세션 쿠키를 못 받았어요.');
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

const H = (t, extra = {}) => ({ cookie: `teameet_v1_session=${t}`, ...extra });
const JSON_H = (t) => H(t, { 'content-type': 'application/json' });

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: body ? JSON_H(token) : H(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: parsed };
}

/** 알림 목록을 (id -> {type,title,body}) 로 스냅샷한다. */
async function snapshotNotifications(token) {
  const r = await api(token, 'GET', '/notifications?limit=20');
  const items = r.body?.data?.items ?? [];
  // 키는 notificationId 다 — `n.id` 로 잡으면 전부 undefined 라 Map 이 1건으로 뭉개진다.
  return new Map(items.map((n) => [n.notificationId, { type: n.type, title: n.title, body: n.body, createdAt: n.createdAt, route: n.target?.route }]));
}

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6);
const log = [];
const note = (step, msg) => { const line = `[${step}] ${msg}`; log.push(line); console.log(line); };

const adminToken = await login(ADMIN);
const captainToken = await login(CAPTAIN);

// ── 1. baseline ────────────────────────────────────────────────
const before = await snapshotNotifications(captainToken);
const beforeTypes = {};
for (const n of before.values()) beforeTypes[n.type] = (beforeTypes[n.type] ?? 0) + 1;
note('1-baseline', `팀장 알림 ${before.size}건 · 타입 분포 ${JSON.stringify(beforeTypes)}`);
note('1-baseline', `리그 관련 문구 포함: ${[...before.values()].filter((n) => /리그|승강|승격|강등/.test(`${n.title}${n.body}`)).length}건`);

// ── 2. 리그를 만들고 대진을 생성한다 (배정 알림 트리거) ─────────────
const sports = await api(adminToken, 'GET', '/master/sports');
const regions = await api(adminToken, 'GET', '/master/regions');
const futsal = (sports.body?.data?.sports ?? []).find((s) => s.code === 'futsal');
const region = (regions.body?.data?.regions ?? []).flatMap((r) => r.children ?? []).find((d) => d.name === '강남구');
if (!futsal || !region) {
  note('2-리그', `종목/지역 조회 실패 — sports=${sports.status} regions=${regions.status}. 수동 확인 필요`);
  process.exit(1);
}

// 팀장이 소유한 팀 2개를 참가시켜야 팀장에게 알림이 간다.
const myTeams = await api(captainToken, 'GET', '/me/teams');
const teamRows = myTeams.body?.data?.items ?? myTeams.body?.data ?? [];
const captainTeamIds = teamRows.map((t) => t.teamId ?? t.id).filter(Boolean);
note('2-리그', `팀장 소속 팀 ${captainTeamIds.length}개`);
if (captainTeamIds.length < 2) {
  note('2-리그', '팀장이 2팀 이상 소속이어야 대진이 생긴다 — 중단');
  process.exit(1);
}

let leagueId = process.env.LEAGUE_ID;
if (leagueId) {
  note('2-리그', `기존 리그 재사용 ${leagueId}`);
} else {
const created = await api(adminToken, 'POST', '/admin/league-matches', {
  title: `(테스트) 알림검증 ${stamp}`,
  sportId: futsal.sportId ?? futsal.id,
  regionId: region.regionId ?? region.id,
  startsOn: new Date(Date.now() + 7 * 864e5).toISOString(),
  endsOn: new Date(Date.now() + 60 * 864e5).toISOString(),
  teamIds: captainTeamIds.slice(0, 2),
});
note('2-리그', `리그 생성 → ${created.status} ${created.body?.data?.leagueId ?? JSON.stringify(created.body).slice(0, 200)}`);
if (created.status >= 400) process.exit(1);
leagueId = created.body.data.leagueId;
}

const fixtures = await api(adminToken, 'POST', `/admin/league-matches/${leagueId}/fixtures`, { weeksCount: 1 });
note('3-대진', `대진 생성 → ${fixtures.status} (대진 ${fixtures.body?.data?.fixtures?.length ?? '?'}건)`);
if (fixtures.status >= 400) note('3-대진', `본문: ${JSON.stringify(fixtures.body).slice(0, 300)}`);

// 알림은 커밋 후 비동기 발송이라 잠깐 기다린다.
await new Promise((r) => setTimeout(r, 6000));

// ── 3. 새로 생긴 알림만 비교 ────────────────────────────────────
const after = await snapshotNotifications(captainToken);
const fresh = [...after.entries()].filter(([id]) => !before.has(id)).map(([, n]) => n);
note('4-결과', `새로 생긴 알림 ${fresh.length}건`);
for (const n of fresh) note('4-결과', `  · [${n.type}] ${n.title} / ${String(n.body).slice(0, 70)} → ${n.route ?? '-'}`);

const leagueRelated = fresh.filter((n) => /리그|승강|승격|강등/.test(`${n.title}${n.body}`));
note('판정', `리그 관련 신규 알림 ${leagueRelated.length}건 — ${leagueRelated.length > 0 ? 'H-1 해소 확인' : '아직 0건 (미해소)'}`);

console.log(`\n생성한 리그: ${BASE}/league-matches/${leagueId}`);
