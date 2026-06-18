// Toss-친근화 after-캡처용 시나리오 시드 (DB 리셋 후 새 UUID). TID를 stdout 마지막 줄에 출력.
// Run: node apps/v1_api/scripts/seed_friendly_demo.mjs
const BASE = `http://localhost:${process.env.V1_PORT ?? '8121'}/api/v1`;
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const OWNER101 = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };
const OWNER102 = { id: '131fb588-b468-4652-ae73-4396a86c44a5', email: 'host@teameet.v1' };
const TEAM101 = '00000000-0000-4000-8000-000000000101';
const TEAM102 = '00000000-0000-4000-8000-000000000102';
const FUTSAL = '3e5ecde3-40c1-461d-9af9-25fd8a85550b';

async function call(method, path, who, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-v1-user-id': who.id, 'x-v1-user-email': who.email },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await res.json(); } catch { /* */ }
  if (res.status >= 400) console.log(`  ! ${method} ${path} → ${res.status} ${JSON.stringify(j)?.slice(0, 160)}`);
  return j?.data;
}

(async () => {
  // 1. 대회 생성 (group_knockout) + 계좌/규정/일정 PATCH
  const t = await call('POST', '/admin/tournaments', ADMIN, {
    sportId: FUTSAL, title: '2026 여름 풋살 챔피언십', format: 'group_knockout',
    entryFee: 120000, minPlayers: 6, maxPlayers: 10, teamCount: 8,
  });
  const tid = t?.id;
  await call('PATCH', `/admin/tournaments/${tid}`, ADMIN, {
    venue: '잠실 실내풋살장',
    scheduledAt: '2026-07-19T18:00:00.000Z',
    registrationDeadlineAt: '2026-07-11T08:59:00.000Z',
    bankName: '토스뱅크', bankAccount: '100012345678', bankHolder: '팀장',
    rulesText: '5인제 풋살, 전·후반 각 20분. 경기 30분 전 도착 필수.',
    refundPolicyText: '대회 7일 전까지 전액 환불, 이후 50% 환불.',
  });
  await call('POST', `/admin/tournaments/${tid}/status`, ADMIN, { status: 'open' });

  // 2. 두 팀 등록 → 계좌이체 → 확정
  async function registerConfirm(who, teamId, depositor) {
    const r = await call('POST', `/tournaments/${tid}/registrations`, who, { teamId });
    const rid = r?.id;
    await call('POST', `/tournaments/${tid}/registrations/${rid}/submit`, who, {
      paymentMethod: 'bank_transfer', depositorName: depositor,
      agreedRules: true, agreedPrivacy: true, agreedRefund: true,
    });
    await call('PATCH', `/admin/registrations/${rid}/confirm-payment`, ADMIN, { note: '입금확인' });
    await call('PATCH', `/admin/registrations/${rid}/confirm`, ADMIN, { decision: 'confirm' });
    return rid;
  }
  const reg1 = await registerConfirm(OWNER101, TEAM101, '김주장');
  const reg2 = await registerConfirm(OWNER102, TEAM102, '이호스트');

  // 3. 조별리그 A조 + 픽스처 + 결과 + 순위
  const gA = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: 'A조', phase: 'group', sortOrder: 0 });
  await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: gA.id, registrationId: reg1 });
  await call('POST', `/admin/tournaments/${tid}/group-teams`, ADMIN, { groupId: gA.id, registrationId: reg2 });
  const f1 = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: gA.id, round: '조별 1라운드', fixtureNumber: 1, homeRegistrationId: reg1, awayRegistrationId: reg2, venue: 'A코트' });
  await call('POST', `/admin/fixtures/${f1.id}/result`, ADMIN, { homeScore: 2, awayScore: 1 });
  const f2 = await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: gA.id, round: '조별 2라운드', fixtureNumber: 2, homeRegistrationId: reg2, awayRegistrationId: reg1, venue: 'B코트' });
  await call('POST', `/admin/fixtures/${f2.id}/result`, ADMIN, { homeScore: 0, awayScore: 0 });
  await call('POST', `/admin/tournaments/${tid}/standings/recalculate`, ADMIN);

  // 4. 녹아웃 단계 (4강·결승·3·4위전) + TBD 슬롯
  const semi = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: '4강', phase: 'semi', sortOrder: 1 });
  await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: semi.id, round: '4강', fixtureNumber: 1, homeRegistrationId: reg1, awayRegistrationId: reg2, venue: 'A코트' });
  await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: semi.id, round: '4강', fixtureNumber: 2, venue: 'B코트' });
  const fin = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: '결승', phase: 'final', sortOrder: 2 });
  await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: fin.id, round: '결승', fixtureNumber: 1, homeRegistrationId: reg1, venue: '메인코트' });
  const third = await call('POST', `/admin/tournaments/${tid}/groups`, ADMIN, { name: '3·4위전', phase: 'third_place', sortOrder: 3 });
  await call('POST', `/admin/tournaments/${tid}/fixtures`, ADMIN, { groupId: third.id, round: '3·4위전', fixtureNumber: 1, homeRegistrationId: reg2, venue: 'A코트' });

  // 5. 공지 발행
  const ann = await call('POST', `/admin/tournaments/${tid}/announcements`, ADMIN, { title: '대진표가 발표됐어요', body: 'A조 일정을 확인해 주세요. 경기 30분 전까지 도착해 주세요.', audience: 'all_registered' });
  await call('PATCH', `/admin/announcements/${ann.id}/publish`, ADMIN, { publish: true });

  console.log('SEEDED');
  console.log(`TID=${tid}`);
  console.log(`OWNER101=${OWNER101.id} ADMIN=${ADMIN.id}`);
})();
