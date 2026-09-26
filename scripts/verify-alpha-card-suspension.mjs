/**
 * DISCIPLINE-1 라이브 검증 — alpha 에서 실제로 레드카드를 기록하고, **그 선수가 같은
 * 대회의 다음 경기 라인업에 선발로 들어가지 못하는지**를 확인한다.
 *
 * 1차 대회(2026-08-15~16) 회고 "옐로카드 누적, 레드카드 퇴장등 필요해보임" —
 * 그전에는 라인업 제출이 정지 여부를 전혀 검사하지 않아 퇴장당한 선수가 다음 경기에
 * 그대로 뛸 수 있었다. 이 스크립트가 검증하는 계약이 정확히 그 지점이다.
 *
 * 흐름:
 *   1. 경기 A: 양 사이드 라인업 제출 → start → CARD(RED) 기록 → end (공식 결과 생성)
 *   2. 경기 B(같은 대회): 그 선수를 **선발**로 넣어 제출 → 400 `DISCIPLINE_SUSPENDED` 기대
 *   3. 대조군: 그 선수를 뺀 라인업 제출 → 성공해야 한다(거짓 양성 없음)
 *
 * `verify-alpha-period-break.mjs` 의 로그인·takeover·커맨드 규약을 그대로 따른다:
 *  - TOURNAMENT_FIXTURE 커맨드는 takeover 토큰 필수, 발급은 Socket.IO
 *    `/game-operations` 의 `game.takeover.request` 하나뿐이다.
 *  - `Idempotency-Key` 헤더 = body 의 `clientCommandId` (다르면 422).
 *  - 라인업 참가자에 `started: boolean` 필수.
 *
 * **정지 판정은 userId 기준**이므로 라인업 참가자에 `userId` 를 반드시 실어야 한다
 * (이름만 있는 참가자는 대회 누적을 셀 수 없어 판정 대상에서 빠진다).
 *
 * 자격증명은 파일에 넣지 않는다(이 저장소는 public):
 *   ALPHA_EMAIL=... ALPHA_PASSWORD=... TOURNAMENT_ID=... FIXTURE_A=... FIXTURE_B=... \
 *     node scripts/verify-alpha-card-suspension.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { io } = require_('socket.io-client');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const B = `${ORIGIN}/api/v1`;
const TOURNAMENT = process.env.TOURNAMENT_ID;
const FIXTURE_A = process.env.FIXTURE_A;
const FIXTURE_B = process.env.FIXTURE_B;

for (const [k, v] of Object.entries({
  ALPHA_EMAIL: process.env.ALPHA_EMAIL,
  ALPHA_PASSWORD: process.env.ALPHA_PASSWORD,
  TOURNAMENT_ID: TOURNAMENT,
  FIXTURE_A,
  FIXTURE_B,
})) {
  if (!v) {
    console.error(`${k} 환경변수가 필요합니다.`);
    process.exit(1);
  }
}

let cookie = '';

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 비-JSON 응답은 원문을 본다 */
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function login() {
  const res = await api('POST', '/auth/login', {
    email: process.env.ALPHA_EMAIL,
    password: process.env.ALPHA_PASSWORD,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  const found = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('teameet_v1_session='));
  if (!found) throw new Error(`login 실패 (HTTP ${res.status}): ${res.text.slice(0, 200)}`);
  cookie = found;
  console.log('로그인 OK');
}

const game = (id) => api('GET', `/games/${id}`).then((r) => r.json?.data ?? r.json);
const publicMatch = (fx) => api('GET', `/tournaments/${TOURNAMENT}/matches/${fx}`).then((r) => r.json?.data ?? null);
const roster = (fx, sideId) =>
  api('GET', `/tournaments/${TOURNAMENT}/fixtures/${fx}/lineup-roster?sideId=${sideId}`).then(
    (r) => r.json?.data?.players ?? [],
  );

/** 한 사이드의 라인업을 저장하고 제출한다. 참가자는 userId 를 반드시 싣는다. */
async function submitLineup(gameId, sideId, players, label) {
  const lineups = (await api('GET', `/games/${gameId}/lineups`)).json?.data ?? [];
  const mine = lineups.filter((l) => l.sideId === sideId).sort((x, y) => x.revision - y.revision).pop();
  const rev = mine?.revision ?? 0;
  const participants = players.map((p, i) => ({
    userId: p.userId,
    displayNameSnapshot: p.name,
    started: true,
    ...(i === 0 ? { position: 'GOLEIRO' } : {}),
  }));

  const saveId = randomUUID();
  const saved = await api(
    'PUT',
    `/games/${gameId}/lineups/${sideId}`,
    { expectedVersion: rev, clientCommandId: saveId, participants },
    { 'idempotency-key': saveId },
  );
  if (saved.status >= 400) {
    return { ok: false, stage: 'save', status: saved.status, code: saved.json?.code, message: saved.json?.message };
  }
  const lineupId = saved.json?.data?.lineupId;
  const newRev = saved.json?.data?.lineupRevision;

  const subId = randomUUID();
  const submitted = await api(
    'POST',
    `/games/${gameId}/lineups/${lineupId}/submit`,
    { expectedVersion: newRev, clientCommandId: subId },
    { 'idempotency-key': subId },
  );
  const ok = submitted.status < 400;
  console.log(
    `  [${label}] save=${saved.status} submit=${submitted.status}` +
      (ok ? '' : ` code=${submitted.json?.code} msg=${submitted.json?.message}`),
  );
  return { ok, stage: 'submit', status: submitted.status, code: submitted.json?.code, message: submitted.json?.message, lineupId };
}

async function takeover(gameId) {
  const clientInstanceId = randomUUID();
  const socket = io(`${ORIGIN}/game-operations`, {
    transports: ['websocket'],
    extraHeaders: { cookie },
    auth: { clientInstanceId, authorizationSubjectVersion: 0 },
  });
  const token = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('takeover 타임아웃(20s)')), 20_000);
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(new Error(`소켓 connect_error: ${e.message}`));
    });
    socket.on('connect', () => {
      socket.emit(
        'game.takeover.request',
        { gameId, authorizationSubjectVersion: 0, clientInstanceId, lastSequence: 0 },
        (ack) => {
          clearTimeout(timer);
          if (ack?.status === 'granted' && ack.takeoverToken) resolve(ack.takeoverToken);
          else reject(new Error(`takeover 거부: ${JSON.stringify(ack)}`));
        },
      );
    });
  });
  console.log(`  takeover OK (${String(token).slice(0, 10)}…)`);
  return { token, socket };
}

