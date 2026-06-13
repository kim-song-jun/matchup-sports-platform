// 대회 어드민 CRUD 스모크 — Wave 2 V1Tournament 엔드포인트 검증.
// Run: node apps/v1_api/scripts/test_tournament_admin.mjs   (v1_api 8121 기동 전제)
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const OWNER = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const SUPPORT = { id: '00000000-0000-4000-8000-000000001008', email: 'coverage-signup@teameet.v1' };
const NON_ADMIN = { id: '0cf89db6-3e53-406c-b896-89ade09add9a', email: 'host@teameet.v1' };
const FUTSAL = '1a82d738-c15b-47d8-b69d-0901d2719322';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${detail ?? ''}`); }
}

async function call(method, path, who, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-v1-user-id': who.id,
      'x-v1-user-email': who.email,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

(async () => {
  // 1. create as owner
  const created = await call('POST', '/admin/tournaments', OWNER, {
    sportId: FUTSAL,
    title: '스모크 테스트 대회',
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 120000,
    bankName: '토스뱅크',
    bankAccount: '100012345678',
    bankHolder: '팀밋',
  });
  check('create(owner) → 201', created.status === 201, `status=${created.status} ${JSON.stringify(created.json)}`);
  const t = created.json?.data;
  check('create returns draft status', t?.status === 'draft', `status=${t?.status}`);
  check('create returns registrationCount 0', t?.registrationCount === 0);
  const id = t?.id;

  // 2. list as owner
  const list = await call('GET', '/admin/tournaments?limit=50', OWNER);
  check('list(owner) → 200', list.status === 200);
  check('list includes created', !!list.json?.data?.items?.some((x) => x.id === id));
  check('list has pageInfo', !!list.json?.data?.pageInfo);

  // 3. get as owner
  const got = await call('GET', `/admin/tournaments/${id}`, OWNER);
  check('get(owner) → 200', got.status === 200);
  check('get returns same title', got.json?.data?.title === '스모크 테스트 대회');

  // 4. update title
  const updated = await call('PATCH', `/admin/tournaments/${id}`, OWNER, { title: '수정된 대회명', entryFee: 150000 });
  check('update(owner) → 200', updated.status === 200);
  check('update applied title', updated.json?.data?.title === '수정된 대회명', `title=${updated.json?.data?.title}`);
  check('update applied entryFee', updated.json?.data?.entryFee === 150000);

  // 5. status draft → open
  const open = await call('POST', `/admin/tournaments/${id}/status`, OWNER, { status: 'open' });
  check('status draft→open → 201', open.status === 201, `status=${open.status} ${JSON.stringify(open.json)}`);
  check('status transition recorded', open.json?.data?.previousStatus === 'draft' && open.json?.data?.status === 'open');

  // 6. invalid transition open → completed
  const bad = await call('POST', `/admin/tournaments/${id}/status`, OWNER, { status: 'completed' });
  check('status open→completed → 409', bad.status === 409, `status=${bad.status}`);
  check('409 has transition code', bad.json?.code === 'TOURNAMENT_STATUS_TRANSITION_INVALID' || bad.json?.error?.code === 'TOURNAMENT_STATUS_TRANSITION_INVALID', JSON.stringify(bad.json));

  // 7. support admin cannot create
  const supCreate = await call('POST', '/admin/tournaments', SUPPORT, { sportId: FUTSAL, title: 'support 시도' });
  check('create(support) → 403', supCreate.status === 403, `status=${supCreate.status}`);

  // 8. non-admin cannot create
  const naCreate = await call('POST', '/admin/tournaments', NON_ADMIN, { sportId: FUTSAL, title: 'non-admin 시도' });
  check('create(non-admin) → 403', naCreate.status === 403, `status=${naCreate.status}`);

  // 9. validation: minPlayers > maxPlayers
  const badRange = await call('POST', '/admin/tournaments', OWNER, { sportId: FUTSAL, title: 'bad range', minPlayers: 10, maxPlayers: 6 });
  check('create min>max → 400', badRange.status === 400, `status=${badRange.status}`);

  // 10. validation: bad sportId
  const badSport = await call('POST', '/admin/tournaments', OWNER, { sportId: '00000000-0000-0000-0000-000000000000', title: 'bad sport' });
  check('create bad sportId → 400', badSport.status === 400, `status=${badSport.status}`);

  // cleanup: cancel the test tournament (open → cancelled) so list stays tidy
  if (id) await call('POST', `/admin/tournaments/${id}/status`, OWNER, { status: 'cancelled', reason: 'smoke test cleanup' });

  console.log(`\n=== ${pass} passed / ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
