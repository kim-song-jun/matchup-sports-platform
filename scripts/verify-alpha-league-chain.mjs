// alpha 실측 — 리그 "명단 → 라인업 → 결과 → 전적" 연결이 끊기지 않았는지 검증하는 하네스.
//
// 특정 PR 이 아니라 **그 연결 자체**를 지킨다. 실제로 이 하네스가 서로 다른 시점의 회귀를
// 두 번 잡았다: 최초 연결 복구, 그리고 라인업 state 필터가 결과 입력 명단을 비운 회귀.
//
// 감사(2026-08-26)에서 실측한 증상을 **같은 방법으로 다시 재서** 사라졌는지 확인한다.
// 판정은 화면 육안이 아니라 공개/운영 API 가 실제로 돌려주는 값으로 한다.
//
// 사용:
//   ALPHA_PASSWORD=... node scripts/verify-alpha-league-chain.mjs
//   ALPHA_PASSWORD=... LEGACY_LEAGUE_ID=<수정 전 데이터> node scripts/verify-alpha-league-chain.mjs
//
// 수정 전 기준선(2026-08-26 실측):
//   F1 A팀 참가자 14 → 21 → 28명(같은 선수 최대 3회) · F2 미연결 25/25 → 32/32
//   F3 events 0건 · 득점왕 goals:[] hiddenByEligibility:true
import { randomUUID } from 'node:crypto';

const BASE = 'https://alpha.teameet.co.kr';
const PASSWORD = process.env.ALPHA_PASSWORD;
if (!PASSWORD) throw new Error('ALPHA_PASSWORD 필요');

const ADMIN = 'alpha.e2e.admin@teameet.test';
const CAPTAIN_A = 'alpha.e2e.captain.a@teameet.test';
const TEAM_A = '00620e9d-b432-4a59-98ef-68afcac31c8b';
const TEAM_B = 'ea0e4cf0-34ab-411c-ac89-5b931f25e781';
const SPORT_FUTSAL = 'b60abf1d-0caf-477e-ba61-d51984e63151';
const REGION_L2 = '5db9ccb1-b68f-441b-b42b-2b530550450d';

/**
 * E2E 계정은 닉네임과 이메일이 규칙적으로 대응한다(E2E선수01 → alpha.e2e.player01@).
 * 라인업 후보 응답이 이메일을 안 주므로 닉네임에서 되짚는다 — 규칙에 안 맞으면 null 을
 * 돌려 호출부가 그 사람을 실패로 기록하게 한다(조용히 건너뛰지 않는다).
 */
function emailForNickname(displayName) {
  const player = /^E2E선수(\d{2})$/.exec(displayName ?? '');
  if (player) return `alpha.e2e.player${player[1]}@teameet.test`;
  if (displayName === 'E2E팀장A') return CAPTAIN_A;
  if (displayName === 'E2E팀장B') return 'alpha.e2e.captain.b@teameet.test';
  const invitee = /^E2E초대(\d)$/.exec(displayName ?? '');
  if (invitee) return `alpha.e2e.invitee${invitee[1]}@teameet.test`;
  return null;
}

/**
 * 리그 기간은 **오늘 기준 상대 날짜**로 만든다. 고정 문자열을 쓰면 그 날짜가 지나는 순간
 * 하네스가 스스로 깨진다 — 이 저장소에서 고정 날짜를 쓴 스펙이 실시간이 지나 red 가 된
 * 사고가 이미 있었다(league-match-dispute.service.spec.ts 의 7일 이의 기간).
 * 대진은 아래에서 요일·시각으로 잡히므로 시작일은 내일, 종료일은 8주 뒤로 넉넉히 둔다.
 */
const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
const dayFromNow = (days) => KST_DAY.format(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
const leagueStartsOn = dayFromNow(1);
const leagueEndsOn = dayFromNow(56);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
};

// 같은 실행 안에서 같은 계정을 두 번 로그인하지 않는다. alpha 는 로그인에 rate limit 이
// 있어(429), 이 하네스를 연달아 돌리면 캡틴 로그인부터 막힌다.
const tokenCache = new Map();

