// 대회 신청 상태머신 라이브 스모크 — Wave 2 V1TournamentRegistration.
// Run: V1_PORT=8122 node apps/v1_api/scripts/test_tournament_registration.mjs
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const MANAGER = { id: '313d0621-04b3-47c0-88ae-4be47698c5c4', email: 'manager@teameet.v1' }; // team 101 manager
const MEMBER = { id: '0cf89db6-3e53-406c-b896-89ade09add9a', email: 'host@teameet.v1' };      // team 101 plain member
const TEAM = '00000000-0000-4000-8000-000000000101';
const FUTSAL = '1a82d738-c15b-47d8-b69d-0901d2719322';

let pass = 0, fail = 0;
const check = (n, c, d) => (c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} — ${d ?? ''}`)));

async function call(method, path, who, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-v1-user-id': who.id, 'x-v1-user-email': who.email },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}
const code = (r) => r.json?.code ?? r.json?.error?.code;

(async () => {
  // setup: admin creates + opens tournament
  const created = await call('POST', '/admin/tournaments', ADMIN, { sportId: FUTSAL, title: '신청 스모크 대회', entryFee: 90000 });
  const tid = created.json?.data?.id;
  check('setup: tournament created', created.status === 201 && !!tid, JSON.stringify(created.json));
  const opened = await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'open' });
  check('setup: tournament open', opened.json?.data?.status === 'open');

  // 1. non-manager cannot create registration
  const naCreate = await call('POST', `/tournaments/${tid}/registrations`, MEMBER, { teamId: TEAM });
  check('create(member) → 403', naCreate.status === 403, `status=${naCreate.status}`);

  // 2. manager creates draft
  const reg = await call('POST', `/tournaments/${tid}/registrations`, MANAGER, { teamId: TEAM });
  check('create(manager) → 201 draft', reg.status === 201 && reg.json?.data?.status === 'draft', JSON.stringify(reg.json));
  const rid = reg.json?.data?.id;

  // 3. duplicate create → 409
  const dup = await call('POST', `/tournaments/${tid}/registrations`, MANAGER, { teamId: TEAM });
  check('create duplicate → 409 ALREADY_REGISTERED', dup.status === 409 && code(dup) === 'ALREADY_REGISTERED', `status=${dup.status} code=${code(dup)}`);

  // 4. submit without agreements → 400
  const noAgree = await call('POST', `/tournaments/${tid}/registrations/${rid}/submit`, MANAGER, {
    paymentMethod: 'bank_transfer', depositorName: '홍길동', agreedRules: true, agreedPrivacy: true, agreedRefund: false,
  });
  check('submit no-agreement → 400 AGREEMENTS_REQUIRED', noAgree.status === 400 && code(noAgree) === 'AGREEMENTS_REQUIRED', `code=${code(noAgree)}`);

  // 5. submit bank_transfer without depositor → 400
  const noDep = await call('POST', `/tournaments/${tid}/registrations/${rid}/submit`, MANAGER, {
    paymentMethod: 'bank_transfer', agreedRules: true, agreedPrivacy: true, agreedRefund: true,
  });
  check('submit bank no-depositor → 400 DEPOSITOR_NAME_REQUIRED', noDep.status === 400 && code(noDep) === 'DEPOSITOR_NAME_REQUIRED', `code=${code(noDep)}`);

  // 6. valid submit → awaiting_payment + payment(ready)
  const submitted = await call('POST', `/tournaments/${tid}/registrations/${rid}/submit`, MANAGER, {
    paymentMethod: 'bank_transfer', depositorName: '김매니저', agreedRules: true, agreedPrivacy: true, agreedRefund: true, agreedMediaConsent: true,
  });
  check('submit valid → awaiting_payment', submitted.json?.data?.status === 'awaiting_payment', JSON.stringify(submitted.json));
  check('submit → payment ready(bank_transfer, 90000)',
    submitted.json?.data?.payment?.method === 'bank_transfer' && submitted.json?.data?.payment?.status === 'ready' && submitted.json?.data?.payment?.amount === 90000,
    JSON.stringify(submitted.json?.data?.payment));

  // 7. re-submit (not draft) → 409
  const reSubmit = await call('POST', `/tournaments/${tid}/registrations/${rid}/submit`, MANAGER, {
    paymentMethod: 'pg', agreedRules: true, agreedPrivacy: true, agreedRefund: true,
  });
  check('re-submit not-draft → 409 REGISTRATION_NOT_DRAFT', reSubmit.status === 409 && code(reSubmit) === 'REGISTRATION_NOT_DRAFT', `code=${code(reSubmit)}`);

  // 8. get registration (manager)
  const got = await call('GET', `/tournaments/${tid}/registrations/${rid}`, MANAGER);
  check('get(manager) → 200 awaiting_payment', got.status === 200 && got.json?.data?.status === 'awaiting_payment');

  // 9. cancel-request (awaiting_payment → cancel_requested)
  const cancel = await call('POST', `/tournaments/${tid}/registrations/${rid}/cancel-request`, MANAGER, { reason: '스모크 정리' });
  check('cancel-request → cancel_requested', cancel.json?.data?.status === 'cancel_requested', JSON.stringify(cancel.json));

  // cleanup
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'cancelled', reason: 'smoke cleanup' });

  console.log(`\n=== ${pass} passed / ${fail} failed === (tid=${tid})`);
  process.exit(fail === 0 ? 0 : 1);
})();