async function command(gameId, name, token, version, payload = {}) {
  const id = randomUUID();
  const res = await api(
    'POST',
    `/games/${gameId}/commands/${name}`,
    { expectedVersion: version, clientCommandId: id, takeoverToken: token, occurredAt: new Date().toISOString(), payload },
    { 'idempotency-key': id },
  );
  const body = res.json?.data ?? res.json;
  console.log(`  ▶ ${name}: HTTP ${res.status}${res.status >= 400 ? ' ' + res.text.slice(0, 200) : ` v${version}→v${body?.version}`}`);
  if (res.status >= 400) throw new Error(`${name} 실패`);
  return body?.version ?? version + 1;
}

async function appendRedCard(gameId, token, version, sideId, participantId) {
  const id = randomUUID();
  const res = await api(
    'POST',
    `/games/${gameId}/events`,
    {
      expectedVersion: version,
      // 이벤트 append 는 커맨드와 달리 `clientEventId` 를 쓴다 — `clientCommandId` 를
      // 보내면 400 VALIDATION_ERROR('should not exist') 로 거부된다(alpha 실측).
      clientEventId: id,
      takeoverToken: token,
      occurredAt: new Date().toISOString(),
      type: 'CARD',
      sideId,
      participantId,
      clockMs: 60_000,
      period: 1,
      payload: { card: 'RED' },
    },
    { 'idempotency-key': id },
  );
  const body = res.json?.data ?? res.json;
  console.log(`  ▶ CARD(RED): HTTP ${res.status}${res.status >= 400 ? ' ' + res.text.slice(0, 300) : ` v${version}→v${body?.version}`}`);
  if (res.status >= 400) throw new Error('CARD 기록 실패');
  return body?.version ?? version + 1;
}