async function login(email) {
  const cached = tokenCache.get(email);
  if (cached) return cached;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    lastStatus = res.status;
    const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('teameet_v1_session='));
    if (cookie) {
      const token = cookie.slice('teameet_v1_session='.length).split(';')[0];
      tokenCache.set(email, token);
      return token;
    }
    if (res.status !== 429) break;
    // Retry-After 를 주면 그 값을, 아니면 지수 백오프. 429 를 즉시 실패로 읽으면
    // "계정이 잘못됐다"는 엉뚱한 결론이 난다.
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * 2 ** attempt;
    console.log(`  429 — ${email} ${Math.round(waitMs / 1000)}초 대기 후 재시도`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`login failed ${email}: ${lastStatus}`);
}

async function api(path, { token, method = 'GET', body, idem } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.cookie = `teameet_v1_session=${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 비 JSON 응답(502 등)은 raw 로 남긴다 — 배포 창에 걸린 것을 결함으로 오진하지 않기 위해 */
  }
  return { status: res.status, json, raw: text.slice(0, 300) };
}

const dupNames = (players) => {
  const seen = new Map();
  for (const p of players) seen.set(p.name, (seen.get(p.name) ?? 0) + 1);
  return Object.fromEntries([...seen].filter(([, n]) => n > 1));
};

// ── 0. 배포 창 회피 — 서빙 중인 커밋을 먼저 확인한다 ─────────────────────────
const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
console.log('serving commit:', head.headers.get('x-teameet-commit') ?? '(없음)');
const health = await api('/health');
if (health.json?.data?.checks?.db !== true) {
  throw new Error(`health 비정상 — 배포 중일 수 있다: ${health.raw}`);
}

const admin = await login(ADMIN);
const captain = await login(CAPTAIN_A);

// ── 1. 새 리그·대진 생성 ────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(11, 16).replace(':', '');
const created = await api('/admin/league-matches', {
  token: admin,
  method: 'POST',
  body: {
    title: `(테스트) 연결복구 검증 ${stamp}`,
    sportId: SPORT_FUTSAL,
    regionId: REGION_L2,
    startsOn: leagueStartsOn,
    endsOn: leagueEndsOn,
    teamIds: [TEAM_A, TEAM_B],
  },
});
const leagueId = created.json?.data?.leagueId;
if (!leagueId) throw new Error(`리그 생성 실패: ${created.status} ${created.raw}`);

const gen = await api(`/admin/league-matches/${leagueId}/fixtures`, {
  token: admin,
  method: 'POST',
  body: {
    weeksCount: 1,
    schedule: { dayOfWeek: 3, time: '22:00' },
    placeName: '(테스트) 연결복구 구장',
    timing: { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 1 },
  },
});
const fixtureId = gen.json?.data?.teamMatchIds?.[0];
if (!fixtureId) throw new Error(`대진 생성 실패: ${gen.status} ${gen.raw}`);
console.log(`league=${leagueId} fixture=${fixtureId}\n`);

// ── 2. F2 기준선 — 자동 로스터에는 연결이 없어야 한다(뛴 적 없는 사람) ──────
const before = await api(`/league-matches/${leagueId}/fixtures/${fixtureId}/claimable-participants`, { token: captain });
const beforeUnlinked = before.json?.data?.participants?.length ?? -1;
const beforeIds = new Set((before.json?.data?.participants ?? []).map((p) => p.participantId));

// ── 3. 라인업 저장 2회 — 수정 전에는 여기서 중복이 쌓였다 ───────────────────
const lineupGet = await api(`/team-matches/${fixtureId}/lineup`, { token: captain });
const eligible = lineupGet.json?.data?.eligibleMembers ?? [];
if (eligible.length < 7) throw new Error(`라인업 후보 부족: ${eligible.length}명`);
// starters/bench 는 RSVP 단계 뒤에서 정한다(아래) — 참석 응답에 성공한 사람만 넣어야
// 라인업 저장이 출석 게이트를 통과한다.

// 2026-08-27: 리그 대진 생성이 팀일정을 함께 만들도록 바뀌면서(감사 L-B, "매치가 곧 팀일정")
// 라인업 저장에 출석 게이트가 걸리게 됐다 — team-match-lineup.service.ts 는 그 팀매치의
// v1TeamSchedule 이 있을 때만 "참석(GOING) 응답한 팀원만" 을 요구한다. 전에는 리그 대진에
// 팀일정 자체가 없어 이 검사를 그냥 지나쳤다. 출석은 본인만 설정할 수 있으므로
// (PUT .../attendance/me), 실제 사용자 흐름 그대로 선수별로 로그인해 응답시킨다.
// 목록 API 는 cursor/limit/from/to 만 받는다(teamMatchId 필터 없음) — 받아서 골라낸다.
const scheduleList = await api(`/teams/${TEAM_A}/schedules?limit=50`, { token: captain });
const scheduleItems = scheduleList.json?.data?.items ?? [];
const scheduleId = scheduleItems.find((it) => it.teamMatchId === fixtureId)?.id ?? null;
if (scheduleId === null) {
  throw new Error(
    `팀일정을 못 찾음(출석 응답 불가): status=${scheduleList.status} items=${scheduleItems.length} ` +
      `teamMatchId 보유=${scheduleItems.filter((it) => it.teamMatchId).length} raw=${scheduleList.raw}`,
  );
}
const rsvpFailures = [];
const rsvpBlocked = [];
const rsvpOk = [];
// 후보를 앞 N 명으로 자르지 않는다 — alpha 계정 일부는 휴대폰 미인증이라 응답 자체가
// 막히는데(403), 잘라 놓으면 인원이 모자란 채로 끝난다. 7명이 찰 때까지 계속 시도한다.
const RSVP_TARGET = 7;
for (const member of eligible) {
  if (rsvpOk.length >= RSVP_TARGET) break;
  const email = member.email ?? emailForNickname(member.displayName);
  if (!email) {
    rsvpFailures.push(`${member.displayName}: 이메일 추정 실패`);
    continue;
  }
  let memberToken;
  try {
    // alpha 는 짧은 시간에 로그인이 몰리면 429 를 준다([[alpha-rate-limits-heavy-capture]]).
    // 계정마다 간격을 둔다 — 없으면 뒤쪽 계정이 통째로 로그인 실패한다.
    await new Promise((r) => setTimeout(r, 1200));
    memberToken = await login(email);
  } catch (err) {
    rsvpFailures.push(`${member.displayName}: 로그인 ${String(err).slice(0, 50)}`);
    continue;
  }
  // 출석 PUT 은 expectedVersion(필수)과 Idempotency-Key(필수)를 요구한다. 현재 버전은
  // 일정 상세의 myAttendance 에서 읽는다 — 처음 응답하는 사람은 행이 없어 0 이다.
  const detail = await api(`/teams/${TEAM_A}/schedules/${scheduleId}`, { token: memberToken });
  const currentVersion = detail.json?.data?.myAttendance?.version ?? 0;
  const rsvp = await api(`/teams/${TEAM_A}/schedules/${scheduleId}/attendance/me`, {
    token: memberToken,
    method: 'PUT',
    idem: randomUUID(),
    body: { status: 'GOING', expectedVersion: currentVersion },
  });
  if (rsvp.status === 200) {
    rsvpOk.push(member.displayName);
  } else if (rsvp.json?.code === 'PHONE_VERIFICATION_REQUIRED') {
    // 계정 상태 문제지 제품 결함이 아니다 — 따로 세어 라인업 후보에서 뺀다.
    rsvpBlocked.push(member.displayName);
  } else {
    rsvpFailures.push(`${member.displayName}: ${rsvp.status} ${(rsvp.json?.code ?? rsvp.raw).toString().slice(0, 60)}`);
  }
}
record(
  'RSVP 선행 — 라인업 후보가 참석 응답을 마쳤다',
  rsvpFailures.length === 0 && rsvpOk.length >= 5,
  `GOING ${rsvpOk.length}명(${rsvpOk.join(',')})` +
    (rsvpBlocked.length ? ` · 휴대폰 미인증으로 제외 ${rsvpBlocked.length}명(${rsvpBlocked.join(',')})` : '') +
    (rsvpFailures.length ? ` · 실패 ${rsvpFailures.join(' | ')}` : ''),
);
if (rsvpOk.length < 5) {
  throw new Error(`참석 응답이 5명 미만이라 라인업을 구성할 수 없다: ${rsvpOk.length}명`);
}

const goingMembers = eligible.filter((m) => rsvpOk.includes(m.displayName));
const starters = goingMembers.slice(0, 5).map((m, i) => ({
  userId: m.userId,
  displayName: m.displayName,
  ...(i === 0 ? { goalkeeper: true } : {}),
}));
const bench = goingMembers.slice(5, 7).map((m) => ({ userId: m.userId, displayName: m.displayName }));

let revision = lineupGet.json?.data?.revision ?? 1;
for (let attempt = 0; attempt < 2; attempt += 1) {
  const saved = await api(`/team-matches/${fixtureId}/lineup`, {
    token: captain,
    method: 'PUT',
    idem: randomUUID(),
    body: { expectedVersion: revision, starters, bench },
  });
  if (saved.status !== 200) throw new Error(`라인업 저장 실패(${attempt}): ${saved.status} ${saved.raw}`);
  revision = saved.json.data.revision;
}

// ── 4. F1 — 결과 입력 목록에 같은 선수가 두 번 나오면 안 된다 ───────────────
const participants = await api(`/admin/league-matches/${leagueId}/fixtures/${fixtureId}/participants`, { token: admin });
const home = participants.json?.data?.home?.players ?? [];
const away = participants.json?.data?.away?.players ?? [];
const homeDup = dupNames(home);
const awayDup = dupNames(away);
record(
  'F1 결과 입력 목록 중복 없음 (라인업 2회 저장 후)',
  Object.keys(homeDup).length === 0 && Object.keys(awayDup).length === 0,
  `home ${home.length}명 중복 ${JSON.stringify(homeDup)} · away ${away.length}명 중복 ${JSON.stringify(awayDup)} (수정 전: 28명·최대 3회)`,
);

// ── 5. F2 — 라인업에 담긴 사람은 신원이 연결돼야 한다 ───────────────────────
const after = await api(`/league-matches/${leagueId}/fixtures/${fixtureId}/claimable-participants`, { token: captain });
const afterRows = after.json?.data?.participants ?? [];
const afterUnlinked = afterRows.length;
// **총량 비교는 판정식이 될 수 없다.** 라인업을 저장하면 참가자 행이 새로 생기므로(누적),
// 새 행이 전부 연결돼도 미연결 총수는 그대로일 수 있다 — 실제로 25 → 25 였고 그것을
// "연결 0건"으로 오독할 뻔했다. 올바른 술어는 **"라인업이 만든 새 참가자가 미연결로
// 남지 않았는가"**, 즉 미연결 집합이 저장 전 집합의 부분집합인가다.
const newlyClaimable = afterRows.filter((p) => !beforeIds.has(p.participantId));
// 2026-08-27 판정식 정정: 예전 조건은 `newlyClaimable === 0 && afterUnlinked > 0` 였다.
// 뒤 조건은 "대조군(미연결인 사람)이 남아 있어야 검사가 공허하지 않다"는 뜻이었는데,
// F2 뿌리(자동 로스터가 userId 를 안 실어 링크가 안 생김)가 고쳐지면서 **자동 로스터가
// 전원을 연결**해 미연결이 0 이 됐다 — 잘 고쳐진 결과가 FAIL 로 나왔다.
// 공허함은 다른 방법으로 막는다: 라인업에 실제로 사람이 들어갔는지(> 0)를 함께 본다.
record(
  'F2 라인업이 만든 참가자가 전부 신원 연결된다',
  newlyClaimable.length === 0 && home.length > 0,
  `홈 참가자 ${home.length}명 · 미연결 ${beforeUnlinked} → ${afterUnlinked}명 · ` +
    `라인업이 만든 새 참가자 중 미연결 ${newlyClaimable.length}명 ` +
    `(수정 전: 저장마다 7명씩 미연결로 쌓여 25 → 32)`,
);

// ── 6. 결과 확정 — 라인업 참가자 한 명에게 득점을 붙인다 ────────────────────
const scorer = home.find((p) => p.name === starters[1]?.displayName) ?? home[0];
const awayScorer = away[0];
const recorded = await api(`/admin/league-matches/${leagueId}/fixtures/${fixtureId}/result`, {
  token: admin,
  method: 'POST',
  idem: randomUUID(),
  body: {
    homeScore: 2,
    awayScore: 1,
    reason: '연결 복구 검증 실측',
    participants: [
      { participantId: scorer.participantId, goals: 2, assists: 0 },
      { participantId: awayScorer.participantId, goals: 1, assists: 0 },
    ],
  },
});
record('결과 확정 성공', recorded.status === 200 || recorded.status === 201, `${recorded.status} ${recorded.raw.slice(0, 120)}`);

// ── 7. F3 — 경기 기록 타임라인이 채워져야 한다 ──────────────────────────────
const rec = await api(`/league-matches/${leagueId}/fixtures/${fixtureId}/record`);
const events = rec.json?.data?.events;
record(
  'F3 공개 경기 기록에 득점 타임라인이 있다',
  Array.isArray(events) && events.length > 0,
  `events ${Array.isArray(events) ? events.length : 'null'}건 · score ${JSON.stringify(rec.json?.data?.score)} (수정 전: 0건)`,
);

// ── 8. F8 — 리그 범위 연결 안내 목록이 도달 가능하고 라벨이 파생 주차다 ─────
const claimable = await api(`/league-matches/${leagueId}/claimable-fixtures`, { token: captain });
const rows = claimable.json?.data?.fixtures ?? [];
record(
  'F8 claimable-fixtures 엔드포인트 도달 (라우트 404 아님)',
  claimable.status === 200,
  `HTTP ${claimable.status} · 대진 ${rows.length}건`,
);
record(
  'F8 라벨이 "<리그명> N주차" 파생형이다 (박제된 제목 아님)',
  rows.length === 0 || rows.every((row) => /\d+주차$/.test(row.title) && !/경기$/.test(row.title)),
  rows.length === 0 ? '연결 가능 대진 0건(전원 연결됨) — 라벨 검증 생략' : JSON.stringify(rows.map((r) => r.title)),
);

// ── 9. F4 — 무득점 출전 선수도 개인 기록 행으로 남아야 한다 ─────────────────
const players = await api(`/league-matches/${leagueId}/player-records`);
record(
  'F4/F2 득점왕 집계가 더 이상 자격 미달로 통째로 가려지지 않는다',
  players.json?.data?.hiddenByEligibility !== true || (players.json?.data?.goals?.length ?? 0) > 0,
  `goals ${JSON.stringify(players.json?.data?.goals?.map((g) => g.goals) ?? [])} · hiddenByEligibility=${players.json?.data?.hiddenByEligibility} (수정 전: [] / true)`,
);

// ── 10. 수정 전 데이터도 읽기 경로가 개선됐는지(선택) ───────────────────────
const legacy = process.env.LEGACY_LEAGUE_ID;
const legacyFixture = process.env.LEGACY_FIXTURE_ID;
if (legacy && legacyFixture) {
  const old = await api(`/admin/league-matches/${legacy}/fixtures/${legacyFixture}/participants`, { token: admin });
  const oldHome = old.json?.data?.home?.players ?? [];
  record(
    '수정 전 데이터도 목록 중복이 사라진다 (읽기 경로 개선)',
    Object.keys(dupNames(oldHome)).length === 0,
    `home ${oldHome.length}명 중복 ${JSON.stringify(dupNames(oldHome))}`,
  );
}

console.log(`\n=== ${results.filter((r) => r.ok).length}/${results.length} PASS ===`);
console.log(`검증 리그: ${leagueId} / 대진: ${fixtureId}`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
