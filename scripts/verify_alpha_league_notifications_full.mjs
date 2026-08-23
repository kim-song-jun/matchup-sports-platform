/**
 * alpha 리그 알림 3종 전수 실측 — Wave 3 이 연결한 모든 시점을 한 번에 확인한다.
 *
 * 앞선 스크립트(verify_alpha_league_notifications.mjs)는 **대진 배정** 알림만 확인했다.
 * 이 스크립트는 시즌을 끝까지 밀어 나머지 둘까지 본다:
 *   ① 대진 배정      — 라운드로빈 생성 직후
 *   ② 결과 공식 확정 — 몰수 처리로 공식 결과를 만들면 team_match_completed 가 발송돼야 한다
 *   ③ 승격·강등 확정 — 시리즈 승강 commit 직후
 *
 * 판정은 **팀장 알림의 id 차집합**으로 한다 — 기존 알림에 섞여 착시가 생기지 않게.
 * 알림 수신자는 팀의 owner/manager 라, 팀장이 소유한 팀 4개로 2티어 시리즈를 만든다.
 *
 * 사용법:
 *   ALPHA_PASSWORD=... ALPHA_ADMIN_EMAIL=... ALPHA_CAPTAIN_EMAIL=... \
 *   node scripts/verify_alpha_league_notifications_full.mjs
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
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

const H = (t, extra = {}) => ({ cookie: `teameet_v1_session=${t}`, ...extra });

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: body ? H(token, { 'content-type': 'application/json' }) : H(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: parsed };
}

/** 알림 스냅샷 — 키는 notificationId 다(`id` 가 아니다). */
async function snap(token) {
  const r = await api(token, 'GET', '/notifications?limit=50');
  const items = r.body?.data?.items ?? [];
  return new Map(items.map((n) => [n.notificationId, {
    type: n.type, title: n.title, body: n.body, route: n.target?.route,
  }]));
}

const log = [];
const note = (s, m) => { const l = `[${s}] ${m}`; log.push(l); console.log(l); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** before 이후 새로 생긴 알림만 뽑는다. */
async function freshSince(token, before, label) {
  await wait(6000);
  const after = await snap(token);
  const fresh = [...after.entries()].filter(([id]) => !before.has(id)).map(([, n]) => n);
  note(label, `신규 알림 ${fresh.length}건`);
  for (const n of fresh) note(label, `  · [${n.type}] ${n.title} / ${String(n.body).slice(0, 64)} → ${n.route ?? '-'}`);
  return { after, fresh };
}

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6);
const adminToken = await login(ADMIN);
const capToken = await login(CAPTAIN);

// ── 준비: 종목·지역·팀 ────────────────────────────────────────────
const sports = await api(adminToken, 'GET', '/master/sports');
const regions = await api(adminToken, 'GET', '/master/regions');
const futsal = (sports.body?.data?.sports ?? []).find((s) => s.code === 'futsal');
const region = (regions.body?.data?.regions ?? []).flatMap((r) => r.children ?? []).find((d) => d.name === '강남구');
const myTeams = await api(capToken, 'GET', '/me/teams');
const owned = (myTeams.body?.data?.items ?? []).filter((t) => t.role === 'owner' || t.role === 'manager');
if (!futsal || !region || owned.length < 4) {
  note('준비', `실패 — futsal=${!!futsal} region=${!!region} 팀=${owned.length}`);
  process.exit(1);
}
const teamIds = owned.slice(0, 4).map((t) => t.teamId);
note('준비', `팀장 소유 팀 4개 사용: ${owned.slice(0, 4).map((t) => t.name).join(', ')}`);

// ── 시리즈 + 1시즌 시딩 ───────────────────────────────────────────
let seriesId = process.env.SERIES_ID;
if (seriesId) {
  note('1-시리즈', `기존 시리즈 재사용 ${seriesId}`);
} else {
const series = await api(adminToken, 'POST', '/admin/league-series', {
  title: `(테스트) 알림전수 ${stamp}`,
  sportId: futsal.id,
  regionId: region.id,
  tierCount: 2,
  promotionRule: { mode: 'ratio', ratio: 0.2, rounding: 'ceil', minSlots: 1 },
});
note('1-시리즈', `생성 → ${series.status} ${series.body?.data?.id ?? JSON.stringify(series.body).slice(0, 200)}`);
if (series.status >= 400) process.exit(1);
seriesId = series.body.data.id;

const seeded = await api(adminToken, 'POST', `/admin/league-series/${seriesId}/seasons/seed`, {
  tiers: [
    { tier: 1, title: `(테스트) 알림전수 ${stamp} 1시즌 1부`, teamIds: teamIds.slice(0, 2) },
    { tier: 2, title: `(테스트) 알림전수 ${stamp} 1시즌 2부`, teamIds: teamIds.slice(2, 4) },
  ],
});
note('2-시딩', `1시즌 시딩 → ${seeded.status}`);
if (seeded.status >= 400) { note('2-시딩', JSON.stringify(seeded.body).slice(0, 300)); process.exit(1); }
}