async function main() {
  await login();

  // ── 1. 경기 A 를 진행해 레드카드를 남긴다 ──────────────────────────────
  const aPublic = await publicMatch(FIXTURE_A);
  const gameA = aPublic?.gameId;
  console.log(`\n경기 A ${FIXTURE_A} status=${aPublic?.status} game=${gameA}`);
  let ga = await game(gameA);

  if (ga.state === 'SCHEDULED') {
    for (const side of ga.sides ?? []) {
      const players = await roster(FIXTURE_A, side.id);
      if (players.length < 3) {
        console.log(`  [${side.sideKey}] 로스터 ${players.length}명 — 최소 인원 미달, 건너뜀`);
        continue;
      }
      await submitLineup(gameA, side.id, players.slice(0, 4), side.sideKey);
    }
    ga = await game(gameA);
  } else {
    console.log(`  이미 시작된 경기 (state=${ga.state}) — 라인업 단계 건너뜀`);
  }

  const homeSide = (ga.sides ?? []).find((s) => s.sideKey === 'HOME') ?? ga.sides?.[0];
  const lineups = (await api('GET', `/games/${gameA}/lineups`)).json?.data ?? [];
  const homeLineup = lineups
    .filter((l) => l.sideId === homeSide.id)
    .sort((x, y) => x.revision - y.revision)
    .pop();
  const victim = (homeLineup?.participants ?? []).find((p) => p.userId !== null);
  if (!victim) throw new Error('userId 가 실린 참가자가 없어 정지 판정을 검증할 수 없습니다.');
  console.log(`\n퇴장시킬 선수: ${victim.displayNameSnapshot} (userId=${victim.userId})`);

  const { token, socket } = await takeover(gameA);
  try {
    let v = ga.version;
    if (ga.state === 'SCHEDULED') v = await command(gameA, 'start', token, v);
    v = await appendRedCard(gameA, token, v, homeSide.id, victim.id);
    const cur = await game(gameA);
    if (cur.state === 'LIVE') await command(gameA, 'end', token, cur.version);
  } finally {
    socket.close();
  }

  const aAfter = await publicMatch(FIXTURE_A);
  console.log(`  경기 A 종료 상태: status=${aAfter?.status} scoreStatus=${aAfter?.scoreStatus}`);

  // ── 2. 경기 B 에 그 선수를 선발로 넣어 본다 ─────────────────────────────
  const bPublic = await publicMatch(FIXTURE_B);
  const gameB = bPublic?.gameId;
  console.log(`\n경기 B ${FIXTURE_B} status=${bPublic?.status} game=${gameB}`);
  const gb = await game(gameB);
  const bSide = (gb.sides ?? []).find((s) => s.sideKey === 'HOME') ?? gb.sides?.[0];
  const bRoster = await roster(FIXTURE_B, bSide.id);

  const withVictim = [
    bRoster.find((p) => p.userId === victim.userId),
    ...bRoster.filter((p) => p.userId !== victim.userId).slice(0, 3),
  ].filter(Boolean);
  if (withVictim.length < 3 || withVictim[0]?.userId !== victim.userId) {
    console.log('  ⚠ 경기 B 로스터에 그 선수가 없어 양성 케이스를 만들 수 없습니다.');
  } else {
    console.log('\n[양성 케이스] 정지 선수를 선발로 제출 → 400 DISCIPLINE_SUSPENDED 기대');
    const r = await submitLineup(gameB, bSide.id, withVictim, '정지선수 포함');
    console.log(
      r.status === 400 && r.code === 'DISCIPLINE_SUSPENDED'
        ? `  ✅ 차단됨 — ${r.message}`
        : `  ❌ 기대와 다름: status=${r.status} code=${r.code} msg=${r.message}`,
    );
  }

  console.log('\n[대조군] 정지 선수를 뺀 라인업 제출 → 성공 기대');
  const without = bRoster.filter((p) => p.userId !== victim.userId).slice(0, 4);
  const c = await submitLineup(gameB, bSide.id, without, '정지선수 제외');
  console.log(c.ok ? '  ✅ 통과 — 거짓 양성 없음' : `  ❌ 막힘: code=${c.code} msg=${c.message}`);
}

main().catch((err) => {
  console.error(`\n실패: ${err.message}`);
  process.exit(1);
});
