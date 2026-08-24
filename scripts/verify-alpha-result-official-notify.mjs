/**
 * REACH-4 실배포 검증 — 예정 상태의 대회 픽스처를 운영 API 로 실제로 치르고
 * (라인업 → start → end), SUBMITTED 리비전을 officialize 한 뒤 **참가팀
 * 운영진에게 '대회 경기 결과가 확정됐어요' 알림이 실제로 도착하는지**를
 * 팀장 계정으로 실측한다.
 *
 * 자격증명은 파일에 넣지 않는다(이 저장소는 public):
 *   ALPHA_EMAIL/ALPHA_PASSWORD (관리자) + CAPTAIN_EMAIL/CAPTAIN_PASSWORD (팀장)
 *   TOURNAMENT_ID / FIXTURE_ID
 */
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';

const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { io } = require_('socket.io-client');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const B = `${ORIGIN}/api/v1`;
const TOURNAMENT = process.env.TOURNAMENT_ID;
const FIXTURE = process.env.FIXTURE_ID;
for (const [k, v] of Object.entries({
  ALPHA_EMAIL: process.env.ALPHA_EMAIL, ALPHA_PASSWORD: process.env.ALPHA_PASSWORD,
  CAPTAIN_EMAIL: process.env.CAPTAIN_EMAIL, CAPTAIN_PASSWORD: process.env.CAPTAIN_PASSWORD,
  TOURNAMENT_ID: TOURNAMENT, FIXTURE_ID: FIXTURE,
})) { if (!v) { console.error(`${k} 필요`); process.exit(1); } }

