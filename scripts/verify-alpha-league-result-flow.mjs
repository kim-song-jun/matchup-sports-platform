#!/usr/bin/env node
/**
 * 정규 리그 경기 결과가 **순위표까지 닿는지**를 alpha 실환경에서 끝까지 밟아 보는 하네스.
 *
 * 왜 필요한가: 리그의 결과 확정은 단일 API 호출이 아니라 세 사람의 릴레이다 —
 * 홈팀이 작성·제출하고, 원정팀이 승인해야 공식이 되고, 그제야 순위표가 움직인다.
 * 유닛 테스트는 각 칸은 검증해도 **릴레이가 실제로 이어지는지**는 증명하지 못한다.
 * 2026-08-24 에 원정팀이 승인 화면에 진입조차 못 해 릴레이가 통째로 끊겨 있었는데,
 * 그때도 유닛 테스트는 전부 통과하고 있었다.
 *
 * 사용법 (자격증명은 절대 저장소에 적지 않는다 — 환경변수로만 넘긴다):
 *   HOME_TOKEN='v1.<payload>.<hmac>' AWAY_TOKEN='v1.<payload>.<hmac>' \
 *   node scripts/verify-alpha-league-result-flow.mjs [--league <uuid>] [--dry]
 *
 * 토큰은 login API 의 Set-Cookie(teameet_v1_session)에서 얻는다. alpha 는 프로덕션
 * 모드라 헤더 dev 인증(x-v1-user-*)이 401 이므로 이 경로가 유일하다.
 *
 * --dry 는 읽기만 한다(게이트 값과 순위표만 확인, 결과를 쓰지 않는다).
 */

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const HOME_TOKEN = process.env.HOME_TOKEN;
const AWAY_TOKEN = process.env.AWAY_TOKEN;
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const leagueArgIndex = argv.indexOf('--league');
const LEAGUE_ID = leagueArgIndex >= 0 ? argv[leagueArgIndex + 1] : process.env.LEAGUE_ID;
/** 공식 결과 투영(아웃박스 워커)이 공개 응답에 나타날 때까지 기다리는 상한. */
const PROJECTION_TIMEOUT_MS = Number(process.env.PROJECTION_TIMEOUT_MS ?? 90_000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!HOME_TOKEN || !AWAY_TOKEN) {
  console.error('HOME_TOKEN 과 AWAY_TOKEN 환경변수가 필요해요 (teameet_v1_session 쿠키 값).');
  process.exit(2);
}

