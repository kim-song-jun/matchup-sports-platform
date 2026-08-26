/**
 * BRACKET-6 라이브 검증 — alpha 에서 경기를 시작한 뒤 **사유 없이 몰수 종료를 시도**해
 * 422 `GAME_OUTCOME_NOTE_REQUIRED` 로 막히는지, 사유를 실으면 통과하고 공개 API 에
 * `outcome` 이 노출되는지 확인한다.
 *
 * 1차 대회(2026-08-15~16) 회고 "몰수·중단 등 특수 상황 처리" — 그전에는 운영자가 임의
 * 점수를 수기 입력하는 것뿐이라 정상 종료와 구분되지 않았고 "왜 그 점수인지" 근거가
 * 남지 않았다. 2026-08-23 사용자 결정(Q3-B)은 표준 스코어 자동 부여가 아니라
 * **운영자 입력 + 사유 필수**였으므로, 이 스크립트의 핵심 판정은 **사유 없는 몰수가
 * 실제로 막히는가** 하나다.
 *
 * 검증 순서:
 *   1. start (필요하면)
 *   2. end + outcomeReason=FORFEIT, 사유 없음 → 422 GAME_OUTCOME_NOTE_REQUIRED 기대
 *   3. end + outcomeReason=FORFEIT + 사유      → 201 기대
 *   4. 공개 API 에 outcome{reason, note} 노출 확인
 *
 * `verify-alpha-period-break.mjs` 의 로그인·takeover 규약을 그대로 따른다
 * (takeover 는 Socket.IO `/game-operations` 로만 발급, Idempotency-Key = clientCommandId).
 *
 * 자격증명은 파일에 넣지 않는다(이 저장소는 public):
 *   ALPHA_EMAIL=... ALPHA_PASSWORD=... TOURNAMENT_ID=... FIXTURE_ID=... \
 *     node scripts/verify-alpha-forfeit-end.mjs
 *
 * STOP_BEFORE_END=1 이면 라이브 상태로 두고 멈춘다(화면 캡처용).
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { io } = require_('socket.io-client');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const B = `${ORIGIN}/api/v1`;
const TOURNAMENT = process.env.TOURNAMENT_ID;
const FIXTURE = process.env.FIXTURE_ID;
const STOP_BEFORE_END = process.env.STOP_BEFORE_END === '1';

for (const [k, v] of Object.entries({
  ALPHA_EMAIL: process.env.ALPHA_EMAIL,
  ALPHA_PASSWORD: process.env.ALPHA_PASSWORD,
  TOURNAMENT_ID: TOURNAMENT,
  FIXTURE_ID: FIXTURE,
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
  return { status: res.status, json, text };
}

async function login() {
  const res = await fetch(`${B}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  const found = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('teameet_v1_session='));
  if (!found) throw new Error(`login 실패 (HTTP ${res.status})`);
  cookie = found;
  console.log(`로그인 OK — 배포 커밋 ${res.headers.get('x-teameet-commit')?.slice(0, 8)}`);
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
  return api(
    'POST',
    `/games/${gameId}/commands/${name}`,
    { expectedVersion: version, clientCommandId: id, takeoverToken: token, occurredAt: new Date().toISOString(), payload },
    { 'idempotency-key': id },
  );
}

async function main() {
  await login();
  const pub = (await api('GET', `/tournaments/${TOURNAMENT}/matches/${FIXTURE}`)).json?.data;
  const gameId = pub?.gameId;
  console.log(`\n경기 ${FIXTURE} status=${pub?.status} game=${gameId}`);

  let g = (await api('GET', `/games/${gameId}`)).json?.data;
  const { token, socket } = await takeover(gameId);
  try {
    if (g.state === 'SCHEDULED') {
      const r = await command(gameId, 'start', token, g.version);
      console.log(`  ▶ start: HTTP ${r.status}`);
      if (r.status >= 400) throw new Error(`start 실패: ${r.text.slice(0, 200)}`);
      g = (await api('GET', `/games/${gameId}`)).json?.data;
    }
    console.log(`  게임 상태: ${g.state} v${g.version}`);

    if (STOP_BEFORE_END) {
      console.log('\nSTOP_BEFORE_END=1 — 라이브 상태로 두고 멈춥니다(캡처용).');
      return;
    }

    // ── 판정 1: 사유 없는 몰수는 막혀야 한다 ──────────────────────────────
    console.log('\n[판정1] 사유 없이 몰수 종료 → 422 GAME_OUTCOME_NOTE_REQUIRED 기대');
    const noNote = await command(gameId, 'end', token, g.version, { outcomeReason: 'FORFEIT' });
    console.log(
      noNote.status === 422 && noNote.json?.code === 'GAME_OUTCOME_NOTE_REQUIRED'
        ? `  ✅ 막힘 — ${noNote.json.message}`
        : `  ❌ 기대와 다름: HTTP ${noNote.status} ${noNote.text.slice(0, 200)}`,
    );

    // ── 판정 2: 알 수 없는 사유 값도 막혀야 한다 ──────────────────────────
    console.log('\n[판정2] 알 수 없는 사유 값 → 422 GAME_OUTCOME_REASON_INVALID 기대');
    const badReason = await command(gameId, 'end', token, g.version, {
      outcomeReason: 'WALKOVER',
      outcomeNote: '아무말',
    });
    console.log(
      badReason.status === 422 && badReason.json?.code === 'GAME_OUTCOME_REASON_INVALID'
        ? '  ✅ 막힘'
        : `  ❌ 기대와 다름: HTTP ${badReason.status} ${badReason.text.slice(0, 200)}`,
    );

    // ── 판정 3: 사유를 실으면 통과한다 ────────────────────────────────────
    console.log('\n[판정3] 사유와 함께 몰수 종료 → 201 기대');
    const ok = await command(gameId, 'end', token, g.version, {
      outcomeReason: 'FORFEIT',
      outcomeNote: '원정팀이 킥오프 15분 경과까지 미출석 (alpha 검증)',
    });
    console.log(
      ok.status < 400 ? `  ✅ 종료됨 (v${g.version}→v${ok.json?.data?.version})` : `  ❌ HTTP ${ok.status} ${ok.text.slice(0, 300)}`,
    );
  } finally {
    socket.close();
  }

  // ── 판정 4: 공개 API 가 outcome 을 노출하는가 ────────────────────────────
  const after = (await api('GET', `/tournaments/${TOURNAMENT}/matches/${FIXTURE}`)).json?.data;
  console.log(
    `\n[판정4] 공개 API outcome = ${JSON.stringify(after?.outcome)} (status=${after?.status} scoreStatus=${after?.scoreStatus})`,
  );
  console.log(
    '  ※ outcome 은 공식 결과가 공개된 뒤에만 노출된다 — 확정 전이면 null 이 정상이다.',
  );
}

main().catch((err) => {
  console.error(`\n실패: ${err.message}`);
  process.exit(1);
});
