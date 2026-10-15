import type { INestApplication } from '@nestjs/common';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueCapacityHarness, type LeagueCapacityHarness } from './helpers/league-capacity-harness';

jest.setTimeout(180000);

describe('MD-QA #145 — 참가팀 정원의 실제 HTTP/PostgreSQL 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueCapacityHarness;
  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueCapacityHarness(app);
  });
  afterAll(async () => cleanup?.());

  it('생성·설정·관리/공개 readback은 같은 팀 정원을 쓰고 기존 선수 정원은 그대로다', async () => {
    // Given: separate three-team and twenty-player caps, with two seeded participants.
    const { leagueId } = await h.makeLeague(3);
    // When: the operator raises the participant cap through the real settings route.
    const saved = await h.patchCapacity(leagueId, 4);
    // Then: persisted state, response, public/admin reads and audit agree.
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ maxTeams: 4 });
    expect(await h.settings(leagueId)).toMatchObject({ maxTeams: 4 });
    expect(await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } }))
      .toMatchObject({ maxTeams: 4, minPlayers: 1, maxPlayers: 20 });
    const adminView = await h.http().get(`/api/v1/admin/league-matches/${leagueId}`).set('x-v1-user-id', h.adminUserId).expect(200);
    const publicView = await h.http().get(`/api/v1/tournaments/${leagueId}`).expect(200);
    const leagueView = await h.http().get(`/api/v1/league-matches/${leagueId}`).expect(200);
    expect(adminView.body.data).toMatchObject({ maxTeams: 4, maxPlayers: 20 });
    expect(publicView.body.data).toMatchObject({ maxTeams: 4, maxPlayers: 20, confirmedCount: 2, pendingPaymentCount: 0 });
    expect(leagueView.body.data).toMatchObject({ maxTeams: 4 });
    const audit = await h.prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: leagueId, action: 'league_match.update_settings' } });
    expect(audit.beforeJson).toMatchObject({ maxTeams: 3 });
    expect(audit.afterJson).toMatchObject({ maxTeams: 4 });
  });

  it('점유보다 작은 정원은 저장/audit 없이 거부하고 생략·null은 서로 구분한다', async () => {
    // Given: two seeded registrations already occupy a four-team league.
    const { leagueId } = await h.makeLeague(4);
    const before = await h.settings(leagueId);
    const auditCount = await h.prisma.v1AdminActionLog.count({ where: { targetId: leagueId } });
    // When: an operator tries to shrink below those participants.
    const rejected = await h.patchCapacity(leagueId, 1);
    // Then: no change or audit is committed; legacy omission preserves and explicit null removes the limit.
    expect(rejected.status).toBe(409);
    expect(await h.settings(leagueId)).toMatchObject({ maxTeams: 4, updatedAt: before.updatedAt });
    expect(await h.prisma.v1AdminActionLog.count({ where: { targetId: leagueId } })).toBe(auditCount);
    const unrelated = await h.http().patch(h.settingsPath(leagueId)).set('x-v1-user-id', h.adminUserId)
      .send({ ...h.settingsBody(before), title: '정원은 유지하고 이름만 변경' }).expect(200);
    expect(unrelated.body.data).toMatchObject({ maxTeams: 4 });
    expect((await h.patchCapacity(leagueId, null)).body.data).toMatchObject({ maxTeams: null });
  });

  it('모든 출처의 확정·결제 대기는 점유하지만 waitlisted는 별도 대기 상태다', async () => {
    // Given: seeded/promoted participants and one payment-stage application fill capacity.
    const { leagueId, teams } = await h.makeLeague(3);
    await h.prisma.v1TournamentRegistration.updateMany({ where: { tournamentId: leagueId, teamId: teams[0].id }, data: { entrySource: 'promoted' } });
    await h.seedRegistration(leagueId, await h.makeTeam('확인 대기'), 'payment_checking');
    await h.seedRegistration(leagueId, await h.makeTeam('자리 없는 대기'), 'waitlisted');
    const incoming = await h.applicant('새 신청');
    // When: another manager starts an application through the actual route.
    const rejected = await h.http().post(`/api/v1/tournaments/${leagueId}/registrations`)
      .set('x-v1-user-id', incoming.ownerUserId).send({ teamId: incoming.id });
    // Then: the all-source reservation count, not the active-application count, blocks it.
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('TOURNAMENT_CAPACITY_FULL');
    expect(await h.countReserved(leagueId)).toBe(3);
    expect(await h.prisma.v1TournamentRegistration.findUnique({ where: { tournamentId_teamId: { tournamentId: leagueId, teamId: incoming.id } } })).toBeNull();
  });

  it('실제 PG 장벽 뒤 동시 제출 두 건은 마지막 한 자리만 차지한다', async () => {
    // Given: both draft applications exist before either reserves the last place.
    const { leagueId } = await h.makeLeague(3);
    const first = await h.draft(leagueId, await h.applicant('제출 A'));
    const second = await h.draft(leagueId, await h.applicant('제출 B'));
    // When: PostgreSQL observes both actual HTTP submit writers waiting on the same locked row.
    const results = await h.behindLeagueRowLock(leagueId, [() => h.submit(leagueId, first), () => h.submit(leagueId, second)]);
    // Then: exactly one reservation/payment commits and the other draft survives unchanged.
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(results.find(result => result.status === 409)?.body.code).toBe('TOURNAMENT_CAPACITY_FULL');
    expect(await h.countReserved(leagueId)).toBe(3);
    expect(await h.prisma.v1TournamentRegistration.count({ where: { id: { in: [first.registrationId, second.registrationId] }, status: 'draft' } })).toBe(1);
    expect(await h.prisma.v1TournamentPayment.count({ where: { registrationId: { in: [first.registrationId, second.registrationId] } } })).toBe(1);
  });

  it('실제 PG 장벽 뒤 대기팀 두 건을 동시에 확정해도 마지막 한 자리만 차지한다', async () => {
    // Given: two waitlisted applications do not yet reserve the remaining place.
    const { leagueId } = await h.makeLeague(3);
    const first = await h.seedRegistration(leagueId, await h.makeTeam('확정 A'), 'waitlisted');
    const second = await h.seedRegistration(leagueId, await h.makeTeam('확정 B'), 'waitlisted');
    const confirm = async (id: string) => h.http().patch(`/api/v1/admin/registrations/${id}/confirm`)
      .set('x-v1-user-id', h.adminUserId).send({ decision: 'confirm' });
    // When: both actual admin confirm writers are blocked behind the same PostgreSQL row lock.
    const results = await h.behindLeagueRowLock(leagueId, [() => confirm(first.id), () => confirm(second.id)]);
    // Then: one remains waitlisted and the league cannot acquire a fourth reservation.
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.find(result => result.status === 409)?.body.code).toBe('TOURNAMENT_CAPACITY_FULL');
    expect(await h.countReserved(leagueId)).toBe(3);
    expect(await h.prisma.v1TournamentRegistration.count({ where: { id: { in: [first.id, second.id] }, status: 'waitlisted' } })).toBe(1);
  });

  it('실제 PG 장벽에서 신청 제출과 관리자 직접 추가도 같은 마지막 자리를 공유한다', async () => {
    // Given: two entry paths compete for the same remaining reservation.
    const { leagueId } = await h.makeLeague(3);
    const incoming = await h.draft(leagueId, await h.applicant('제출 팀'));
    const direct = await h.makeTeam('직접 추가 팀');
    // When: both real route mutations are observed waiting on the league row.
    const results = await h.behindLeagueRowLock(leagueId, [() => h.submit(leagueId, incoming), async () =>
      h.http().post(`/api/v1/admin/league-matches/${leagueId}/teams`).set('x-v1-user-id', h.adminUserId).send({ teamId: direct.id })]);
    // Then: one fails explicitly and only three capacity reservations exist.
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(results.find(result => result.status === 409)?.body.code).toBe('TOURNAMENT_CAPACITY_FULL');
    expect(await h.countReserved(leagueId)).toBe(3);
  });

  it('실제 PG 장벽에서 정원 축소와 제출이 경합해도 저장 정원보다 점유가 커지지 않는다', async () => {
    // Given: a two-team shrink and a third-team submit are independently valid before locking.
    const { leagueId } = await h.makeLeague(3);
    const incoming = await h.draft(leagueId, await h.applicant('축소 경합 팀'));
    const snapshot = await h.settings(leagueId);
    // When: both actual mutations wait behind the same PostgreSQL row lock.
    const results = await h.behindLeagueRowLock(leagueId, [() => h.submit(leagueId, incoming), async () =>
      h.http().patch(h.settingsPath(leagueId)).set('x-v1-user-id', h.adminUserId)
        .send({ ...h.settingsBody(snapshot), maxTeams: 2 })]);
    // Then: either the shrink or the new reservation loses; neither can silently overbook.
    expect(results.filter(result => result.status === 409)).toHaveLength(1);
    expect(results.filter(result => result.status === 200 || result.status === 201)).toHaveLength(1);
    const current = await h.settings(leagueId);
    expect(current.maxTeams).toEqual(expect.any(Number));
    expect(await h.countReserved(leagueId)).toBeLessThanOrEqual(current.maxTeams ?? 0);
  });

  it('실제 PG 장벽에서 입금 확인 전 취소 요청이 커밋되면 마지막 자리를 새 신청에 돌려준다', async () => {
    const { leagueId } = await h.makeLeague(3);
    const cancelled = await h.draft(leagueId, await h.applicant('입금 확인 취소 팀'));
    const incoming = await h.draft(leagueId, await h.applicant('반환 자리 신청 팀'));
    const submitted = await h.submit(leagueId, cancelled);
    expect(submitted.status).toBe(201);
    expect(await h.countReserved(leagueId)).toBe(3);
    const auditBefore = await h.prisma.v1AdminActionLog.count({ where: {
      targetId: cancelled.registrationId, action: 'registration.confirm_payment',
    } });
    // Both actual writers must have passed their preloads and reached the same PG parent-row wait.
    const results = await h.behindLeagueRowLock(leagueId, [
      async () => h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/confirm-payment`)
        .set('x-v1-user-id', h.adminUserId).send({}),
      () => h.submit(leagueId, incoming),
    ], async () => {
      await h.http().post(`/api/v1/tournaments/${leagueId}/registrations/${cancelled.registrationId}/cancel-request`)
        .set('x-v1-user-id', cancelled.ownerUserId).send({ reason: '참가 취소 요청' }).expect(201);
    });
    expect(results[0].status).toBe(409);
    expect(results[0].body.code).toBe('REGISTRATION_STATUS_INVALID');
    expect(results[1].status).toBe(201);
    expect(await h.prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: cancelled.registrationId } }))
      .toMatchObject({ status: 'cancel_requested', cancelPreviousStatus: 'awaiting_payment' });
    expect(await h.prisma.v1TournamentPayment.findUniqueOrThrow({ where: { registrationId: cancelled.registrationId } }))
      .toMatchObject({ status: 'ready' });
    expect(await h.prisma.v1AdminActionLog.count({ where: {
      targetId: cancelled.registrationId, action: 'registration.confirm_payment',
    } })).toBe(auditBefore);
    expect(await h.countReserved(leagueId)).toBe(3);
  });

  it('실제 PG 장벽에서 최종 취소가 커밋되면 팀 철회와 관리자 잔류 처리가 둘 다 신청을 되살리지 않는다', async () => {
    const { leagueId } = await h.makeLeague(3);
    const cancelled = await h.draft(leagueId, await h.applicant('최종 취소 경합 팀'));
    const submitted = await h.submit(leagueId, cancelled);
    expect(submitted.status).toBe(201);
    await h.http().post(`/api/v1/tournaments/${leagueId}/registrations/${cancelled.registrationId}/cancel-request`)
      .set('x-v1-user-id', cancelled.ownerUserId).send({ reason: '취소 승인 대기' }).expect(201);
    const results = await h.behindLeagueRowLock(leagueId, [
      async () => h.http().post(`/api/v1/tournaments/${leagueId}/registrations/${cancelled.registrationId}/cancel-request/withdraw`)
        .set('x-v1-user-id', cancelled.ownerUserId).send({}),
      async () => h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/reject-cancel`)
        .set('x-v1-user-id', h.adminUserId).send({}),
    ], async () => {
      await h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/cancel`)
        .set('x-v1-user-id', h.adminUserId).send({}).expect(200);
    });
    expect(results[0].status).toBe(409);
    expect(results[0].body.code).toBe('REGISTRATION_CANCEL_REQUEST_NOT_WITHDRAWABLE');
    expect(results[1].status).toBe(409);
    expect(results[1].body.code).toBe('NOT_CANCEL_REQUESTED');
    expect(await h.prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: cancelled.registrationId } }))
      .toMatchObject({ status: 'cancelled', cancelPreviousStatus: null, cancelOutcome: 'approved' });
    expect(await h.prisma.v1TournamentPayment.findUniqueOrThrow({ where: { registrationId: cancelled.registrationId } }))
      .toMatchObject({ status: 'cancelled' });
    expect(await h.countReserved(leagueId)).toBe(2);
    expect(await h.prisma.v1AdminActionLog.count({ where: {
      targetId: cancelled.registrationId, action: 'tournament.registration.cancel_reject',
    } })).toBe(0);
  });

  it('실제 PG 장벽에서 입금 확인 뒤 최종 취소가 커밋되면 확정과 대기 처리가 모두 취소를 보존한다', async () => {
    const { leagueId } = await h.makeLeague(3);
    const cancelled = await h.draft(leagueId, await h.applicant('확정 대기 취소 경합 팀'));
    const submitted = await h.submit(leagueId, cancelled);
    expect(submitted.status).toBe(201);
    await h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/confirm-payment`)
      .set('x-v1-user-id', h.adminUserId).send({}).expect(200);
    const results = await h.behindLeagueRowLock(leagueId, [
      async () => h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/confirm`)
        .set('x-v1-user-id', h.adminUserId).send({ decision: 'confirm' }),
      async () => h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/confirm`)
        .set('x-v1-user-id', h.adminUserId).send({ decision: 'waitlist' }),
    ], async () => {
      await h.http().patch(`/api/v1/admin/registrations/${cancelled.registrationId}/cancel`)
        .set('x-v1-user-id', h.adminUserId).send({ reason: '최종 참가 취소' }).expect(200);
    });
    expect(results.map(result => result.status)).toEqual([409, 409]);
    expect(results.map(result => result.body.code)).toEqual(['REGISTRATION_STATUS_INVALID', 'REGISTRATION_STATUS_INVALID']);
    expect(await h.prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: cancelled.registrationId } }))
      .toMatchObject({ status: 'cancelled', cancelOutcome: 'rejected' });
    expect(await h.prisma.v1TournamentPayment.findUniqueOrThrow({ where: { registrationId: cancelled.registrationId } }))
      .toMatchObject({ status: 'cancelled' });
    expect(await h.countReserved(leagueId)).toBe(2);
    expect(await h.prisma.v1AdminActionLog.count({ where: {
      targetId: cancelled.registrationId, action: 'registration.confirm',
    } })).toBe(0);
  });
});