let failures = 0;
function check(label, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures += 1;
  console.log(`  [${mark}] ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

function cookie(token) {
  return `teameet_v1_session=${token}`;
}

async function call(method, path, { token, body, idempotencyKey } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.cookie = cookie(token);
  if (body !== undefined) headers['content-type'] = 'application/json';
  // 게임 커맨드 계열은 Idempotency-Key 헤더와 body 의 clientCommandId 가 **정확히 같아야**
  // 한다 — 다르면 422 COMMAND_IDEMPOTENCY_KEY_MISMATCH 로 거절된다.
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try {
    json = text.length === 0 ? null : JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** 결과 화면(web)의 hashResultPayload 와 같은 FNV-1a 32bit. 서버는 검증하지 않고 저장만 한다. */
function hashResultPayload(payload) {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function standingsLine(standings, teamId) {
  const row = standings.find((entry) => entry.teamId === teamId);
  if (!row) return '순위 없음';
  return `${row.position}위 ${row.points}점 (${row.wins}승 ${row.draws}무 ${row.losses}패, 득실 ${row.goalsFor}:${row.goalsAgainst})`;
}

async function main() {
  console.log(`대상: ${BASE}${DRY ? '  (읽기 전용)' : ''}`);

  // ── 1. 검증에 쓸 리그·대진 고르기 ──────────────────────────────────────────
  let leagueId = LEAGUE_ID;
  if (!leagueId) {
    const mine = await call('GET', '/league-matches/me', { token: AWAY_TOKEN });
    const active = (mine.json?.data?.items ?? []).filter((item) => item.state === 'active');
    if (active.length === 0) {
      console.error('원정팀 계정이 참가 중인 active 리그가 없어요. --league 로 직접 지정해 주세요.');
      process.exit(2);
    }
    leagueId = active[0].leagueId;
  }

  const detailBefore = await call('GET', `/league-matches/${leagueId}`);
  if (detailBefore.status !== 200) {
    console.error(`리그 상세를 읽지 못했어요 (${detailBefore.status}) ${detailBefore.text.slice(0, 200)}`);
    process.exit(2);
  }
  const league = detailBefore.json.data;
  console.log(`리그: ${league.title} (${leagueId})`);

  // 아직 스코어가 없는 matched 대진 중에서, **주어진 두 토큰이 각각 홈·원정 담당자인**
  // 대진을 고른다. 리그에는 이 계정들과 무관한 팀들의 대진도 섞여 있어서(4팀 리그면
  // 6대진 중 우리 둘이 맞붙는 건 일부뿐) 앞에서부터 아무거나 집으면 두 토큰 다 권한이
  // 없는 대진을 골라 "게이트 실패"로 오판한다 — 실제로 그렇게 한 번 오판했다.
  // 판정은 추측하지 않고 서버가 내려주는 권한 플래그로 한다.
  const candidates = (league.fixtures ?? []).filter(
    (fixture) => fixture.status === 'matched' && fixture.homeScore === null && fixture.awayTeamId !== null,
  );
  let target = null;
  let awayView = null;
  let homeView = null;
  for (const fixture of candidates) {
    const [away, home] = await Promise.all([
      call('GET', `/team-matches/${fixture.teamMatchId}`, { token: AWAY_TOKEN }),
      call('GET', `/team-matches/${fixture.teamMatchId}`, { token: HOME_TOKEN }),
    ]);
    // 반드시 **둘 다** 만족해야 한다. 홈만 보고 고르면 원정팀이 제3의 팀인 대진을 집어
    // 승인 단계에서 403 이 나고, 그 403 을 결함으로 오해하게 된다(실제로 한 번 그랬다).
    if (
      home.json?.data?.viewer?.manageableHostTeam === true &&
      away.json?.data?.viewer?.manageableOpponentTeam === true
    ) {
      target = fixture;
      awayView = away;
      homeView = home;
      break;
    }
  }
  if (!target) {
    console.error(
      `두 토큰이 각각 홈·원정 담당자인 빈 matched 대진이 없어요(후보 ${candidates.length}개). 다른 리그를 지정해 주세요.`,
    );
    process.exit(2);
  }
  console.log(`대진: ${target.title} — ${target.teamMatchId}`);

  // 순위표는 상세와 별도 엔드포인트다 — 상세 응답에는 대진만 실린다.
  const standingsBefore = await call('GET', `/league-matches/${leagueId}/standings`);
  const beforeStandings = standingsBefore.json?.data?.standings ?? standingsBefore.json?.data?.rows ?? [];
  console.log(`  홈팀 순위(전): ${standingsLine(beforeStandings, target.homeTeamId)}`);
  console.log(`  원정팀 순위(전): ${standingsLine(beforeStandings, target.awayTeamId)}`);

  // ── 2. 게이트: 원정팀 담당자가 승인 권한을 인정받는가 ──────────────────────
  console.log('\n[1] 승인 게이트');
  const awayViewer = awayView.json?.data?.viewer ?? {};
  check(
    '원정팀 담당자에게 manageableOpponentTeam=true 가 내려온다',
    awayViewer.manageableOpponentTeam === true,
    `viewer.state=${awayViewer.state} manageableOpponentTeam=${awayViewer.manageableOpponentTeam}`,
  );
  const homeViewer = homeView.json?.data?.viewer ?? {};
  check(
    '홈팀 담당자에게 manageableHostTeam=true 가 내려온다',
    homeViewer.manageableHostTeam === true,
    `viewer.state=${homeViewer.state} manageableHostTeam=${homeViewer.manageableHostTeam}`,
  );
  check(
    '홈팀은 승인 권한을 갖지 않는다(자기 결과를 자기가 승인할 수 없다)',
    homeViewer.manageableOpponentTeam !== true,
    `manageableOpponentTeam=${homeViewer.manageableOpponentTeam}`,
  );

  const gameId = awayView.json?.data?.gameId;
  if (!gameId) {
    check('대진에 경기(Game)가 연결돼 있다', false, 'gameId 가 응답에 없다');
    return finish();
  }

  if (DRY) {
    console.log('\n--dry 이므로 여기까지만 확인합니다.');
    return finish();
  }

  // ── 3. 홈팀이 결과를 작성하고 제출한다 ────────────────────────────────────
  console.log('\n[2] 홈팀 결과 작성·제출');
  const game = await call('GET', `/games/${gameId}`, { token: HOME_TOKEN });
  check('홈팀이 경기를 조회할 수 있다', game.status === 200, `HTTP ${game.status}`);
  const version = game.json?.data?.version;
  const score = { home: 2, away: 1 };
  const actualParticipants = [];
  const createId = crypto.randomUUID();
  const created = await call('POST', `/games/${gameId}/result-revisions`, {
    token: HOME_TOKEN,
    idempotencyKey: createId,
    body: {
      expectedVersion: version,
      clientCommandId: createId,
      score,
      actualParticipants,
      eventsHash: hashResultPayload({ score, actualParticipants }),
    },
  });
  check('결과 초안이 만들어진다', created.status < 300, `HTTP ${created.status} ${created.text.slice(0, 200)}`);
  const revisionId = created.json?.data?.revisionId;
  if (!revisionId) return finish();

  const submitId = crypto.randomUUID();
  const submitted = await call('POST', `/games/${gameId}/result-revisions/${revisionId}/submit`, {
    token: HOME_TOKEN,
    idempotencyKey: submitId,
    body: { expectedVersion: created.json.data.version, clientCommandId: submitId },
  });
  check('홈팀이 결과를 제출한다', submitted.status < 300, `HTTP ${submitted.status} ${submitted.text.slice(0, 200)}`);
  if (submitted.status >= 300) return finish();

  // ── 4. 원정팀이 승인한다 ─────────────────────────────────────────────────
  console.log('\n[3] 원정팀 승인');
  const decideId = crypto.randomUUID();
  const decided = await call('POST', `/games/${gameId}/result-revisions/${revisionId}/decision`, {
    token: AWAY_TOKEN,
    idempotencyKey: decideId,
    body: { expectedVersion: submitted.json.data.version, clientCommandId: decideId, decision: 'approve' },
  });
  check('원정팀이 승인할 수 있다', decided.status < 300, `HTTP ${decided.status} ${decided.text.slice(0, 200)}`);
  check('승인 결과가 OFFICIAL 이다', decided.json?.data?.revisionState === 'OFFICIAL', `state=${decided.json?.data?.revisionState}`);
  if (decided.status >= 300) return finish();

  // ── 5. 순위표가 실제로 움직였는가 ────────────────────────────────────────
  // 공개 응답이 ground truth 다 — 커맨드 응답이 아니라 관전자가 받는 값을 본다.
  // 승인 응답이 200 이어도 순위표는 **그 순간 바뀌지 않는다** — 공식 결과는 아웃박스
  // 워커가 비동기로 투영한다(v1-game-operations-worker → GAME_RESULT_OFFICIAL). 처음에
  // 승인 직후 한 번만 읽었더니 0점/스코어 null 이 나와서 결함으로 오판할 뻔했다(실제로는
  // 십수 초 뒤 정상 반영). 그래서 여기서는 반영될 때까지 짧게 재조회하고, **걸린 시간을
  // 함께 출력**해 지연 자체를 눈에 보이게 한다.
  console.log('\n[4] 순위표 반영 (비동기 투영 — 반영까지 대기)');
  const startedAt = Date.now();
  const deadline = startedAt + PROJECTION_TIMEOUT_MS;
  let detailAfter;
  let standingsAfter;
  let afterStandings = [];
  let projectedMs = null;
  for (;;) {
    detailAfter = await call('GET', `/league-matches/${leagueId}`);
    standingsAfter = await call('GET', `/league-matches/${leagueId}/standings`);
    afterStandings = standingsAfter.json?.data?.standings ?? standingsAfter.json?.data?.rows ?? [];
    const row = (detailAfter.json?.data?.fixtures ?? []).find((f) => f.teamMatchId === target.teamMatchId);
    if (row?.homeScore !== null && row?.homeScore !== undefined) {
      projectedMs = Date.now() - startedAt;
      break;
    }
    if (Date.now() >= deadline) break;
    await sleep(3_000);
  }
  check(
    `공식 결과가 ${Math.round(PROJECTION_TIMEOUT_MS / 1000)}초 안에 공개 응답에 투영된다`,
    projectedMs !== null,
    projectedMs === null ? '시간 안에 반영되지 않았다' : `${(projectedMs / 1000).toFixed(1)}초 걸림`,
  );
  const homeBefore = beforeStandings.find((entry) => entry.teamId === target.homeTeamId);
  const homeAfter = afterStandings.find((entry) => entry.teamId === target.homeTeamId);
  console.log(`  홈팀 순위(후): ${standingsLine(afterStandings, target.homeTeamId)}`);
  console.log(`  원정팀 순위(후): ${standingsLine(afterStandings, target.awayTeamId)}`);
  check(
    '홈팀 승점이 승리분(+3) 만큼 늘었다',
    homeAfter !== undefined && homeBefore !== undefined && homeAfter.points === homeBefore.points + 3,
    `${homeBefore?.points} -> ${homeAfter?.points}`,
  );
  const fixtureAfter = (detailAfter.json?.data?.fixtures ?? []).find((f) => f.teamMatchId === target.teamMatchId);
  check(
    '공개 대진에 스코어가 실린다',
    fixtureAfter?.homeScore === score.home && fixtureAfter?.awayScore === score.away,
    `${fixtureAfter?.homeScore}:${fixtureAfter?.awayScore}`,
  );

  return finish();
}

function finish() {
  console.log(`\n${failures === 0 ? '전부 통과' : `${failures}건 실패`}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
