// alpha QA 시드: "라인업 확정 → 실시간 경기 기록 → 종료(승부차기 포함)" 를 반복 테스트할
// 대회를 만든다. 각 대회는 조별리그·4강·결승·3·4위전 네 단계(phase)를 모두 갖는다 —
// 조별은 무승부로 끝낼 수 있고(승부차기 버튼이 뜨면 안 되는 경로), knockout 세 단계는
// 승부차기 입력이 열리는 경로다.
//
// 경기별 라인업은 **일부러 비워 둔다**(요청: "라인업 확정부터 테스트"). 대회 선수 명단
// (로스터)까지만 채워서, 화면에서 라인업 제출부터 바로 시작할 수 있게 한다.
//
// 사용법:
//   ALPHA_ADMIN_EMAIL=... ALPHA_CAPTAIN_A_EMAIL=... ALPHA_CAPTAIN_B_EMAIL=... \
//   ALPHA_PASSWORD=... COUNT=10 node scripts/seed_alpha_lineup_ops_tournaments.mjs
//
// 자격증명은 환경변수로만 받는다(레포는 public — 하드코딩 금지).
const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr/api/v1';
const PASSWORD = process.env.ALPHA_PASSWORD;
const ADMIN_EMAIL = process.env.ALPHA_ADMIN_EMAIL;
const CAPTAIN_A_EMAIL = process.env.ALPHA_CAPTAIN_A_EMAIL;
const CAPTAIN_B_EMAIL = process.env.ALPHA_CAPTAIN_B_EMAIL;
const TEAM_A = process.env.ALPHA_TEAM_A || '00620e9d-b432-4a59-98ef-68afcac31c8b';
const TEAM_B = process.env.ALPHA_TEAM_B || 'ea0e4cf0-34ab-411c-ac89-5b931f25e781';
const SPORT_ID = process.env.ALPHA_SPORT_ID || 'b60abf1d-0caf-477e-ba61-d51984e63151'; // 풋살
const COUNT = Number(process.env.COUNT || '1');
const TITLE_PREFIX = process.env.TITLE_PREFIX || '(테스트) 라인업·실시간 운영';
const ROSTER_SIZE = Number(process.env.ROSTER_SIZE || '8');

if (!PASSWORD || !ADMIN_EMAIL || !CAPTAIN_A_EMAIL || !CAPTAIN_B_EMAIL) {
  console.error('ALPHA_PASSWORD / ALPHA_ADMIN_EMAIL / ALPHA_CAPTAIN_A_EMAIL / ALPHA_CAPTAIN_B_EMAIL 이 필요해요.');
  process.exit(1);
}

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error(`${email}: 세션 쿠키 없음`);
  return cookie.split(';')[0];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** alpha 는 배포·재시작 중 nginx 가 502/503/504 를 잠깐 돌려준다(HTML 본문). 그건 요청이
 *  틀린 게 아니라 서버가 잠깐 없는 것이므로 재시도한다 — 그 외 4xx 는 계약 문제라 즉시
 *  올려서 어디가 틀렸는지 드러낸다. */
async function call(method, path, cookie, body, attempt = 1) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json (nginx HTML) */ }
  if ([502, 503, 504].includes(res.status) && attempt <= 6) {
    await sleep(5000 * attempt);
    return call(method, path, cookie, body, attempt + 1);
  }
  return { status: res.status, data: json?.data ?? null, raw: json ?? text.slice(0, 300) };
}

/** 실패를 조용히 넘기지 않는다 — 어느 단계에서 깨졌는지 즉시 드러나야 한다. */
function must(label, res, ok = (r) => r.status >= 200 && r.status < 300) {
  if (!ok(res)) throw new Error(`${label} 실패 (${res.status}): ${JSON.stringify(res.raw).slice(0, 400)}`);
  return res.data;
}

