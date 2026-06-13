// 대회 도메인 전 기능 E2E 라이브 스모크 — Wave 2-3 통합 검증.
// 신청(계좌+PG)→입금확인→확정→명단→CSV→대진→결과→순위→소비자조회→공지.
// Run: V1_PORT=8122 node apps/v1_api/scripts/test_tournament_e2e.mjs
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const MGR101 = { id: '39adc75a-0702-45bd-b5fd-4cf2d295f7fd', email: 'owner@teameet.v1' };  // team 101 owner
const MGR102 = { id: '0cf89db6-3e53-406c-b896-89ade09add9a', email: 'host@teameet.v1' };   // team 102 owner
const TEAM101 = '00000000-0000-4000-8000-000000000101';
const TEAM102 = '00000000-0000-4000-8000-000000000102';
const PLAYERS101 = ['39adc75a-0702-45bd-b5fd-4cf2d295f7fd', '313d0621-04b3-47c0-88ae-4be47698c5c4', '4c094cab-4fb6-4d54-a43b-99fd3f4f9ee7', '0cf89db6-3e53-406c-b896-89ade09add9a'];
const FUTSAL = '1a82d738-c15b-47d8-b69d-0901d2719322';

let pass = 0, fail = 0;
const check = (n, c, d) => (c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} — ${d ?? ''}`)));
async function call(method, path, who, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-v1-user-id': who.id, 'x-v1-user-email': who.email },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json, data: json?.data };
}

(async () => {
  // ── setup: tournament open ──
  const t = await call('POST', '/admin/tournaments', ADMIN, { sportId: FUTSAL, title: 'E2E 풋살 대회', entryFee: 90000, minPlayers: 6, maxPlayers: 10 });
  const tid = t.data?.id;
  check('admin create tournament', t.status === 201 && !!tid, JSON.stringify(t.json));
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'open' });

  // ── team 101: bank_transfer flow ──
  const r1 = await call('POST', `/tournaments/${tid}/registrations`, MGR101, { teamId: TEAM101 });
  const reg1 = r1.data?.id;
  check('reg team101 → draft', r1.data?.status === 'draft', JSON.stringify(r1.json));
  const s1 = await call('POST', `/tournaments/${tid}/registrations/${reg1}/submit`, MGR101, { paymentMethod: 'bank_transfer', depositorName: '김주장', agreedRules: true, agreedPrivacy: true, agreedRefund: true });
  check('submit bank → awaiting_payment', s1.data?.status === 'awaiting_payment', JSON.stringify(s1.json));
  const cp1 = await call('PATCH', `/admin/registrations/${reg1}/confirm-payment`, ADMIN, { note: '입금확인' });
  check('admin confirm-payment → payment_checking', cp1.data?.status === 'payment_checking' || cp1.status === 200, `${cp1.status} ${JSON.stringify(cp1.json)}`);
  const cf1 = await call('PATCH', `/admin/registrations/${reg1}/confirm`, ADMIN, { decision: 'confirm' });
  check('admin confirm → confirmed', cf1.data?.status === 'confirmed', JSON.stringify(cf1.json));

  // ── team 102: PG flow ──
  const r2 = await call('POST', `/tournaments/${tid}/registrations`, MGR102, { teamId: TEAM102 });
  const reg2 = r2.data?.id;
  check('reg team102 → draft', r2.data?.status === 'draft', JSON.stringify(r2.json));
  await call('POST', `/tournaments/${tid}/registrations/${reg2}/submit`, MGR102, { paymentMethod: 'pg', agreedRules: true, agreedPrivacy: true, agreedRefund: true });
  const prep = await call('POST', `/tournaments/${tid}/registrations/${reg2}/payment/prepare`, MGR102);
  check('pg prepare → paymentKey', !!prep.data?.paymentKey, JSON.stringify(prep.json));
  const pgConf = await call('POST', `/tournaments/${tid}/registrations/${reg2}/payment/confirm`, MGR102, { paymentKey: prep.data?.paymentKey, orderId: prep.data?.orderId, amount: prep.data?.amount });
  check('pg confirm → registration paid', pgConf.data?.status === 'paid' || pgConf.status === 201, `${pgConf.status} ${JSON.stringify(pgConf.json)}`);
  const cf2 = await call('PATCH', `/admin/registrations/${reg2}/confirm`, ADMIN, { decision: 'confirm' });
  check('admin confirm team102 → confirmed', cf2.data?.status === 'confirmed', JSON.stringify(cf2.json));

  // ── roster (team 101) ──
  for (let i = 0; i < PLAYERS101.length; i++) {
    await call('POST', `/tournaments/${tid}/registrations/${reg1}/players`, MGR101, { userId: PLAYERS101[i], realName: `선수${i + 1}`, eligibilityStatus: i === 0 ? 'pro' : 'non_pro' });
  }
  const roster = await call('GET', `/tournaments/${tid}/registrations/${reg1}/players`, MGR101);
  check('roster has 4 players', (roster.data?.players?.length ?? 0) === 4, JSON.stringify(roster.data?.players?.length));
  check('roster belowMinimum true (4<6)', roster.data?.belowMinimum === true, JSON.stringify(roster.data?.belowMinimum));

  // ── CSV export (admin) ──
  const csv = await call('GET', `/admin/registrations/${reg1}/players/export`, ADMIN);
  check('csv export contains 선수1', typeof csv.data?.csv === 'string' && csv.data.csv.includes('선수1'), JSON.stringify(Object.keys(csv.data ?? {})));

  // ── admin eligibility confirm ──
  const firstPlayerId = roster.data?.players?.[1]?.id;
  if (firstPlayerId) {
    const elig = await call('PATCH', `/admin/players/${firstPlayerId}/eligibility`, ADMIN, { eligibilityStatus: 'non_pro', note: '확인완료' });
    check('admin eligibility update → 200', elig.status === 200, `${elig.status}`);
  }

  // ── bracket: group → assign → fixture → result → standings ──
  const grp = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: 'A' });
  const gid = grp.data?.id;
  check('create group A', grp.status === 201 && !!gid, JSON.stringify(grp.json));
  const gt1 = await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: gid, registrationId: reg1 });
  const gt2 = await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: gid, registrationId: reg2 });
  check('assign 2 teams to group', gt1.status === 201 && gt2.status === 201, `${gt1.status}/${gt2.status} ${JSON.stringify(gt1.json)}`);
  const fx = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: gid, round: 'group', fixtureNumber: 1, homeRegistrationId: reg1, awayRegistrationId: reg2 });
  const fid = fx.data?.id;
  check('create fixture', fx.status === 201 && !!fid, JSON.stringify(fx.json));
  const result = await call('POST', `/admin/fixtures/${fid}/result`, ADMIN, { homeScore: 3, awayScore: 1 });
  check('record result 3-1', result.status === 201, `${result.status} ${JSON.stringify(result.json)}`);
  const recalc = await call('POST', `/admin/tournaments/${tid}/standings/recalculate`, ADMIN);
  check('recalc ran (groupCount>=1)', recalc.status === 201 && (recalc.data?.groupCount ?? 0) >= 1, JSON.stringify(recalc.json));

  // ── consumer read ──
  const list = await call('GET', '/tournaments?status=open', MGR101);
  check('consumer list includes tournament', !!list.data?.items?.some((x) => x.id === tid), `count=${list.data?.items?.length}`);
  const detail = await call('GET', `/tournaments/${tid}`, MGR101);
  // standings는 조(group)별 중첩 구조(조별순위) — groups[].standings 로 노출.
  const allStandings = (detail.data?.groups ?? []).flatMap((g) => g.standings ?? []);
  const s101 = allStandings.find((x) => x.registrationId === reg1);
  check('consumer detail has groups + nested standings', (detail.data?.groups?.length ?? 0) >= 1 && allStandings.length >= 1, JSON.stringify(Object.keys(detail.data ?? {})));
  check('detail standings: team101 3pts position 1', s101?.points === 3 && s101?.position === 1, JSON.stringify(allStandings));

  // ── announcement ──
  const ann = await call('POST', `/admin/tournaments/${tid}/announcements`, ADMIN, { title: '대진 발표', body: 'A조 일정 안내', publish: true });
  check('create+publish announcement', ann.status === 201, `${ann.status} ${JSON.stringify(ann.json)}`);
  const detail2 = await call('GET', `/tournaments/${tid}`, MGR101);
  check('consumer detail shows published announcement', (detail2.data?.announcements?.length ?? 0) >= 1, JSON.stringify(detail2.data?.announcements?.length));

  // ── cleanup ──
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'cancelled', reason: 'e2e cleanup' });

  console.log(`\n=== ${pass} passed / ${fail} failed === (tid=${tid})`);
  process.exit(fail === 0 ? 0 : 1);
})();