const detail = await api(adminToken, 'GET', `/admin/league-series/${seriesId}`);
const season1 = (detail.body?.data?.seasons ?? []).find((s) => s.seasonNo === 1);
const leagues = season1?.tiers ?? [];
note('2-시딩', `티어 리그 ${leagues.length}개`);

// ── ① 대진 배정 알림 ──────────────────────────────────────────────
let before = await snap(capToken);
for (const lg of leagues) {
  const f = await api(adminToken, 'POST', `/admin/league-matches/${lg.leagueId}/fixtures`, { weeksCount: 1 });
  note('3-대진', `${lg.tierLabel} 대진 생성 → ${f.status}`);
}
const r1 = await freshSince(capToken, before, '판정①-배정');
const ok1 = r1.fresh.some((n) => /리그 대진/.test(n.title));

// ── ② 결과 공식 확정 알림 (몰수로 공식 결과를 만든다) ──────────────
before = r1.after;
for (const lg of leagues) {
  const det = await api(adminToken, 'GET', `/admin/league-matches/${lg.leagueId}`);
  for (const fx of det.body?.data?.fixtures ?? []) {
    if (fx.status !== 'matched') continue;
    const res = await api(adminToken, 'POST', `/admin/league-matches/${lg.leagueId}/fixtures/${fx.teamMatchId}/forfeit`, {
      // DTO 필드명은 noShowTeamId 다(forfeitTeamId 는 400 VALIDATION_ERROR).
      noShowTeamId: fx.homeTeamId,
      reason: '알림 전수 검증 — 공식 결과 생성을 위한 몰수 처리',
    });
    note('4-몰수', `${lg.tierLabel} ${fx.teamMatchId.slice(0, 8)} → ${res.status}`);
    if (res.status >= 400) note('4-몰수', JSON.stringify(res.body).slice(0, 250));
  }
}
// 공식 결과 projection 은 워커가 비동기로 처리한다 — 조금 더 기다린다.
await wait(9000);
const r2 = await freshSince(capToken, before, '판정②-결과확정');
const ok2 = r2.fresh.some((n) => /경기 결과|결과가 확정|completed/i.test(`${n.title}${n.type}`));

// ── ③ 승강 확정 알림 ──────────────────────────────────────────────
before = r2.after;
const preview = await api(adminToken, 'POST', `/admin/league-series/${seriesId}/seasons/1/promotions/preview`, {});
note('5-승강', `preview → ${preview.status}`);
if (preview.status < 400) {
  const entries = (preview.body?.data?.tiers ?? []).flatMap((t) =>
    (t.entries ?? []).map((e) => ({ teamId: e.teamId, fromTier: e.tier, kind: e.computedKind })));
  note('5-승강', `대상 ${entries.length}팀: ${entries.map((e) => `${e.kind}`).join(',')}`);
  const commit = await api(adminToken, 'POST', `/admin/league-series/${seriesId}/seasons/1/promotions/commit`, { entries });
  note('5-승강', `commit → ${commit.status}`);
  if (commit.status >= 400) note('5-승강', JSON.stringify(commit.body).slice(0, 300));
} else {
  note('5-승강', JSON.stringify(preview.body).slice(0, 300));
}
const r3 = await freshSince(capToken, before, '판정③-승강');
const ok3 = r3.fresh.some((n) => /승격|강등|잔류|승강/.test(`${n.title}${n.body}`));

console.log('\n════ 최종 판정 ════');
console.log(` ① 대진 배정 알림      : ${ok1 ? '✅ 발송 확인' : '❌ 미확인'}`);
console.log(` ② 결과 공식 확정 알림 : ${ok2 ? '✅ 발송 확인' : '❌ 미확인'}`);
console.log(` ③ 승격·강등 확정 알림 : ${ok3 ? '✅ 발송 확인' : '❌ 미확인'}`);
console.log(`\n시리즈: ${BASE}/admin/league-series/${seriesId}`);
