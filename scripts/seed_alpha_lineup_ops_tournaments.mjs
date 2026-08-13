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

// 참가 팀을 `ALPHA_ENTRANTS` 로 직접 주면 기본 두 팀(CAPTAIN_A/B)은 필요 없다.
if (!PASSWORD || !ADMIN_EMAIL || (!process.env.ALPHA_ENTRANTS && (!CAPTAIN_A_EMAIL || !CAPTAIN_B_EMAIL))) {
  console.error(
    'ALPHA_PASSWORD / ALPHA_ADMIN_EMAIL 은 필수이고, 참가 팀은 ALPHA_CAPTAIN_A_EMAIL+ALPHA_CAPTAIN_B_EMAIL 또는 ALPHA_ENTRANTS 로 지정해요.',
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 로그인은 분당 제한이 걸려 있다(`ThrottlerException` 429) — 팀장 계정을 여러 개 붙여
 * 대회를 연달아 만들면 실제로 걸린다(실측). 서버·네트워크가 잠깐 없는 경우(502/503/504)와
 * 같이 기다렸다 다시 시도한다. 자격증명이 틀린 4xx 는 재시도해도 같은 답이라 즉시 올린다.
 */
async function login(email, attempt = 1) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if ([429, 502, 503, 504].includes(res.status) && attempt <= 6) {
    await sleep(15_000 * attempt);
    return login(email, attempt + 1);
  }
  if (!res.ok) throw new Error(`login ${email} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error(`${email}: 세션 쿠키 없음`);
  return cookie.split(';')[0];
}

/**
 * 로그인한 계정의 밀린 가입 약관을 동의 처리한다.
 *
 * 시드로 만든 계정에는 약관 동의 이력이 없어서, 로그인은 되는데 첫 쓰기에서 403
 * `TERMS_RECONSENT_REQUIRED` 로 막힌다(실측). 약관 동의 자체는 미인증·미동의 계정에도
 * 열려 있는 경로라 여기서 바로 해소할 수 있다. 이미 동의한 계정에는 무해하다.
 */
async function acceptPendingSignupTerms(cookie, label) {
  const current = await call('GET', '/terms/current?context=signup', cookie);
  const items = current.data?.items ?? [];
  const pending = current.data?.compliance?.pendingRequiredDocumentIds ?? [];
  const documentIds = pending.length > 0 ? pending : items.filter((i) => i.requirement === 'required').map((i) => i.documentId);
  if (documentIds.length === 0) return;
  const res = await call('POST', '/terms/consents', cookie, { documentIds });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${label} 약관 동의 실패 (${res.status}): ${JSON.stringify(res.raw).slice(0, 200)}`);
  }
}

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

/**
 * 대진 구성. 참가 팀 수에 따라 갈린다.
 *
 * 2팀: 모든 경기가 같은 대진이지만 단계(phase)별 분기 — 조별은 무승부로 끝낼 수 있고
 * (승부차기 버튼이 뜨면 **안 되는** 경로), knockout 은 승부차기가 열리는 경로 — 는 전부 탄다.
 *
 * 4팀: 진짜 브래킷 모양. 두 조에서 한 경기씩, 4강은 조를 교차해 붙고, 결승·3·4위전까지 6경기.
 *
 * 결승·3·4위전에 진출팀을 비워 두지 않고 미리 배정한다. 진출 자동 배정은
 * `v1_tournament_fixture_advancement_edges` 를 읽어 동작하는데 그 테이블에 행을 만드는 쓰기
 * 경로가 코드베이스에 없다(읽기만 있다 — `GameResultBracketProjectionService.lockEdges`).
 * TBD 로 두면 4강이 끝나도 아무도 채워주지 않아 그 두 경기는 영영 운영할 수 없다.
 */
const STAGES_BY_TEAM_COUNT = {
  2: [
    { name: '조별리그', phase: 'group', round: '조별리그', home: 0, away: 1 },
    { name: '4강', phase: 'semi', round: '4강', home: 0, away: 1 },
    { name: '결승', phase: 'final', round: '결승', home: 0, away: 1 },
    { name: '3·4위전', phase: 'third_place', round: '3·4위전', home: 0, away: 1 },
  ],
  4: [
    { name: 'A조', phase: 'group', round: '조별리그', home: 0, away: 1 },
    { name: 'B조', phase: 'group', round: '조별리그', home: 2, away: 3 },
    { name: '4강 1경기', phase: 'semi', round: '4강', home: 0, away: 2 },
    { name: '4강 2경기', phase: 'semi', round: '4강', home: 1, away: 3 },
    { name: '결승', phase: 'final', round: '결승', home: 0, away: 1 },
    { name: '3·4위전', phase: 'third_place', round: '3·4위전', home: 2, away: 3 },
  ],
};

