// 대회 league 포맷 E2E 스모크 — 순위표(standings) + 픽스처 경로 전용 검증.
//
// league 대회는 단순 리그 방식: 조 편성 → 라운드로빈 픽스처 → 결과 기록 → 순위 재계산.
// GET /tournaments/:id 응답에 groups[].standings 가 반드시 존재해야 한다.
//
// Run: V1_PORT=8121 node apps/v1_api/scripts/test_tournament_league_e2e.mjs
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const MGR101 = { id: '39adc75a-0702-45bd-b5fd-4cf2d295f7fd', email: 'owner@teameet.v1' };
const MGR102 = { id: '0cf89db6-3e53-406c-b896-89ade09add9a', email: 'host@teameet.v1' };
const TEAM101 = '00000000-0000-4000-8000-000000000101';
const TEAM102 = '00000000-0000-4000-8000-000000000102';
const FUTSAL = '1a82d738-c15b-47d8-b69d-0901d2719322';

let pass = 0, fail = 0;
const check = (n, c, d) => (c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} — ${d ?? ''}`)));

async function call(method, path, who, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-v1-user-id': who.id, 'x-v1-user-email': who.email },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json, data: json?.data };
}

(async () => {
  console.log('=== league format E2E smoke ===\n');

  // ── 1. 대회 생성 (format: league) ──────────────────────────────────────────
  const t = await call('POST', '/admin/tournaments', ADMIN, {
    sportId: FUTSAL,
    title: 'E2E 리그전 대회',
    format: 'league',
    entryFee: 50000,
    minPlayers: 1,
    maxPlayers: 10,
    teamCount: 4,
  });
  const tid = t.data?.id;
  check('admin create tournament (format=league)', t.status === 201 && !!tid, JSON.stringify(t.json));
  check('tournament format=league serialized', t.data?.format === 'league', JSON.stringify(t.data?.format));

  // open 상태로 전환
  const openRes = await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'open' });
  check('tournament status → open', openRes.status === 201 || openRes.data?.status === 'open', `${openRes.status}`);

  // ── 2. 팀 101 등록 → bank_transfer 결제 흐름 ───────────────────────────────
  const r1 = await call('POST', `/tournaments/${tid}/registrations`, MGR101, { teamId: TEAM101 });
  const reg1 = r1.data?.id;
  check('reg team101 → draft', r1.data?.status === 'draft', JSON.stringify(r1.json));

  const s1 = await call('POST', `/tournaments/${tid}/registrations/${reg1}/submit`, MGR101, {
    paymentMethod: 'bank_transfer',
    depositorName: '김주장',
    agreedRules: true,
    agreedPrivacy: true,
    agreedRefund: true,
  });
  check('submit bank → awaiting_payment', s1.data?.status === 'awaiting_payment', JSON.stringify(s1.json));

  const cp1 = await call('PATCH', `/admin/registrations/${reg1}/confirm-payment`, ADMIN, { note: '입금확인' });
  check('admin confirm-payment → 200', cp1.status === 200, `${cp1.status}`);

  const cf1 = await call('PATCH', `/admin/registrations/${reg1}/confirm`, ADMIN, { decision: 'confirm' });
  check('admin confirm → confirmed', cf1.data?.status === 'confirmed', JSON.stringify(cf1.json));

  // ── 3. 팀 102 등록 → PG 결제 흐름 ────────────────────────────────────────
  const r2 = await call('POST', `/tournaments/${tid}/registrations`, MGR102, { teamId: TEAM102 });
  const reg2 = r2.data?.id;
  check('reg team102 → draft', r2.data?.status === 'draft', JSON.stringify(r2.json));

  await call('POST', `/tournaments/${tid}/registrations/${reg2}/submit`, MGR102, {
    paymentMethod: 'pg',
    agreedRules: true,
    agreedPrivacy: true,
    agreedRefund: true,
  });
  const prep = await call('POST', `/tournaments/${tid}/registrations/${reg2}/payment/prepare`, MGR102);
  check('pg prepare → paymentKey', !!prep.data?.paymentKey, JSON.stringify(prep.json));

  const pgConf = await call('POST', `/tournaments/${tid}/registrations/${reg2}/payment/confirm`, MGR102, {
    paymentKey: prep.data?.paymentKey,
    orderId: prep.data?.orderId,
    amount: prep.data?.amount,
  });
  check('pg confirm → registration paid', pgConf.data?.status === 'paid' || pgConf.status === 201, `${pgConf.status} ${JSON.stringify(pgConf.json)}`);

  const cf2 = await call('PATCH', `/admin/registrations/${reg2}/confirm`, ADMIN, { decision: 'confirm' });
  check('admin confirm team102 → confirmed', cf2.data?.status === 'confirmed', JSON.stringify(cf2.json));

  // ── 4. 리그 조 생성 (phase=group) ─────────────────────────────────────────
  const grpA = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: 'A조', phase: 'group', sortOrder: 0 });
  const gidA = grpA.data?.id;
  check('create league group A (phase=group)', grpA.status === 201 && !!gidA, JSON.stringify(grpA.json));
  check('group phase=group', grpA.data?.phase === 'group', JSON.stringify(grpA.data?.phase));

  // 두 팀을 A조에 배정
  const gt1 = await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: gidA, registrationId: reg1 });
  const gt2 = await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: gidA, registrationId: reg2 });
  check('assign 2 teams to league group', gt1.status === 201 && gt2.status === 201, `${gt1.status}/${gt2.status}`);

  // ── 5. 리그 픽스처 생성 (라운드로빈 2라운드: 홈/어웨이 각 1경기) ──────────
  const fx1 = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, {
    groupId: gidA,
    round: '1라운드',
    fixtureNumber: 1,
    homeRegistrationId: reg1,
    awayRegistrationId: reg2,
    venue: 'A코트',
  });
  const fid1 = fx1.data?.id;
  check('create league fixture 1 (round robin leg 1)', fx1.status === 201 && !!fid1, JSON.stringify(fx1.json));

  const fx2 = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, {
    groupId: gidA,
    round: '2라운드',
    fixtureNumber: 2,
    homeRegistrationId: reg2,
    awayRegistrationId: reg1,
    venue: 'B코트',
  });
  const fid2 = fx2.data?.id;
  check('create league fixture 2 (round robin leg 2)', fx2.status === 201 && !!fid2, JSON.stringify(fx2.json));

  // ── 6. 경기 결과 기록 ─────────────────────────────────────────────────────
  // 1라운드: team101(홈) 2 — 1 team102(어웨이) → team101 승, 3점
  const res1 = await call('POST', `/admin/fixtures/${fid1}/result`, ADMIN, { homeScore: 2, awayScore: 1 });
  check('record league result 1 (2-1)', res1.status === 201, `${res1.status} ${JSON.stringify(res1.json)}`);
  check('fixture 1 homeScore=2', res1.data?.homeScore === 2, JSON.stringify(res1.data));

  // 2라운드: team102(홈) 0 — 0 team101(어웨이) → 무승부, 각 1점
  const res2 = await call('POST', `/admin/fixtures/${fid2}/result`, ADMIN, { homeScore: 0, awayScore: 0 });
  check('record league result 2 (0-0 draw)', res2.status === 201, `${res2.status} ${JSON.stringify(res2.json)}`);
  check('fixture 2 hasPenalty=false (regular draw)', res2.data?.hasPenalty === false, JSON.stringify(res2.data));

  // ── 7. 순위 재계산 ────────────────────────────────────────────────────────
  // team101: 1승 1무 = 4점, team102: 0승 1무 1패 = 1점 (리그 기준)
  // 실제 집계: 1라운드 team101 win(3pt) + 2라운드 team102-as-home draw(1pt for each)
  // → team101 최종: 3 + 1(무) = 4점, team102 최종: 0 + 1(무) = 1점(패1 + 무1)
  // wait: 2라운드 home=team102, away=team101. home goal=0, away goal=0. 양쪽 무승부 각 1점
  // team101 합산: 1라운드 3점(승) + 2라운드 1점(무) = 4점
  // team102 합산: 1라운드 0점(패) + 2라운드 1점(무) = 1점
  const recalc = await call('POST', `/admin/tournaments/${tid}/standings/recalculate`, ADMIN);
  check('recalculate standings → groupCount=1', recalc.status === 201 && recalc.data?.groupCount === 1, JSON.stringify(recalc.json));

  // ── 8. 소비자 GET /tournaments/:id — league 포맷 응답 검증 ─────────────────
  const detail = await call('GET', `/tournaments/${tid}`, MGR101);
  check('consumer GET detail returns 200', detail.status === 200, `${detail.status}`);
  check('detail format=league', detail.data?.format === 'league', JSON.stringify(detail.data?.format));

  // groups 존재
  const groups = detail.data?.groups ?? [];
  check('detail has groups[] (league groups)', groups.length >= 1, `groups.length=${groups.length}`);

  // standings는 groups[].standings 내에 중첩
  const allStandings = groups.flatMap((g) => g.standings ?? []);
  check('detail groups have nested standings[]', allStandings.length >= 2, `standings count=${allStandings.length}`);

  // 순위 1위 팀은 team101 (4점), 2위 팀은 team102 (1점)
  const standing1 = allStandings.find((s) => s.registrationId === reg1);
  const standing2 = allStandings.find((s) => s.registrationId === reg2);
  check('standings: team101 position=1 (4pts, 1W1D)', standing1?.position === 1 && standing1?.points === 4, JSON.stringify(standing1));
  check('standings: team102 position=2 (1pt, 1D1L)', standing2?.position === 2 && standing2?.points === 1, JSON.stringify(standing2));
  check('standings: team101 wins=1 draws=1 losses=0', standing1?.wins === 1 && standing1?.draws === 1 && standing1?.losses === 0, JSON.stringify(standing1));
  check('standings: team102 wins=0 draws=1 losses=1', standing2?.wins === 0 && standing2?.draws === 1 && standing2?.losses === 1, JSON.stringify(standing2));
  // leg1: team101(home)=2, team102(away)=1. leg2: team102(home)=0, team101(away)=0.
  // team101 goalsFor = 2(leg1 home) + 0(leg2 away) = 2; goalsAgainst = 1(leg1) + 0(leg2) = 1.
  check('standings: team101 goalsFor=2 goalsAgainst=1', standing1?.goalsFor === 2 && standing1?.goalsAgainst === 1, JSON.stringify(standing1));

  // fixtures 존재 — league 포맷에서도 fixtures[] 노출
  const fixtures = detail.data?.fixtures ?? [];
  check('detail has fixtures[] (league schedule)', fixtures.length >= 2, `fixtures.length=${fixtures.length}`);

  // 결과가 있는 픽스처에는 result 포함
  const withResult = fixtures.filter((f) => f.result !== null);
  check('league fixtures have result objects', withResult.length >= 2, `withResult.length=${withResult.length}`);

  // ── 9. 어드민 브래킷 뷰 — league 포맷에서도 동작해야 함 ───────────────────
  const bracket = await call('GET', `/admin/tournaments/${tid}/bracket`, ADMIN);
  check('admin bracket GET → 200', bracket.status === 200, `${bracket.status}`);
  check('bracket has groups[]', (bracket.data?.groups?.length ?? 0) >= 1, JSON.stringify(bracket.data?.groups?.length));
  check('bracket has fixtures[]', (bracket.data?.fixtures?.length ?? 0) >= 2, JSON.stringify(bracket.data?.fixtures?.length));
  check('bracket has standings[]', (bracket.data?.standings?.length ?? 0) >= 2, JSON.stringify(bracket.data?.standings?.length));

  // ── 10. 소비자 목록에서도 조회 가능 ────────────────────────────────────────
  const list = await call('GET', '/tournaments?status=open', MGR101);
  check('consumer list includes league tournament', !!list.data?.items?.some((x) => x.id === tid), `count=${list.data?.items?.length}`);

  // ── cleanup ──────────────────────────────────────────────────────────────
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'cancelled', reason: 'e2e cleanup' });

  console.log(`\n=== ${pass} passed / ${fail} failed === (tid=${tid})`);
  process.exit(fail === 0 ? 0 : 1);
})();
