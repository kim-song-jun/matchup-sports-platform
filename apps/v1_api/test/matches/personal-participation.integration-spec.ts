import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const host = randomUUID();
const member = randomUUID();
const outsider = randomUUID();

describe('개인 매치 참여 이력 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportId: string;
  let regionId: string;
  const post = (user: string, path: string, body = {}) => request(app.getHttpServer()).post(`/api/v1${path}`).set('x-v1-user-id', user).send(body);
  const get = (user: string, path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('x-v1-user-id', user);
  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    const terms = app.get(ManagedTermsRuntimeService);
    const termsPolicy = await db.v1ManagedTermsPolicy.create({
      data: { code: `personal-match-${host}`, name: '개인 매치 통합 테스트 필수 약관' },
    });
    const termsDocument = await db.v1ManagedTermsDocument.create({
      data: {
        policyId: termsPolicy.id,
        version: '1',
        title: '개인 매치 통합 테스트 필수 약관',
        content: '개인 매치 통합 테스트 전용 약관입니다.',
        contentHash: `personal-match-${host}`,
        status: 'published',
        publishedAt: new Date(),
        effectiveAt: new Date(),
      },
    });
    await db.v1ManagedTermsPlacement.create({
      data: { policyId: termsPolicy.id, context: 'signup', requirement: 'required', displayOrder: 0 },
    });
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    expect(required).toContain(termsDocument.id);
    for (const id of [host, member, outsider]) {
      await db.v1User.create({ data: {
        id, email: `${id}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed',
        phone: `010${id.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`, phoneVerifiedAt: new Date(),
        profile: { create: { nickname: `참가자-${id.slice(0, 6)}`, realName: '테스트 참가자', gender: 'male' } },
      } });
      await terms.acceptSignupTerms(id, required);
    }
    await db.v1AdminUser.create({ data: { userId: host, adminRole: 'owner' } });
    sportId = (await db.v1Sport.create({ data: { code: `personal-${host}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `personal-${host}`, name: '서울', level: 2 } })).id;
  });
  afterAll(async () => cleanup?.());

  async function createMatch() {
    const response = await post(host, '/matches', {
      title: '개인 매치 참여 검증', sportId, regionId, manualPlaceName: '서울 운동장', capacity: 3,
      startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(),
    }).expect(201);
    return response.body.data.matchId as string;
  }
  async function join(matchId: string, user = member) {
    const applied = await post(user, `/matches/${matchId}/applications`).expect(201);
    const applicationId = applied.body.data.applicationId as string;
    await post(host, `/match-applications/${applicationId}/approve`).expect(201);
    return applicationId;
  }
  async function end(matchId: string) {
    // Clock fixture only: actual completion still goes through the guarded HTTP action.
    await db.v1Match.update({ where: { id: matchId }, data: {
      startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000),
    } });
  }

  it('승인 후 취소는 DB 명단·인원·이력에 반영되고 재신청할 수 있다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    expect((await get(member, `/matches/${id}`)).body.data).toMatchObject({ participantCount: 2, canWithdraw: true });
    expect((await get(host, `/matches/${id}/applications?status=approved`)).body.data.items).toHaveLength(1);
    await post(member, `/match-applications/${applicationId}/withdraw`).expect(201);
    expect((await get(member, `/matches/${id}`)).body.data).toMatchObject({ participantCount: 1, canWithdraw: false, viewer: { state: 'withdrawn' } });
    expect(await db.v1MatchParticipant.findUnique({ where: { matchId_userId: { matchId: id, userId: member } } })).toMatchObject({ status: 'cancelled' });
    await post(member, `/matches/${id}/applications`).expect(201);
    await post(host, `/match-applications/${applicationId}/approve`).expect(201);
    expect((await get(member, `/matches/${id}`)).body.data.participantCount).toBe(2);
  });

  it('호스트 완료는 참여·후기 자격을 저장하고 재시도해도 중복 집계하지 않는다', async () => {
    const id = await createMatch();
    await join(id);
    await post(outsider, `/matches/${id}/complete`).expect(403);
    await post(host, `/matches/${id}/complete`).expect(409);
    await end(id);
    const [a, b] = await Promise.all([post(host, `/matches/${id}/complete`), post(host, `/matches/${id}/complete`)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await db.v1MatchParticipant.count({ where: { matchId: id, status: 'completed' } })).toBe(2);
    expect(await db.v1StatusChangeLog.count({ where: { targetId: id, toStatus: 'completed' } })).toBe(1);
    expect((await get(member, `/matches/${id}`)).body.data).toMatchObject({ status: 'completed', participantCount: 2, canWithdraw: false, viewer: { state: 'participant' } });
    await get(member, `/reviews/sources/match/${id}`).expect(200);
    const profile = await get(member, '/me/activity-summary').expect(200);
    expect(profile.body.data.totals.activityCount).toBeGreaterThanOrEqual(1);
  });

  it('시작 후 승인 참가 취소는 거부하고 저장된 참가 자격을 유지한다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    await end(id);
    await post(member, `/match-applications/${applicationId}/withdraw`).expect(409);
    expect(await db.v1MatchApplication.findUnique({ where: { id: applicationId } })).toMatchObject({ status: 'approved' });
  });

  it('관리자 완료도 같은 참가자 완료 상태를 저장한다', async () => {
    const id = await createMatch();
    await join(id);
    await end(id);
    await post(host, `/admin/matches/${id}/status`, { status: 'completed', reason: '참여 확인' }).expect(201);
    expect(await db.v1MatchParticipant.count({ where: { matchId: id, status: 'completed' } })).toBe(2);
    expect((await db.v1Match.findUniqueOrThrow({ where: { id } })).completedAt).not.toBeNull();
  });

  it('승인 취소는 권한·사유를 검증하고 명단·채팅·신청 이력을 함께 변경한다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const participant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    const route = `/match-participants/${participant.id}/cancel-approval`;
    await post(member, route, { reason: '권한 없음' }).expect(403);
    await post(host, route, { reason: '   ' }).expect(400);
    await post(host, route, { reason: 'x'.repeat(501) }).expect(400);
    await post(host, `/match-participants/${participant.id}/mark-cancelled`, { reason: '아직 시작 전' }).expect(409);
    await post(host, route, { reason: '  참가 일정 변경 요청  ' }).expect(201);
    expect(await db.v1MatchParticipant.findUnique({ where: { id: participant.id } })).toMatchObject({ status: 'removed' });
    expect(await db.v1MatchApplication.findUnique({ where: { id: applicationId } })).toMatchObject({ status: 'cancelled_by_host', reviewedByUserId: host });
    expect(await db.v1StatusChangeLog.findFirst({ where: { targetId: participant.id } })).toMatchObject({ actorUserId: host, reason: '참가 일정 변경 요청', toStatus: 'removed' });
    expect((await get(host, `/matches/${id}/applications?status=approved`)).body.data.items).toHaveLength(0);
    expect((await get(host, `/matches/${id}/applications`)).body.data.items[0]).toMatchObject({ participantId: participant.id, participantStatus: 'removed', canCancelApproval: false, canMarkCancelled: false });
    expect((await get(member, `/matches/${id}`)).body.data.participantCount).toBe(1);
    await post(member, '/chat/rooms/resolve', { targetType: 'match', targetId: id }).expect(403);
    await post(host, route, { reason: '중복 처리' }).expect(409);
    await post(member, `/matches/${id}/applications`).expect(201);
    await post(host, `/match-applications/${applicationId}/approve`).expect(201);
    expect(await db.v1MatchParticipant.findUnique({ where: { id: participant.id } })).toMatchObject({ status: 'active', cancelledAt: null });
  });

  it('불참 처리 후 완료해도 불참자는 후기·활동 횟수에서 제외된다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const participant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    await end(id);
    await post(host, `/match-participants/${participant.id}/cancel-approval`, { reason: '늦은 승인 취소' }).expect(409);
    expect((await get(host, `/matches/${id}/applications?status=approved`)).body.data.items[0]).toMatchObject({ canCancelApproval: false, canMarkCancelled: true });
    await post(host, `/match-participants/${participant.id}/mark-cancelled`, { reason: '경기에 참석하지 않음' }).expect(201);
    await post(host, `/matches/${id}/complete`).expect(201);
    expect(await db.v1MatchParticipant.findUnique({ where: { id: participant.id } })).toMatchObject({ status: 'no_show', completedAt: null });
    expect(await db.v1MatchParticipant.count({ where: { matchId: id, status: 'completed' } })).toBe(1);
    await get(member, `/reviews/sources/match/${id}`).expect(403);
    await post(member, '/chat/rooms/resolve', { targetType: 'match', targetId: id }).expect(403);
  });

  it('호스트 자신과 완료 참가자는 처리할 수 없다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const hostParticipant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { matchId_userId: { matchId: id, userId: host } } });
    await post(host, `/match-participants/${hostParticipant.id}/cancel-approval`, { reason: '자기 취소' }).expect(409);
    await end(id);
    await post(host, `/matches/${id}/complete`).expect(201);
    const memberParticipant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    await post(host, `/match-participants/${memberParticipant.id}/mark-cancelled`, { reason: '확정 후 변경' }).expect(409);
    expect(await db.v1MatchParticipant.findUnique({ where: { id: memberParticipant.id } })).toMatchObject({ status: 'completed' });
  });

  it('완료와 불참 처리 경합은 하나의 최종 참가 상태로 직렬화된다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const participant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    await end(id);
    const [complete, absence] = await Promise.all([
      post(host, `/matches/${id}/complete`),
      post(host, `/match-participants/${participant.id}/mark-cancelled`, { reason: '현장 불참 확인' }),
    ]);
    expect(complete.status).toBe(201);
    expect([201, 409]).toContain(absence.status);
    const stored = await db.v1MatchParticipant.findUniqueOrThrow({ where: { id: participant.id } });
    expect(stored.status).toBe(absence.status === 201 ? 'no_show' : 'completed');
    expect((await db.v1MatchApplication.findUniqueOrThrow({ where: { id: applicationId } })).status)
      .toBe(absence.status === 201 ? 'cancelled_by_host' : 'approved');
  });

  it('취소된 참가자는 완료해도 참여 횟수에 포함되지 않는다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    await post(member, `/match-applications/${applicationId}/withdraw`).expect(201);
    await end(id);
    await post(host, `/matches/${id}/complete`).expect(201);
    expect(await db.v1MatchParticipant.findUnique({ where: { matchId_userId: { matchId: id, userId: member } } })).toMatchObject({ status: 'cancelled', completedAt: null });
    await get(member, `/reviews/sources/match/${id}`).expect(403);
  });
});
