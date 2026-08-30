/**
 * [P1-b] alpha 실측 — 대회 경기에서 라인업을 다시 저장해도 참가자 행이 유지되는지.
 *
 * 검증하는 계약 3개 (하나라도 깨지면 이 변경은 실패다):
 *   ① 재저장 후 참가자 **수가 안 늘어난다**
 *   ② 재저장 후 **participantId 가 그대로다** — 수만 세면 "지우고 같은 수만큼 다시 만든"
 *      경우를 못 잡으므로 id 를 직접 대조한다
 *   ③ 재저장 후 **`arrivedAt`(현장 명단 검인)이 보존된다** — 저장 사이에 체크인을 찍고 본다
 *
 * **반드시 `TOURNAMENT_FIXTURE` 경기로 재야 한다.** 이번 변경은 그 sourceType 한정이고,
 * TEAM_MATCH 는 `saveLineup` 입구에서 거부되므로(TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN)
 * 팀매치로 재면 아무것도 검증하지 못한 것이다.
 *
 * 자격증명은 **환경변수로만** 넘긴다(이 저장소는 PUBLIC):
 *   ALPHA_EMAIL / ALPHA_PASSWORD  또는  ALPHA_SESSION_TOKEN
 *   GAME_ID (선택) — 지정하면 그 경기로, 없으면 SCHEDULED 대회 경기를 찾는다
 *
 * 라인업 저장은 `game.state === 'SCHEDULED'` 동안 takeover 가 면제되므로 Socket.IO 가
 * 필요 없다(verify-alpha-period-break.mjs 의 검증된 전제).
 */
import { randomUUID } from 'node:crypto';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;