async function createOne(index, cookies, termsDocumentIds, entrants) {
  const { admin } = cookies;
  const title = `${TITLE_PREFIX} ${String(index).padStart(2, '0')}`;
  console.log(`\n[${index}] ${title}`);

  const tournament = must(
    '대회 생성',
    await call('POST', '/admin/tournaments', admin, {
      sportId: SPORT_ID,
      title,
      format: 'group_knockout',
      entryFee: 0,
      teamCount: entrants.length,
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

  // 참가 팀 등록 → 확정 → 로스터. 팀 순서가 곧 대진표의 좌석 번호(STAGES 의 home/away 인덱스)다.
  const registrationIds = [];
  for (const entrant of entrants) {
    const registrationId = await registerTeam(
      tid,
      entrant.teamId,
      entrant.cookie,
      admin,
      entrant.depositorName,
      termsDocumentIds,
    );
    const roster = await fillRoster(tid, registrationId, entrant.cookie, admin);
    console.log(`   ${entrant.label}: 확정 ${registrationId.slice(0, 8)} · 로스터 ${roster.added}/${roster.candidates}`);
    registrationIds.push(registrationId);
  }

  const stages = STAGES_BY_TEAM_COUNT[entrants.length];
  if (!stages) throw new Error(`참가 팀 ${entrants.length}개에 대한 대진 구성이 없어요(2 또는 4).`);

  // 같은 라운드가 두 경기인 4팀 브래킷에서는 그룹을 라운드마다 하나만 만들고 재사용한다 —
  // 조는 "A조/B조"처럼 실제로 갈리지만 4강 두 경기는 같은 4강 그룹에 들어가야 한다.
  const groupIdByName = new Map();
  const fixtures = [];
  for (const [i, stage] of stages.entries()) {
    let groupId = groupIdByName.get(stage.name);
    if (!groupId) {
      const group = must(
        `그룹 생성(${stage.name})`,
        await call('POST', `/admin/tournaments/${tid}/groups`, admin, {
          name: stage.name,
          phase: stage.phase,
          sortOrder: i + 1,
        }),
      );
      groupId = group.id;
      groupIdByName.set(stage.name, groupId);
    }
    const fixture = must(
      `픽스처 생성(${stage.name})`,
      await call('POST', `/admin/tournaments/${tid}/fixtures`, admin, {
        groupId,
        round: stage.round,
        fixtureNumber: i + 1,
        homeRegistrationId: registrationIds[stage.home],
        awayRegistrationId: registrationIds[stage.away],
        venue: '알파 QA 풋살장',
        scheduledAt: isoDaysFromNow(1, 10 + i),
      }),
    );
    fixtures.push({
      stage: stage.name,
      matchup: `${entrants[stage.home].label} vs ${entrants[stage.away].label}`,
      fixtureId: fixture.id,
    });
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
  const access = await call(
    'GET',
    `/tournaments/${tid}/fixtures/${fixtures[0].fixtureId}/lineup-access`,
    entrants[0].cookie,
  );
  if (access.status !== 200 || !access.data?.gameId) {
    throw new Error(`라인업 접근 검증 실패 (${access.status}): ${JSON.stringify(access.raw).slice(0, 200)}`);
  }

  console.log(`   경기 ${fixtures.length}개: ${fixtures.map((f) => `${f.stage}(${f.matchup})`).join(', ')}`);
  return { title, tournamentId: tid, fixtures };
}

/**
 * 참가 팀 명단. 기본은 기존 E2E 두 팀이고, `ALPHA_ENTRANTS` 로 넘기면 팀 수를 바꾼다 —
 * `이메일:팀ID:표시이름` 을 쉼표로 이어 붙인다(팀장 계정이어야 등록·로스터·라인업이 된다).
 */
async function resolveEntrants() {
  const spec = process.env.ALPHA_ENTRANTS;
  if (!spec) {
    return [
      { label: 'A팀', teamId: TEAM_A, cookie: await login(CAPTAIN_A_EMAIL), depositorName: 'E2E팀장A' },
      { label: 'B팀', teamId: TEAM_B, cookie: await login(CAPTAIN_B_EMAIL), depositorName: 'E2E팀장B' },
    ];
  }
  const entrants = [];
  for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [captainEmail, teamId, label] = raw.split(':');
    if (!captainEmail || !teamId) throw new Error(`ALPHA_ENTRANTS 형식 오류: "${raw}" (이메일:팀ID:표시이름)`);
    const cookie = await login(captainEmail);
    // 시드로 만든 계정은 약관 동의 이력이 없어 첫 쓰기에서 403 이 난다 — 여기서 먼저 푼다.
    await acceptPendingSignupTerms(cookie, captainEmail);
    entrants.push({
      label: label ?? teamId.slice(0, 8),
      teamId,
      cookie,
      depositorName: label ?? '테스트팀장',
    });
  }
  return entrants;
}

const cookies = { admin: await login(ADMIN_EMAIL) };
const entrants = await resolveEntrants();
console.log(`로그인 완료 (admin + 팀장 ${entrants.length}명: ${entrants.map((e) => e.label).join(', ')})`);

const termsDocumentIds = await tournamentTermsDocumentIds();
console.log(`대회 신청 약관 ${termsDocumentIds.length}건 동의 예정`);

const START_INDEX = Number(process.env.START_INDEX || '1');
const created = [];
for (let i = START_INDEX; i < START_INDEX + COUNT; i += 1) {
  try {
    created.push(await createOne(i, cookies, termsDocumentIds, entrants));
  } catch (error) {
    console.error(`[${i}] 중단: ${error.message}`);
    break;
  }
}

console.log(`\n=== 생성 완료 ${created.length}/${COUNT} ===`);
console.log(JSON.stringify(created, null, 2));