async function login(email, password) {
  const res = await fetch(`${B}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  // getSetCookie 가 없는 Node 런타임 폴백(다른 하네스와 동일한 이유).
  const set = res.headers.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  const found = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('teameet_v1_session='));
  if (!found) throw new Error(`login 실패 (${res.status})`);
  return found;
}

function apiWith(cookie) {
  return async (method, path, body, extra = {}) => {
    const res = await fetch(`${B}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie, ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
}

/** 200 이 아니면 status·본문과 함께 즉시 실패 — 재조회·폴링 전 지점 공용 가드. */
function expectData(res, label) {
  if (res.status !== 200 || res.json?.data === undefined) {
    throw new Error(`${label} 실패 HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  }
  return res.json.data;
}

function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v !== null && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,n]) => [k, canonicalize(n)]));
  return v;
}
const previewHash = (r) => createHash('sha256').update(JSON.stringify(canonicalize({
  score: r.score, goalEvents: r.goalEvents ?? null, eventsHash: r.eventsHash, mvpParticipantId: r.mvpParticipantId ?? null,
}))).digest('hex');

async function main() {
  const adminCookie = await login(process.env.ALPHA_EMAIL, process.env.ALPHA_PASSWORD);
  const api = apiWith(adminCookie);
  console.log('관리자 로그인 OK');

  const pubRes = await api('GET', `/tournaments/${TOURNAMENT}/matches/${FIXTURE}`);
  const pub = pubRes.json?.data;
  const gameId = pub?.gameId;
  if (pubRes.status !== 200 || !gameId) {
    throw new Error(`fixture 조회 실패 HTTP ${pubRes.status}: ${pubRes.text.slice(0, 200)}`);
  }
  console.log(`fixture status=${pub?.status} game=${gameId}`);
  const gRes = await api('GET', `/games/${gameId}`);
  let g = gRes.json?.data;
  if (gRes.status !== 200 || !g) {
    throw new Error(`게임 조회 실패 HTTP ${gRes.status}: ${gRes.text.slice(0, 200)}`);
  }
  console.log(`game state=${g.state} v${g.version}`);

  // 라인업 (SCHEDULED 에서만) — LINEUP-2 이후 expectedVersion 은 **사이드별
  // 라인업 버전**(versionScope:'lineup')이다. 게임 버전을 넣으면 409.
  if (g.state === 'SCHEDULED') {
    for (const lineup of (g.lineups ?? []).filter((l) => l.state === 'DRAFT')) {
      const side = (g.sides ?? []).find((s) => s.id === lineup.sideId);
      const tag = side?.sideKey ?? lineup.sideId.slice(0, 8);
      const names = tag === 'HOME' ? ['E2E선수01','E2E선수03','E2E선수05'] : ['E2E선수02','E2E선수04','E2E선수06'];
      const participants = names.map((n, i) => ({
        displayNameSnapshot: n, jerseyNumber: i + 1,
        position: i === 0 ? 'GOLEIRO' : i === 1 ? 'FIXO' : 'PIVO', started: true,
      }));
      // 버전 필드가 payload 마다 달라 어긋날 수 있다 — 409 의 details.currentVersion
      // 으로 정확히 1회 재시도한다(레이스가 아니라 표기 차이를 흡수하는 용도).
      const trySave = async (v) => {
        const saveId = randomUUID();
        return api('PUT', `/games/${gameId}/lineups/${lineup.sideId}`, {
          expectedVersion: v, clientCommandId: saveId, formation: '1-2-1', participants,
        }, { 'idempotency-key': saveId });
      };
      let saved = await trySave(lineup.version ?? lineup.revision ?? 1);
      if (saved.status === 409 && saved.json?.details?.currentVersion !== undefined) {
        saved = await trySave(saved.json.details.currentVersion);
      }
      console.log(`라인업 저장 ${tag}: HTTP ${saved.status}${saved.status >= 400 ? ' ' + saved.text.slice(0,200) : ''}`);
      if (saved.status >= 400) throw new Error('save 실패');
      // submit 의 expectedVersion 은 저장 직후 **다시 읽은** 라인업 버전 (저장소 관례)
      g = expectData(await api('GET', `/games/${gameId}`), '게임 재조회');
      const fresh = (g.lineups ?? []).find((l) => l.sideId === lineup.sideId);
      if (!fresh) {
        throw new Error(`재조회에서 라인업(sideId=${lineup.sideId})을 찾지 못했어요 — 응답: ${JSON.stringify(g.lineups ?? []).slice(0, 200)}`);
      }
      const trySubmit = async (v) => {
        const submitId = randomUUID();
        return api('POST', `/games/${gameId}/lineups/${fresh.id}/submit`,
          { expectedVersion: v, clientCommandId: submitId }, { 'idempotency-key': submitId });
      };
      let sub = await trySubmit(fresh.version ?? fresh.revision);
      if (sub.status === 409 && sub.json?.details?.currentVersion !== undefined) {
        sub = await trySubmit(sub.json.details.currentVersion);
      }
      console.log(`라인업 제출 ${tag}: HTTP ${sub.status}${sub.status >= 400 ? ' ' + sub.text.slice(0,200) : ''}`);
      if (sub.status >= 400) throw new Error('submit 실패');
      g = expectData(await api('GET', `/games/${gameId}`), '게임 재조회');
    }
  }

  // takeover → start → end
  const clientInstanceId = randomUUID();
  const socket = io(`${ORIGIN}/game-operations`, {
    transports: ['websocket'], extraHeaders: { cookie: adminCookie },
    auth: { clientInstanceId, authorizationSubjectVersion: 0 },
  });
  const token = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('takeover 타임아웃')), 20000);
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
    socket.on('connect', () => socket.emit('game.takeover.request',
      { gameId, authorizationSubjectVersion: 0, clientInstanceId, lastSequence: 0 },
      (ack) => { clearTimeout(timer); ack?.status === 'granted' ? resolve(ack.takeoverToken) : reject(new Error(JSON.stringify(ack))); }));
  });
  console.log('takeover OK');
  const command = async (name, payload = {}) => {
    g = expectData(await api('GET', `/games/${gameId}`), '게임 재조회');
    const id = randomUUID();
    return api('POST', `/games/${gameId}/commands/${name}`,
      { expectedVersion: g.version, clientCommandId: id, takeoverToken: token, occurredAt: new Date().toISOString(), payload },
      { 'idempotency-key': id });
  };
  try {
    if (g.state === 'SCHEDULED') {
      const r = await command('start');
      console.log(`start: HTTP ${r.status}${r.status >= 400 ? ' ' + r.text.slice(0,200) : ''}`);
    }
    const end = await command('end');
    console.log(`end: HTTP ${end.status}${end.status >= 400 ? ' ' + end.text.slice(0,300) : ''}`);
    if (end.status >= 400) throw new Error('end 실패');
  } finally { socket.close(); }

  // SUBMITTED 리비전 → officialize
  const revs = expectData(await api('GET', `/games/${gameId}/result-revisions`), '리비전 목록 조회');
  const submitted = (revs?.items ?? revs ?? []).find((r) => r.state === 'SUBMITTED');
  if (!submitted) throw new Error(`SUBMITTED 리비전 없음: ${JSON.stringify(revs).slice(0,300)}`);
  g = expectData(await api('GET', `/games/${gameId}`), '게임 재조회');
  const offId = randomUUID();
  const off = await api('POST', `/games/${gameId}/result-revisions/${submitted.id}/officialize`, {
    expectedVersion: g.version, clientCommandId: offId, projectionPreviewHash: previewHash(submitted),
  }, { 'idempotency-key': offId });
  console.log(`officialize: HTTP ${off.status}${off.status >= 400 ? ' ' + off.text.slice(0,300) : ''}`);
  if (off.status >= 400) throw new Error('officialize 실패');

  // 팀장 계정으로 알림 폴링 (outbox 워커 비동기)
  const capCookie = await login(process.env.CAPTAIN_EMAIL, process.env.CAPTAIN_PASSWORD);
  const capApi = apiWith(capCookie);
  // 판정 신뢰성(리뷰 지적): 제목만 보면 과거 실행이 남긴 같은 제목의 알림으로도
  // PASS 한다 — 이번 픽스처를 가리키는 route + 스크립트 시작 이후 생성으로 좁힌다.
  const startedAt = Date.now();
  const expectedRoute = `/tournaments/${TOURNAMENT}/matches/${FIXTURE}`;
  console.log('팀장 로그인 OK — 알림 폴링(최대 90s)');
  for (let i = 0; i < 18; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const notis = expectData(await capApi('GET', '/notifications?limit=10'), '알림 목록 조회');
    const hit = (notis?.items ?? []).find(
      (n) =>
        n.title === '대회 경기 결과가 확정됐어요' &&
        n.target?.route === expectedRoute &&
        new Date(n.createdAt).getTime() >= startedAt - 60_000,
    );
    if (hit) {
      // 알림 목록 API 는 deepLink 를 target.route 로 직렬화한다.
      console.log(`\n✅ 알림 도착: "${hit.title}" / "${hit.body}" / route=${hit.target?.route}`);
      return;
    }
  }
  console.log('\n❌ 90초 내 알림 미도착 — 원시 응답 확인 필요');
  process.exit(2);
}
main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
