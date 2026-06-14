// 시드 대회에 녹아웃 단계(4강·결승·3·4위전) 추가 — 브래킷 렌더 검증용.
// Run: node apps/v1_api/scripts/seed_tournament_knockout.mjs
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const TID = 'ebe29be8-dba6-41c8-8ccf-b1747410b4e7';
const REG101 = '080050c6-8807-44b7-bf86-1c05152fb097'; // 강남 러닝 크루
const REG102 = '79ea4bef-2088-4d0e-aac6-39e091b45290'; // 송파 풋살 모임

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-v1-user-id': ADMIN.id, 'x-v1-user-email': ADMIN.email },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await res.json(); } catch { /* */ }
  if (res.status >= 400) console.log(`  ! ${method} ${path} → ${res.status} ${JSON.stringify(j)}`);
  return j?.data;
}

(async () => {
  // 4강 그룹 + 픽스처 2개
  const semi = await call('POST', `/admin/tournaments/${TID}/groups`, { name: '4강', phase: 'semi', sortOrder: 1 });
  const s1 = await call('POST', `/admin/tournaments/${TID}/fixtures`, { groupId: semi.id, round: '4강', fixtureNumber: 1, homeRegistrationId: REG101, awayRegistrationId: REG102, venue: 'A코트' });
  await call('POST', `/admin/fixtures/${s1.id}/result`, { homeScore: 2, awayScore: 1 });
  await call('POST', `/admin/tournaments/${TID}/fixtures`, { groupId: semi.id, round: '4강', fixtureNumber: 2, venue: 'B코트' }); // TBD vs TBD

  // 결승 그룹 + 픽스처(승자 reg101 vs TBD)
  const fin = await call('POST', `/admin/tournaments/${TID}/groups`, { name: '결승', phase: 'final', sortOrder: 2 });
  await call('POST', `/admin/tournaments/${TID}/fixtures`, { groupId: fin.id, round: '결승', fixtureNumber: 1, homeRegistrationId: REG101, venue: '메인코트' });

  // 3·4위전 그룹 + 픽스처(패자 reg102 vs TBD)
  const third = await call('POST', `/admin/tournaments/${TID}/groups`, { name: '3·4위전', phase: 'third_place', sortOrder: 3 });
  await call('POST', `/admin/tournaments/${TID}/fixtures`, { groupId: third.id, round: '3·4위전', fixtureNumber: 1, homeRegistrationId: REG102, venue: 'A코트' });

  console.log(`SEEDED knockout into ${TID}`);
})();