function isoDaysFromNow(days, hour = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** 확정된 등록에 대회 선수 명단(로스터)을 채운다 — 라인업 화면이 여기서 선수를 고른다. */
async function fillRoster(tournamentId, registrationId, captainCookie, adminCookie) {
  const eligible = must(
    'eligible-players 조회',
    await call('GET', `/admin/registrations/${registrationId}/eligible-players`, adminCookie),
  );
  // 응답은 `{ members: [{ userId, nickname, realName, eligible, alreadyOnRoster }] }`.
  // 이미 올라간 사람과 자격 없는 사람은 거른다 — 중복 추가는 409 로 떨어진다.
  const candidates = (eligible?.members ?? [])
    .filter((member) => member.eligible && !member.alreadyOnRoster)
    .slice(0, ROSTER_SIZE);
  let added = 0;
  for (const candidate of candidates) {
    const userId = candidate.userId;
    const name = candidate.realName ?? candidate.nickname ?? `선수${added + 1}`;
    const res = await call('POST', `/tournaments/${tournamentId}/registrations/${registrationId}/players`, captainCookie, {
      userId,
      realName: name,
      eligibilityStatus: 'non_pro',
    });
    if (res.status >= 200 && res.status < 300) added += 1;
    else console.log(`      · 로스터 추가 실패(${res.status}) ${name}: ${JSON.stringify(res.raw).slice(0, 160)}`);
  }
  return { added, candidates: candidates.length };
}

/** 대회 신청 약관(context=tournament_application)의 현재 문서 id 목록 — 등록 제출은
 *  필수 약관 동의 문서 id 를 실제로 요구한다(`assertTournamentAcceptances`). 목록이
 *  바뀌면 stale 로 거부되므로 하드코딩하지 않고 매번 조회한다. */
async function tournamentTermsDocumentIds() {
  const res = await call('GET', '/terms/current?context=tournament_application', '');
  const items = must('대회 약관 조회', res)?.items ?? [];
  const ids = items.map((item) => item.documentId);
  if (ids.length === 0) throw new Error('대회 신청 약관이 비어 있어요(TERMS_NOT_READY).');
  return ids;
}

async function registerTeam(tournamentId, teamId, captainCookie, adminCookie, depositorName, termsDocumentIds) {
  const reg = must(
    '등록 생성',
    await call('POST', `/tournaments/${tournamentId}/registrations`, captainCookie, { teamId }),
  );
  must(
    '등록 제출',
    await call('POST', `/tournaments/${tournamentId}/registrations/${reg.id}/submit`, captainCookie, {
      paymentMethod: 'bank_transfer',
      depositorName,
      agreedRules: true,
      agreedPrivacy: true,
      agreedRefund: true,
      termsDocumentIds,
    }),
  );
  must('입금 확인', await call('PATCH', `/admin/registrations/${reg.id}/confirm-payment`, adminCookie, { note: 'QA 시드' }));
  must('참가 확정', await call('PATCH', `/admin/registrations/${reg.id}/confirm`, adminCookie, { decision: 'confirm' }));
  return reg.id;
}

/** 조별 → 4강 → 결승 → 3·4위전. 두 팀뿐이라 모든 경기가 A vs B 지만, 단계(phase)별 분기
 *  (조별 무승부 허용 vs knockout 승부차기 필수)는 그대로 전부 탄다. */
const STAGES = [
  { name: '조별리그', phase: 'group', round: '조별리그', sortOrder: 1 },
  { name: '4강', phase: 'semi', round: '4강', sortOrder: 2 },
  { name: '결승', phase: 'final', round: '결승', sortOrder: 3 },
  { name: '3·4위전', phase: 'third_place', round: '3·4위전', sortOrder: 4 },
];

async function createOne(index, cookies, termsDocumentIds) {
  const { admin, captainA, captainB } = cookies;
  const title = `${TITLE_PREFIX} ${String(index).padStart(2, '0')}`;
  console.log(`\n[${index}] ${title}`);

  const tournament = must(
    '대회 생성',
    await call('POST', '/admin/tournaments', admin, {
      sportId: SPORT_ID,
      title,
      format: 'group_knockout',
      entryFee: 0,
      teamCount: 2,
      minPlayers: 5,
      maxPlayers: 15,
      venue: '알파 QA 풋살장',
      // 라인업·로스터 마감이 지나면 제출이 막히므로 넉넉히 미래로 둔다.
      registrationDeadlineAt: isoDaysFromNow(14),
      rosterDeadlineAt: isoDaysFromNow(21),
      scheduledAt: isoDaysFromNow(1),
    }),
  );
  const tid = tournament.id;
  console.log(`   대회 ${tid}`);

  must('status→open', await call('POST', `/admin/tournaments/${tid}/status`, admin, { status: 'open' }));

  const regA = await registerTeam(tid, TEAM_A, captainA, admin, 'E2E팀장A', termsDocumentIds);
  const regB = await registerTeam(tid, TEAM_B, captainB, admin, 'E2E팀장B', termsDocumentIds);
  console.log(`   등록 확정 A=${regA.slice(0, 8)} B=${regB.slice(0, 8)}`);

  const rosterA = await fillRoster(tid, regA, captainA, admin);
  const rosterB = await fillRoster(tid, regB, captainB, admin);
  console.log(`   로스터 A=${rosterA.added}/${rosterA.candidates} B=${rosterB.added}/${rosterB.candidates}`);

  const fixtures = [];
  for (const [i, stage] of STAGES.entries()) {
    const group = must(
      `그룹 생성(${stage.name})`,
      await call('POST', `/admin/tournaments/${tid}/groups`, admin, {
        name: stage.name,
        phase: stage.phase,
        sortOrder: stage.sortOrder,
      }),
    );
    const fixture = must(
      `픽스처 생성(${stage.name})`,
      await call('POST', `/admin/tournaments/${tid}/fixtures`, admin, {
        groupId: group.id,
        round: stage.round,
        fixtureNumber: i + 1,
        homeRegistrationId: regA,
        awayRegistrationId: regB,
        venue: '알파 QA 풋살장',
        scheduledAt: isoDaysFromNow(1, 10 + i),
      }),
    );
    fixtures.push({ stage: stage.name, fixtureId: fixture.id, gameId: fixture.gameId ?? null });
  }

  // 대진표를 공개하지 않으면 공개 상세(`GET /tournaments/:id`)가 groups·fixtures 를
  // 빈 배열로 감춘다(`isBracketPublished` 게이트) — 대회 화면에서 경기가 아예 안 보여
  // 라인업 진입 링크도 없다. 운영 보드/운영 콘솔은 이 게이트와 무관하게 보이므로,
  // 이걸 빠뜨리면 "스태프 화면에는 있는데 대회 화면에는 없는" 상태가 된다.
  must('대진표 공개', await call('POST', `/admin/tournaments/${tid}/publish-bracket`, admin, {}));

  // 경기 운영은 in_progress 에서 한다. closed 를 반드시 거쳐야 한다(상태 머신).
  must('status→closed', await call('POST', `/admin/tournaments/${tid}/status`, admin, { status: 'closed' }));
  must('status→in_progress', await call('POST', `/admin/tournaments/${tid}/status`, admin, { status: 'in_progress' }));

  // 라인업 진입이 실제로 열렸는지 확인한다 — 이 시드의 목적 자체가 "라인업 확정부터
  // 테스트"이므로, 경기만 만들어두고 접근이 막혀 있으면 만든 의미가 없다.
  const access = await call('GET', `/tournaments/${tid}/fixtures/${fixtures[0].fixtureId}/lineup-access`, captainA);
  if (access.status !== 200 || !access.data?.gameId) {
    throw new Error(`라인업 접근 검증 실패 (${access.status}): ${JSON.stringify(access.raw).slice(0, 200)}`);
  }

  console.log(`   경기 ${fixtures.length}개: ${fixtures.map((f) => f.stage).join(', ')}`);
  return { title, tournamentId: tid, fixtures };
}

const cookies = {
  admin: await login(ADMIN_EMAIL),
  captainA: await login(CAPTAIN_A_EMAIL),
  captainB: await login(CAPTAIN_B_EMAIL),
};
console.log('로그인 완료 (admin / captainA / captainB)');

const termsDocumentIds = await tournamentTermsDocumentIds();
console.log(`대회 신청 약관 ${termsDocumentIds.length}건 동의 예정`);

const START_INDEX = Number(process.env.START_INDEX || '1');
const created = [];
for (let i = START_INDEX; i < START_INDEX + COUNT; i += 1) {
  try {
    created.push(await createOne(i, cookies, termsDocumentIds));
  } catch (error) {
    console.error(`[${i}] 중단: ${error.message}`);
    break;
  }
}

console.log(`\n=== 생성 완료 ${created.length}/${COUNT} ===`);
console.log(JSON.stringify(created, null, 2));
