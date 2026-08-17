// alpha 에 `completed` 팀매치를 실제로 만들어 후기 플로우를 끝까지 검증한다.
//
// 왜 필요한가: alpha 에는 completed 팀매치가 하나도 없어서 (a) 팀매치 상세의 후기 CTA 와
// (b) 팀매치 후기를 받은 사람이 "받은 후기"에서 보는 경로를 실화면으로 확인할 수 없었다.
// "재현 불가"로 접지 말고 운영자 경로를 그대로 밟아 상태를 만든다
// (scripts/verify-alpha-period-break.mjs 의 대회 픽스처 버전을 팀매치용으로 옮긴 것).
//
// 팀매치가 대회 픽스처와 다른 점: TEAM_MATCH 게임은 requireTakeover 면제라 Socket.IO
// takeover 토큰 없이 REST 만으로 커맨드를 칠 수 있다. 그래서 이 하네스는 소켓을 안 쓴다.
//
// 라인업에는 반드시 실제 userId 를 넣는다 — 상대 선수 후기 대상의 유일한 근거가
// V1GameParticipant.userId 이기 때문이다(이름만 넣으면 게스트로 저장돼 후기 대상이 0명).
//
// 흐름: 팀매치 생성 → 상대팀 신청 → 승인(=game 생성) → 라인업 저장·제출(양 팀)
//       → start → end-period → start-period → end-period → end → 결과 리비전 제출 → 상대 승인
//
// Run: ALPHA_TOKEN_A=... ALPHA_TOKEN_B=... node scripts/verify-alpha-team-match-review-flow.mjs
// 저장소가 PUBLIC 이라 자격증명·식별자는 전부 환경변수로 받는다.
import { randomUUID } from 'node:crypto';

const B = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr/api/v1';
const TOKEN_A = (process.env.ALPHA_TOKEN_A || '').trim();
const TOKEN_B = (process.env.ALPHA_TOKEN_B || '').trim();
const TEAM_A = (process.env.ALPHA_TEAM_A || '').trim();
const TEAM_B = (process.env.ALPHA_TEAM_B || '').trim();
const SPORT_ID = (process.env.ALPHA_SPORT_ID || '').trim();
const REGION_ID = (process.env.ALPHA_REGION_ID || '').trim();
// 라인업에 실을 실제 사용자 id (팀별 3명 이상). 콤마 구분.
const ROSTER_A = (process.env.ALPHA_ROSTER_A || '').split(',').map((s) => s.trim()).filter(Boolean);
const ROSTER_B = (process.env.ALPHA_ROSTER_B || '').split(',').map((s) => s.trim()).filter(Boolean);
// takeover 는 스태프 스코프를 요구한다 — 팀장 계정은 STAFF_SCOPE_DENIED 로 거부된다.
// platform_ops 어드민만 발급받을 수 있고, 커맨드도 같은 주체로 보내야 토큰이 맞는다.
const TOKEN_OPS = (process.env.ALPHA_TOKEN_OPS || '').trim() || TOKEN_A;

for (const [name, value] of Object.entries({ TOKEN_A, TOKEN_B, TEAM_A, TEAM_B, SPORT_ID, REGION_ID })) {
  if (!value) {
    console.error(`${name} 이 필요합니다.`);
    process.exit(1);
  }
}

async function api(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: {
      cookie: `teameet_v1_session=${token}`,
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 비 JSON 응답은 text 로만 본다 */ }
  return { status: res.status, text, json, data: json?.data ?? json };
}

const step = (label, res) => {
  const ok = res.status < 400;
  console.log(`${ok ? '✔' : '✘'} ${label}: HTTP ${res.status}${ok ? '' : ' ' + res.text.slice(0, 260)}`);
  if (!ok) throw new Error(`${label} 실패`);
  return res.data;
};

const getGame = async (gameId) => (await api(TOKEN_A, 'GET', `/games/${gameId}`)).data;

/** 서버는 Idempotency-Key 헤더와 body.clientCommandId 가 같은 값이길 요구한다(불일치 시 422). */
async function idempotent(token, method, path, body) {
  const id = randomUUID();
  return api(token, method, path, { ...body, clientCommandId: id }, { 'idempotency-key': id });
}

/**
 * TEAM_MATCH 게임은 requireTakeover 가 곧바로 return 한다(games.service.ts) — 토큰을 검증하지
 * 않는다. 팀매치의 쓰기 주체는 호스트팀 owner/manager 하나뿐이라 스태프 인계 개념이 없고,
 * 실제로 requestTakeover 는 team-match actor 를 거부한다(STAFF_SCOPE_DENIED). 그래서 토큰은
 * DTO 의 non-empty 검사만 통과하면 되는 더미 문자열이면 충분하다.
 */
