// 대회 knockout 포맷 E2E 스모크 — 토너먼트 브래킷(4강·결승·3위전) 경로 전용 검증.
//
// knockout 대회는 단판 탈락제: 조 편성 없이 knockout 단계(semi/final/third_place)
// 그룹을 직접 생성 → 픽스처 배치 → 결과 기록.
// GET /tournaments/:id 응답에 groups[](phase!=group) + fixtures[](브래킷 라운드) 가
// 반드시 존재해야 한다.
// standings(순위표)는 knockout에는 없으므로 모든 그룹 standings[]가 비어야 한다.
//
// Run: V1_PORT=8121 node apps/v1_api/scripts/test_tournament_knockout_e2e.mjs
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
  console.log('=== knockout format E2E smoke ===\n');

  // ── 1. 대회 생성 (format: knockout) ────────────────────────────────────────
  const t = await call('POST', '/admin/tournaments', ADMIN, {
    sportId: FUTSAL,
    title: 'E2E 녹아웃 토너먼트',
    format: 'knockout',
    entryFee: 80000,
    minPlayers: 1,
    maxPlayers: 10,
    teamCount: 4,
  });
  const tid = t.data?.id;
  check('admin create tournament (format=knockout)', t.status === 201 && !!tid, JSON.stringify(t.json));
  check('tournament format=knockout serialized', t.data?.format === 'knockout', JSON.stringify(t.data?.format));

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
  check('admin confirm team101 → confirmed', cf1.data?.status === 'confirmed', JSON.stringify(cf1.json));

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

  // ── 4. knockout 단계 그룹 생성 (phase≠group) ─────────────────────────────
  // 4강 (semi)
  const grpSemi = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: '4강', phase: 'semi', sortOrder: 1 });
  const gidSemi = grpSemi.data?.id;
  check('create knockout group 4강 (phase=semi)', grpSemi.status === 201 && !!gidSemi, JSON.stringify(grpSemi.json));
  check('semi group phase=semi', grpSemi.data?.phase === 'semi', JSON.stringify(grpSemi.data?.phase));

  // 결승 (final)
  const grpFinal = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: '결승', phase: 'final', sortOrder: 2 });
  const gidFinal = grpFinal.data?.id;
  check('create knockout group 결승 (phase=final)', grpFinal.status === 201 && !!gidFinal, JSON.stringify(grpFinal.json));

  // 3·4위전 (third_place)
  const grpThird = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: '3·4위전', phase: 'third_place', sortOrder: 3 });
  const gidThird = grpThird.data?.id;
  check('create knockout group 3·4위전 (phase=third_place)', grpThird.status === 201 && !!gidThird, JSON.stringify(grpThird.json));

  // ── 5. knockout 픽스처 생성 (4강 → 결승 + 3위전) ─────────────────────────
  // 4강 1경기: team101 vs team102
  const fxSemi1 = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, {
    groupId: gidSemi,
    round: '4강',
    fixtureNumber: 1,
    homeRegistrationId: reg1,
    awayRegistrationId: reg2,
    venue: 'A코트',
  });
  const fidSemi1 = fxSemi1.data?.id;
  check('create semi-final fixture 1', fxSemi1.status === 201 && !!fidSemi1, JSON.stringify(fxSemi1.json));
  check('semi fixture round=4강', fxSemi1.data?.round === '4강', JSON.stringify(fxSemi1.data?.round));

  // 4강 2경기: TBD vs TBD (미정 슬롯)
  const fxSemi2 = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, {
    groupId: gidSemi,
    round: '4강',
    fixtureNumber: 2,
    venue: 'B코트',
  });
  const fidSemi2 = fxSemi2.data?.id;
  check('create semi-final fixture 2 (TBD slots)', fxSemi2.status === 201 && !!fidSemi2, JSON.stringify(fxSemi2.json));
  check('semi fixture 2 homeRegistrationId=null (TBD)', fxSemi2.data?.homeRegistrationId === null, JSON.stringify(fxSemi2.data?.homeRegistrationId));

  // 결승 1경기: 승자(reg1) vs TBD
  const fxFinal = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, {
    groupId: gidFinal,
    round: '결승',
    fixtureNumber: 1,
    homeRegistrationId: reg1,
    venue: '메인코트',
  });
  const fidFinal = fxFinal.data?.id;
  check('create final fixture', fxFinal.status === 201 && !!fidFinal, JSON.stringify(fxFinal.json));

  // 3·4위전: 패자(reg2) vs TBD
  const fxThird = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, {
    groupId: gidThird,
    round: '3·4위전',
    fixtureNumber: 1,
    homeRegistrationId: reg2,
    venue: 'A코트',
  });
  const fidThird = fxThird.data?.id;
  check('create 3rd-place fixture', fxThird.status === 201 && !!fidThird, JSON.stringify(fxThird.json));

  // ── 6. 결과 기록 — 4강 1경기 (team101 승, 승부차기 포함) ──────────────────
  const resSemi1 = await call('POST', `/admin/fixtures/${fidSemi1}/result`, ADMIN, {
    homeScore: 1,
    awayScore: 1,
    hasPenalty: true,
    homePenaltyScore: 5,
    awayPenaltyScore: 4,
    note: '승부차기 끝에 홈팀 승',
  });
  check('record semi-final result with penalty', resSemi1.status === 201, `${resSemi1.status} ${JSON.stringify(resSemi1.json)}`);
  check('semi-final hasPenalty=true', resSemi1.data?.hasPenalty === true, JSON.stringify(resSemi1.data));
  check('semi-final homePenaltyScore=5 awayPenaltyScore=4', resSemi1.data?.homePenaltyScore === 5 && resSemi1.data?.awayPenaltyScore === 4, JSON.stringify(resSemi1.data));

  // 결승 결과
  const resFinal = await call('POST', `/admin/fixtures/${fidFinal}/result`, ADMIN, { homeScore: 2, awayScore: 0 });
  check('record final result (2-0)', resFinal.status === 201, `${resFinal.status} ${JSON.stringify(resFinal.json)}`);

  // ── 7. 소비자 GET /tournaments/:id — knockout 포맷 응답 검증 ───────────────
  const detail = await call('GET', `/tournaments/${tid}`, MGR101);
  check('consumer GET detail returns 200', detail.status === 200, `${detail.status}`);
  check('detail format=knockout', detail.data?.format === 'knockout', JSON.stringify(detail.data?.format));

  // groups[] 존재 (knockout 단계 그룹들)
  const groups = detail.data?.groups ?? [];
  check('detail has groups[] (knockout phases)', groups.length >= 3, `groups.length=${groups.length}`);

  // knockout 그룹은 phase가 semi/final/third_place — group phase 없음
  const phases = groups.map((g) => g.phase);
  check('knockout groups contain semi phase', phases.includes('semi'), JSON.stringify(phases));
  check('knockout groups contain final phase', phases.includes('final'), JSON.stringify(phases));
  check('knockout groups contain third_place phase', phases.includes('third_place'), JSON.stringify(phases));
  check('knockout groups do NOT contain group phase', !phases.includes('group'), JSON.stringify(phases));

  // knockout에는 standings[]가 없어야 함 (조별리그 집계 없음)
  const allStandings = groups.flatMap((g) => g.standings ?? []);
  check('knockout detail has NO standings (bracket only)', allStandings.length === 0, `standings count=${allStandings.length}`);

  // fixtures[] 존재 (브래킷 픽스처)
  const fixtures = detail.data?.fixtures ?? [];
  check('detail has fixtures[] (bracket rounds)', fixtures.length >= 4, `fixtures.length=${fixtures.length}`);

  // 각 픽스처에 round, groupId 필드 존재
  const fixtureRounds = fixtures.map((f) => f.round);
  check('fixtures include 4강 round', fixtureRounds.includes('4강'), JSON.stringify(fixtureRounds));
  check('fixtures include 결승 round', fixtureRounds.includes('결승'), JSON.stringify(fixtureRounds));
  check('fixtures include 3·4위전 round', fixtureRounds.includes('3·4위전'), JSON.stringify(fixtureRounds));

  // TBD 슬롯 픽스처 검증 — homeTeamName/awayTeamName이 'TBD'
  const tbdFix = fixtures.find((f) => f.homeRegistrationId === null || f.awayRegistrationId === null);
  check('TBD slot fixture exists with null registrationId', !!tbdFix, JSON.stringify(fixtures.map((f) => ({ r: f.round, h: f.homeRegistrationId, a: f.awayRegistrationId }))));
  check('TBD slot teamName serialized as TBD', tbdFix?.homeTeamName === 'TBD' || tbdFix?.awayTeamName === 'TBD', JSON.stringify(tbdFix));

  // 완료된 픽스처에는 result 포함
  const completedFixtures = fixtures.filter((f) => f.result !== null);
  check('completed knockout fixtures have result object', completedFixtures.length >= 2, `completedFixtures.length=${completedFixtures.length}`);

  // 승부차기 결과 검증
  const penaltyFix = fixtures.find((f) => f.result?.hasPenalty === true);
  check('penalty fixture result preserved in GET response', !!penaltyFix, JSON.stringify(completedFixtures.map((f) => ({ round: f.round, hp: f.result?.hasPenalty }))));
  check('penalty fixture homePenaltyScore=5', penaltyFix?.result?.homePenaltyScore === 5, JSON.stringify(penaltyFix?.result));

  // ── 8. 어드민 브래킷 뷰 — knockout 포맷에서 동작 ──────────────────────────
  const bracket = await call('GET', `/admin/tournaments/${tid}/bracket`, ADMIN);
  check('admin bracket GET → 200', bracket.status === 200, `${bracket.status}`);
  check('bracket has groups[] (semi/final/third_place)', (bracket.data?.groups?.length ?? 0) >= 3, JSON.stringify(bracket.data?.groups?.length));
  check('bracket has fixtures[] (knockout rounds)', (bracket.data?.fixtures?.length ?? 0) >= 4, JSON.stringify(bracket.data?.fixtures?.length));
  // knockout에서 standings[]는 빈 배열
  check('bracket standings[] empty for knockout', (bracket.data?.standings?.length ?? 0) === 0, JSON.stringify(bracket.data?.standings?.length));

  // ── 9. recalculate standings는 knockout phase 그룹을 제외함 ──────────────
  // knockout format 대회에서도 recalculate 호출은 OK (group phase 없어 groupCount=0)
  const recalc = await call('POST', `/admin/tournaments/${tid}/standings/recalculate`, ADMIN);
  check('standings recalculate → 201 (groupCount=0 for knockout)', recalc.status === 201 && recalc.data?.groupCount === 0, `${recalc.status} groupCount=${recalc.data?.groupCount}`);

  // ── 10. 소비자 목록에서도 조회 가능 ────────────────────────────────────────
  const list = await call('GET', '/tournaments?status=open', MGR101);
  check('consumer list includes knockout tournament', !!list.data?.items?.some((x) => x.id === tid), `count=${list.data?.items?.length}`);

  // ── cleanup ──────────────────────────────────────────────────────────────
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'cancelled', reason: 'e2e cleanup' });

  console.log(`\n=== ${pass} passed / ${fail} failed === (tid=${tid})`);
  process.exit(fail === 0 ? 0 : 1);
})();