let SESSION = process.env.ALPHA_SESSION_TOKEN ?? '';

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(SESSION ? { cookie: `teameet_v1_session=${SESSION}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json, headers: res.headers };
}

async function login() {
  if (SESSION) return;
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  if (!email || !password) {
    throw new Error('ALPHA_SESSION_TOKEN 또는 ALPHA_EMAIL/ALPHA_PASSWORD 가 필요합니다');
  }
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const match = setCookie.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!match) throw new Error(`로그인 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  SESSION = match[1];
  console.log('로그인 OK');
}

async function getGame(gameId) {
  const res = await api('GET', `/games/${gameId}`);
  if (res.status !== 200) throw new Error(`게임 조회 실패 HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  return res.json?.data ?? res.json;
}

/**
 * 라인업 + 참가자를 읽는다. **`GET /games/:id` 에는 participants 가 안 실린다** --
 * `listLineups()`(`GET /games/:id/lineups`)가 참가자를 붙여 주는 유일한 경로다.
 * 여기서 잘못된 소스를 보면 "참가자 0명"이 나와 결함을 못 본다.
 */
async function getLineups(gameId) {
  const res = await api('GET', `/games/${gameId}/lineups`);
  if (res.status !== 200) throw new Error(`라인업 조회 실패 HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  const data = res.json?.data ?? res.json;
  return Array.isArray(data) ? data : (data?.items ?? data?.lineups ?? []);
}

/** 이 사이드의 참가자를 id·이름·검인시각만 뽑아 정렬해 돌려준다(대조용). */
function participantsOfSide(lineups, sideId) {
  const rows = [];
  for (const lineup of lineups) {
    if (lineup.sideId !== sideId) continue;
    for (const p of lineup.participants ?? []) {
      rows.push({
        id: p.id,
        lineupId: lineup.id,
        revision: lineup.revision,
        name: p.displayNameSnapshot,
        arrivedAt: p.arrivedAt ?? null,
      });
    }
  }
  return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function latestLineupOfSide(lineups, sideId) {
  return lineups
    .filter((l) => l.sideId === sideId)
    .sort((a, b) => a.revision - b.revision)
    .at(-1);
}

async function saveLineup(gameId, sideId, expectedVersion, participants) {
  const id = randomUUID();
  // 서버는 `Idempotency-Key` 헤더와 body 의 `clientCommandId` 가 같은 값이길 요구한다.
  return api(
    'PUT',
    `/games/${gameId}/lineups/${sideId}`,
    { expectedVersion, clientCommandId: id, formation: '1-2-1', participants },
    { 'idempotency-key': id },
  );
}

const ROSTER = [
  { displayNameSnapshot: 'P1b 검증 골키퍼', jerseyNumber: 1, position: 'GOLEIRO', started: true },
  { displayNameSnapshot: 'P1b 검증 수비', jerseyNumber: 2, position: 'FIXO', started: true },
  { displayNameSnapshot: 'P1b 검증 공격', jerseyNumber: 3, position: 'PIVO', started: true },
];

async function main() {
  await login();

  const gameId = process.env.GAME_ID;
  if (!gameId) {
    throw new Error('GAME_ID 가 필요합니다 — SCHEDULED 상태의 TOURNAMENT_FIXTURE 경기여야 합니다');
  }

  let game = await getGame(gameId);
  console.log(`\n경기: sourceType=${game.sourceType} state=${game.state} version=${game.version}`);
  if (game.sourceType !== 'TOURNAMENT_FIXTURE') {
    throw new Error(
      `sourceType=${game.sourceType} 로는 검증할 수 없습니다 — 이번 변경은 TOURNAMENT_FIXTURE 한정이고 ` +
        'TEAM_MATCH 는 saveLineup 입구에서 거부됩니다(팀매치로 재면 아무것도 검증 못 한 것).',
    );
  }
  if (game.state !== 'SCHEDULED') {
    throw new Error(`state=${game.state} — 라인업 저장은 SCHEDULED 동안만 가능합니다(LINEUP_DEADLINE_PASSED)`);
  }

  const sideId = game.sides?.[0]?.id;
  if (!sideId) throw new Error('사이드를 찾을 수 없습니다');
  console.log(`사이드: ${sideId} (${game.sides[0].sideKey})`);

  // ── 1차 저장 ────────────────────────────────────────────────────────────────
  let lineups = await getLineups(gameId);
  let expected = latestLineupOfSide(lineups, sideId)?.revision ?? 0;
  let res = await saveLineup(gameId, sideId, expected, ROSTER);
  if (res.status >= 400) {
    // 내 CAS 수정 덕에 409 의 currentVersion 이 실제 값이다 — 그걸로 한 번 재시도한다.
    const current = res.json?.details?.currentVersion;
    console.log(`1차 저장 HTTP ${res.status} — currentVersion=${current} 로 재시도`);
    if (typeof current !== 'number') throw new Error(`1차 저장 실패: ${res.text.slice(0, 300)}`);
    res = await saveLineup(gameId, sideId, current, ROSTER);
  }
  if (res.status >= 400) throw new Error(`1차 저장 실패: ${res.text.slice(0, 300)}`);
  console.log(`1차 저장 OK (HTTP ${res.status})`);

  lineups = await getLineups(gameId);
  const before = participantsOfSide(lineups, sideId);
  console.log(`\n[1차 저장 후] 참가자 ${before.length}명`);
  console.table(before.map((p) => ({ id: p.id.slice(0, 8), rev: p.revision, name: p.name, arrivedAt: p.arrivedAt })));

  // ── 체크인 1건 ──────────────────────────────────────────────────────────────
  const target = before[0];
  const arrivalRes = await api('PATCH', `/games/${gameId}/participants/${target.id}/arrival`, { arrived: true });
  console.log(`\n체크인 (${target.name}): HTTP ${arrivalRes.status} ${arrivalRes.text.slice(0, 200)}`);
  if (arrivalRes.status >= 400) throw new Error('체크인 실패 — arrivedAt 보존을 검증할 수 없습니다');

  lineups = await getLineups(gameId);
  const checkedIn = participantsOfSide(lineups, sideId).find((p) => p.id === target.id);
  console.log(`체크인 반영: ${checkedIn?.arrivedAt}`);
  if (!checkedIn?.arrivedAt) throw new Error('체크인이 반영되지 않았습니다');

  // ── 2차 저장(같은 명단) ─────────────────────────────────────────────────────
  expected = latestLineupOfSide(lineups, sideId)?.revision ?? 0;
  res = await saveLineup(gameId, sideId, expected, ROSTER);
  if (res.status >= 400) throw new Error(`2차 저장 실패: ${res.text.slice(0, 300)}`);
  console.log(`\n2차 저장 OK (HTTP ${res.status})`);

  lineups = await getLineups(gameId);
  const after = participantsOfSide(lineups, sideId);
  console.log(`\n[2차 저장 후] 참가자 ${after.length}명`);
  console.table(after.map((p) => ({ id: p.id.slice(0, 8), rev: p.revision, name: p.name, arrivedAt: p.arrivedAt })));

  // ── 판정 ────────────────────────────────────────────────────────────────────
  const results = [];
  results.push({
    계약: '① 참가자 수 불변',
    기대: before.length,
    실제: after.length,
    판정: before.length === after.length ? 'PASS' : 'FAIL',
  });

  const beforeIds = before.map((p) => p.id).join(',');
  const afterIds = after.map((p) => p.id).join(',');
  results.push({
    계약: '② participantId 동일',
    기대: beforeIds.slice(0, 40) + '…',
    실제: afterIds.slice(0, 40) + '…',
    판정: beforeIds === afterIds ? 'PASS' : 'FAIL',
  });

  const afterTarget = after.find((p) => p.id === target.id) ?? after.find((p) => p.name === target.name);
  results.push({
    계약: '③ arrivedAt 보존',
    기대: checkedIn.arrivedAt,
    실제: afterTarget?.arrivedAt ?? '(없음)',
    판정: afterTarget?.arrivedAt === checkedIn.arrivedAt ? 'PASS' : 'FAIL',
  });

  console.log('\n=== 판정 ===');
  console.table(results);

  const failed = results.filter((r) => r.판정 === 'FAIL');
  if (failed.length > 0) {
    console.error(`\n실패 ${failed.length}건`);
    process.exit(1);
  }
  console.log('\n3개 계약 전부 PASS');
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