const TEAM_MATCH_TAKEOVER_PLACEHOLDER = 'team-match-no-takeover';

async function command(gameId, name, version) {
  const res = await idempotent(TOKEN_A, 'POST', `/games/${gameId}/commands/${name}`, {
    expectedVersion: version,
    takeoverToken: TEAM_MATCH_TAKEOVER_PLACEHOLDER,
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  const body = step(`command ${name}`, res);
  console.log(`    state=${body?.state} periods=[${(body?.periods ?? []).map((p) => `${p.number}:${p.state}`).join(' ')}]`);
  return body?.version ?? version + 1;
}

/**
 * 팀매치는 제네릭 /games/:id/lineups 를 거부한다(409 TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN) —
 * 로스터·자격·마감 불변식을 강제하는 전용 라우트만 허용한다. 참가자 모양도 다르다:
 * starters/substitutes 로 나뉘고, 연동 팀원은 userId, 게스트는 displayName 을 쓴다.
 */
async function ensureLineups(teamMatchId, gameId, game) {
  if (game.state !== 'SCHEDULED') {
    console.log(`라인업 건너뜀 (state=${game.state})`);
    return getGame(gameId);
  }
  for (const [tag, token, roster, teamId] of [['HOME', TOKEN_A, ROSTER_A, TEAM_A], ['AWAY', TOKEN_B, ROSTER_B, TEAM_B]]) {
    // 팀매치를 만들면 팀 일정(V1TeamSchedule)이 함께 생긴다. 그 일정이 있으면 라인업에는
    // 참석(GOING)으로 응답한 팀원만 넣을 수 있다(422 LINEUP_PARTICIPANT_INELIGIBLE).
    // 세션이 있는 사람만 RSVP 할 수 있으므로 로스터도 그 사람들로 좁힌다.
    const schedules = (await api(token, 'GET', `/teams/${teamId}/schedules?limit=20`)).data;
    const list = Array.isArray(schedules) ? schedules : (schedules?.items ?? []);
    const schedule = list.find((x) => x.teamMatchId === teamMatchId) ?? list[0];
    if (schedule) {
      // 내 참석 행에도 낙관적 잠금이 걸린다 — 현재 값을 읽어 그 version 을 넘긴다.
      const detail = (await api(token, 'GET', `/teams/${teamId}/schedules/${schedule.id}`)).data;
      const mineRow = (detail?.attendances ?? detail?.attendance ?? []).find?.((a) => a.isMe || a.mine) ?? null;
      const attVersion = mineRow?.version ?? detail?.myAttendance?.version ?? 0;
      const rsvp = await api(token, 'PUT', `/teams/${teamId}/schedules/${schedule.id}/attendance/me`, {
        status: 'GOING',
        expectedVersion: attVersion,
      }, { 'idempotency-key': randomUUID() });
      console.log(`   ${tag} RSVP: HTTP ${rsvp.status}${rsvp.status >= 400 ? ' ' + rsvp.text.slice(0, 160) : ''}`);
    } else {
      console.log(`   ${tag} 연결된 팀 일정 없음 — RSVP 생략`);
    }
    // 라인업 버전은 game.version 과 별개다 — 전용 조회(GET /team-matches/:id/lineup)가 준다.
    const mine = (await api(token, 'GET', `/team-matches/${teamMatchId}/lineup`)).data;
    const lineupVersion = mine?.version ?? mine?.lineup?.version ?? 0;
    console.log(`   ${tag} 라인업 현재 version=${lineupVersion}`);
    const starters = [0, 1, 2].map((i) => ({
      ...(roster[i] ? { userId: roster[i] } : { displayName: `${tag} 게스트${i + 1}` }),
      jerseyNumber: i + 1,
      position: ['GOLEIRO', 'FIXO', 'PIVO'][i],
      // 골키퍼는 position 문자열이 아니라 이 플래그로 판정한다 —
      // 선발에 정확히 한 명이어야 한다(422 LINEUP_GOALKEEPER_INVALID).
      goalkeeper: i === 0,
    }));

    // 팀매치 라인업 DTO 는 clientCommandId 를 body 에 받지 않는다(헤더 idempotency-key 만).
    // 벤치 필드명도 substitutes 가 아니라 bench 다 — forbidNonWhitelisted 라 틀리면 400.
    const idemp = (extra) => ({ 'idempotency-key': randomUUID(), ...extra });
    const saved = await api(token, 'PUT', `/team-matches/${teamMatchId}/lineup`, {
      expectedVersion: lineupVersion,
      formation: '1-2-1',
      starters,
      bench: [],
    }, idemp());
    step(`라인업 저장 ${tag}`, saved);

    const after = (await api(token, 'GET', `/team-matches/${teamMatchId}/lineup`)).data;
    const submitted = await api(token, 'POST', `/team-matches/${teamMatchId}/lineup/submit`, {
      expectedVersion: after?.version ?? after?.lineup?.version ?? lineupVersion + 1,
    }, idemp());
    step(`라인업 제출 ${tag}`, submitted);
  }
  return getGame(gameId);
}

async function main() {
  // 1) 팀매치 생성 — startsAt 은 미래여야 한다(과거면 400).
  const created = step('팀매치 생성', await api(TOKEN_A, 'POST', '/team-matches', {
    hostTeamId: TEAM_A,
    sportId: SPORT_ID,
    regionId: REGION_ID,
    title: '[검증] 후기 플로우 E2E',
    startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    manualPlaceName: 'E2E 테스트 경기장',
  }));
  const teamMatchId = created.teamMatchId ?? created.id;
  console.log(`   teamMatchId=${teamMatchId}`);

  // 2) 상대팀 신청 → 3) 승인 (승인 시 V1Game 이 생성된다)
  const applied = step('상대팀 신청', await api(TOKEN_B, 'POST', `/team-matches/${teamMatchId}/applications`, {
    applicantTeamId: TEAM_B,
  }));
  step('신청 승인', await api(TOKEN_A, 'POST', `/team-match-applications/${applied.applicationId ?? applied.id}/approve`, {}));

  const detail = (await api(TOKEN_A, 'GET', `/team-matches/${teamMatchId}`)).data;
  const gameId = detail.gameId ?? detail.game?.id;
  console.log(`   status=${detail.status} gameId=${gameId}`);

  // 4) 라인업 → 5) 경기 진행
  let game = await ensureLineups(teamMatchId, gameId, await getGame(gameId));
  // 5) TEAM_MATCH 게임은 self-reported 다 — 라이브 진행(start/end-period/end)이 없고
  //    SCHEDULED 에서 곧바로 결과를 제출한다(TOURNAMENT_COMMAND 트리거는 409로 거부된다).
  game = await getGame(gameId);
  const participants = (game.lineups ?? []).flatMap((l) =>
    (l.participants ?? []).map((pt) => ({ participantId: pt.id, sideId: l.sideId, started: pt.started ?? true })),
  );
  console.log(`\n결과 제출 준비: state=${game.state} version=${game.version} 참가자=${participants.length}명 eventsHash=${game.eventsHash ?? '(없음)'}`);
  console.log(`   game 키: ${Object.keys(game).join(', ')}`);
  console.log(`   lineups: ${JSON.stringify((game.lineups ?? []).map((l) => ({ state: l.state, n: (l.participants ?? []).length })))}`);
  const revision = await idempotent(TOKEN_A, 'POST', `/games/${gameId}/result-revisions`, {
    // 결과 리비전 DTO 는 takeoverToken 을 받지 않는다(forbidNonWhitelisted → 400).
    expectedVersion: game.version,
    score: { home: 2, away: 1 },
    actualParticipants: participants,
    eventsHash: game.eventsHash ?? 'sha256:empty',
    reason: '검증용 결과 제출',
  });
  console.log(`결과 리비전 생성: HTTP ${revision.status} ${revision.status >= 400 ? revision.text.slice(0, 400) : JSON.stringify(revision.data).slice(0, 200)}`);
  if (revision.status >= 400) {
    console.log('\n→ 여기서 멈춤. 위 응답의 요구 필드를 보고 body 를 맞춘다.');
    console.log(`teamMatchId=${teamMatchId} gameId=${gameId}`);
    return;
  }

  const revisionId = revision.data.revisionId ?? revision.data.id ?? revision.data.resultRevisionId;
  console.log(`   revisionId=${revisionId}`);
  const submitted = await idempotent(TOKEN_A, 'POST', `/games/${gameId}/result-revisions/${revisionId}/submit`, {
    expectedVersion: (await getGame(gameId)).version,
  });
  console.log(`결과 제출: HTTP ${submitted.status} ${submitted.status >= 400 ? submitted.text.slice(0, 300) : 'OK'}`);

  // 7) 상대팀 승인 → 팀매치 completed
  const decided = await idempotent(TOKEN_B, 'POST', `/games/${gameId}/result-revisions/${revisionId}/decision`, {
    expectedVersion: (await getGame(gameId)).version,
    decision: 'approve',
  });
  console.log(`상대 승인: HTTP ${decided.status} ${decided.status >= 400 ? decided.text.slice(0, 300) : 'OK'}`);

  const final = (await api(TOKEN_A, 'GET', `/team-matches/${teamMatchId}`)).data;
  console.log(`\n=== 최종 팀매치 상태: ${final.status} ===`);
  console.log(`teamMatchId=${teamMatchId} gameId=${gameId}`);
}

main().catch((err) => {
  console.error('\n중단:', err.message);
  process.exit(1);
});
