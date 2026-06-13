// 시각 검증용 샘플 대회 시드 — 풍부한 데이터(확정팀 2·조·픽스처·결과·순위·공지).
// 정리하지 않고 남겨 소비자/어드민 화면 렌더에 사용. Run: node apps/v1_api/scripts/seed_tournament_sample.mjs
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const MGR101 = { id: '39adc75a-0702-45bd-b5fd-4cf2d295f7fd', email: 'owner@teameet.v1' };
const MGR102 = { id: '0cf89db6-3e53-406c-b896-89ade09add9a', email: 'host@teameet.v1' };
const TEAM101 = '00000000-0000-4000-8000-000000000101';
const TEAM102 = '00000000-0000-4000-8000-000000000102';
const PLAYERS101 = ['39adc75a-0702-45bd-b5fd-4cf2d295f7fd', '313d0621-04b3-47c0-88ae-4be47698c5c4', '4c094cab-4fb6-4d54-a43b-99fd3f4f9ee7', '0cf89db6-3e53-406c-b896-89ade09add9a'];
const FUTSAL = '1a82d738-c15b-47d8-b69d-0901d2719322';

async function call(method, path, who, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-v1-user-id': who.id, 'x-v1-user-email': who.email },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* */ }
  if (res.status >= 400) console.log(`  ! ${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json?.data;
}

(async () => {
  const t = await call('POST', '/admin/tournaments', ADMIN, {
    sportId: FUTSAL, title: '2026 여름 풋살 챔피언십', entryFee: 120000, teamCount: 8, minPlayers: 6, maxPlayers: 10,
    venue: '잠실 실내풋살장', rulesText: '6:6 풋살 · 조별리그 후 토너먼트 · 경기당 전·후반 20분.\n승부차기는 4강부터 적용.',
    refundPolicyText: '대회 7일 전까지 전액 환불, 이후 50%, 3일 전부터 환불 불가.',
    registrationDeadlineAt: '2026-07-10T23:59:00.000Z', scheduledAt: '2026-07-19T09:00:00.000Z',
    bankName: '토스뱅크', bankAccount: '100012345678', bankHolder: '팀밋',
  });
  const tid = t.id;
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'open' });

  // 2팀 확정
  const reg1 = await call('POST', `/tournaments/${tid}/registrations`, MGR101, { teamId: TEAM101 });
  await call('POST', `/tournaments/${tid}/registrations/${reg1.id}/submit`, MGR101, { paymentMethod: 'bank_transfer', depositorName: '김주장', agreedRules: true, agreedPrivacy: true, agreedRefund: true });
  await call('PATCH', `/admin/registrations/${reg1.id}/confirm-payment`, ADMIN, { note: '입금확인' });
  await call('PATCH', `/admin/registrations/${reg1.id}/confirm`, ADMIN, { decision: 'confirm' });
  const reg2 = await call('POST', `/tournaments/${tid}/registrations`, MGR102, { teamId: TEAM102 });
  await call('POST', `/tournaments/${tid}/registrations/${reg2.id}/submit`, MGR102, { paymentMethod: 'pg', agreedRules: true, agreedPrivacy: true, agreedRefund: true });
  const prep = await call('POST', `/tournaments/${tid}/registrations/${reg2.id}/payment/prepare`, MGR102);
  await call('POST', `/tournaments/${tid}/registrations/${reg2.id}/payment/confirm`, MGR102, { paymentKey: prep.paymentKey, orderId: prep.orderId, amount: prep.amount });
  await call('PATCH', `/admin/registrations/${reg2.id}/confirm`, ADMIN, { decision: 'confirm' });

  // 명단(team101)
  for (let i = 0; i < PLAYERS101.length; i++) {
    await call('POST', `/tournaments/${tid}/registrations/${reg1.id}/players`, MGR101, { userId: PLAYERS101[i], realName: ['김민준', '이서준', '박도윤', '최주원'][i], eligibilityStatus: i === 0 ? 'pro' : 'non_pro' });
  }

  // 대진 + 결과 + 순위
  const grp = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: 'A' });
  await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: grp.id, registrationId: reg1.id });
  await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: grp.id, registrationId: reg2.id });
  const fx = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: grp.id, round: '조별리그 1경기', fixtureNumber: 1, homeRegistrationId: reg1.id, awayRegistrationId: reg2.id, scheduledAt: '2026-07-19T10:00:00.000Z', venue: 'A코트' });
  await call('POST', `/admin/fixtures/${fx.id}/result`, ADMIN, { homeScore: 3, awayScore: 1 });
  // 미정 픽스처 하나(TBD 렌더 확인)
  await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: grp.id, round: '조별리그 2경기', fixtureNumber: 2, scheduledAt: '2026-07-19T11:00:00.000Z', venue: 'A코트' });
  await call('POST', `/admin/tournaments/${tid}/standings/recalculate`, ADMIN);

  // 공지
  await call('POST', `/admin/tournaments/${tid}/announcements`, ADMIN, { title: '대진표가 발표되었습니다', body: 'A조 일정을 확인해 주세요. 경기 30분 전 도착 부탁드립니다.', publish: true });

  console.log(`SEEDED tournament id=${tid}`);
})();
