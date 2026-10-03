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

  async function createMatch(overrides: Record<string, unknown> = {}) {
    const response = await post(host, '/matches', {
      title: '개인 매치 참여 검증', sportId, regionId, manualPlaceName: '서울 운동장', capacity: 3,
      startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(),
      ...overrides,
    }).expect(201);
    return response.body.data.matchId as string;
  }
  async function join(matchId: string, user = member) {
    const applied = await post(user, `/matches/${matchId}/applications`).expect(201);
    const applicationId = applied.body.data.applicationId as string;
    await post(host, `/match-applications/${applicationId}/approve`).expect(201);
    return applicationId;
  }
  async function end(matchId: string, confirmProceed = true) {
    // Clock fixture only: actual completion still goes through the guarded HTTP action.
    await db.v1Match.update({ where: { id: matchId }, data: {
      startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000),
    } });
    const guests = await db.v1MatchParticipant.count({ where: { matchId, role: 'participant', status: 'active' } });
    if (confirmProceed && guests > 0 && (await get(host, `/matches/${matchId}`)).body.data.displayState === 'on_hold') {
      await post(host, `/matches/${matchId}/confirm-proceed`).expect(201);
    }
  }

  async function completionBody(matchId: string) {
    const participants = await db.v1MatchParticipant.findMany({
      where: { matchId, role: 'participant', status: 'active' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      participants: participants.map(({ id }) => ({ participantId: id, status: 'completed' as const })),
    };
  }

  it('0/1인 보류 모집은 진행 없이 일정 변경하거나 이력 없이 삭제할 수 있다', async () => {
    const id = await createMatch({ capacity: 1, hostParticipates: false });
    await end(id, false);
    const detail = (await get(host, `/matches/${id}`).expect(200)).body.data;
    expect(detail).toMatchObject({ status: 'on_hold', displayState: 'on_hold', participantCount: 0, lifecycle: { canEdit: true, canDelete: true, canConfirmProceed: false } });
    await post(host, `/matches/${id}/complete`, { participants: [] }).expect(409);
    await post(outsider, `/matches/${id}/confirm-proceed`).expect(403);
    await post(host, `/matches/${id}/confirm-proceed`).expect(409);
    await request(app.getHttpServer()).delete(`/api/v1/matches/${id}`).expect(401);
    await request(app.getHttpServer()).delete(`/api/v1/matches/${id}`).set('x-v1-user-id', outsider).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/matches/${id}`).set('x-v1-user-id', host).expect(200);
    await get(host, `/matches/${id}`).expect(404);
    expect(await db.v1Match.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'archived', deletedAt: expect.any(Date) });
  });

  it('보류 일정 수정은 진행 결정을 초기화하고 확정 참가자에게 재신청을 요구한다', async () => {
    const id = await createMatch();
    await join(id);
    await end(id, false);
    const edit = (await get(host, `/matches/${id}/edit`).expect(200)).body.data;
    expect(edit.editable).toBe(true);
    await request(app.getHttpServer()).patch(`/api/v1/matches/${id}`).set('x-v1-user-id', host).send({
      ...edit.form, version: edit.version, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(),
    }).expect(200);
    expect((await get(host, `/matches/${id}`)).body.data).toMatchObject({ status: 'recruiting', participantCount: 1 });
    expect(await db.v1MatchApplication.findFirst({ where: { matchId: id } })).toMatchObject({ status: 'withdrawn' });
    expect(await db.v1Match.findUniqueOrThrow({ where: { id } })).toMatchObject({ proceedConfirmedAt: null });
    await request(app.getHttpServer()).delete(`/api/v1/matches/${id}`).set('x-v1-user-id', host).expect(409);
  });

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
    const body = await completionBody(id);
    await post(outsider, `/matches/${id}/complete`, body).expect(403);
    await post(host, `/matches/${id}/complete`, body).expect(409);
    await end(id);
    const [a, b] = await Promise.all([
      post(host, `/matches/${id}/complete`, body),
      post(host, `/matches/${id}/complete`, body),
    ]);
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

  it('관리자는 개인 매치를 직접 완료할 수 없고 호스트 완료만 참가 상태를 저장한다', async () => {
    const id = await createMatch();
    await join(id);
    await end(id);
    await post(host, `/admin/matches/${id}/status`, { status: 'completed', reason: '참여 확인' }).expect(409);
    expect(await db.v1MatchParticipant.count({ where: { matchId: id, status: 'completed' } })).toBe(0);
    await post(host, `/matches/${id}/complete`, await completionBody(id)).expect(201);
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
    await post(host, `/matches/${id}/complete`, await completionBody(id)).expect(201);
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
    await post(host, `/matches/${id}/complete`, await completionBody(id)).expect(201);
    const memberParticipant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    await post(host, `/match-participants/${memberParticipant.id}/mark-cancelled`, { reason: '확정 후 변경' }).expect(409);
    expect(await db.v1MatchParticipant.findUnique({ where: { id: memberParticipant.id } })).toMatchObject({ status: 'completed' });
  });

  it('완료와 불참 처리 경합은 하나의 최종 참가 상태로 직렬화된다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const participant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    await end(id);
    const body = await completionBody(id);
    const [complete, absence] = await Promise.all([
      post(host, `/matches/${id}/complete`, body),
      post(host, `/match-participants/${participant.id}/mark-cancelled`, { reason: '현장 불참 확인' }),
    ]);
    expect(complete.status).toBe(201);
    expect([201, 409]).toContain(absence.status);
    const stored = await db.v1MatchParticipant.findUniqueOrThrow({ where: { id: participant.id } });
    expect(stored.status).toBe(absence.status === 201 ? 'no_show' : 'completed');
    expect((await db.v1MatchApplication.findUniqueOrThrow({ where: { id: applicationId } })).status)
      .toBe(absence.status === 201 ? 'cancelled_by_host' : 'approved');
  });

  it('모집 마감·재개·재신청·거절·취소가 실제 상태와 권한을 보존한다', async () => {
    const id = await createMatch();
    const applicationId = (await post(member, `/matches/${id}/applications`).expect(201)).body.data.applicationId;
    await post(outsider, `/matches/${id}/close`).expect(403);
    await post(host, `/matches/${id}/close`).expect(201);
    expect(await db.v1MatchApplication.findUnique({ where: { id: applicationId } })).toMatchObject({ status: 'expired' });
    await post(member, `/matches/${id}/applications`).expect(409);
    await post(outsider, `/matches/${id}/reopen`).expect(403);
    await post(host, `/matches/${id}/reopen`).expect(201);
    await post(host, `/matches/${id}/reopen`).expect(409);
    await post(member, `/matches/${id}/applications`).expect(201);
    await post(host, `/match-applications/${applicationId}/reject`, { reason: '일정 불일치' }).expect(201);
    expect(await db.v1MatchApplication.findUnique({ where: { id: applicationId } })).toMatchObject({ status: 'rejected' });
    await post(member, `/matches/${id}/applications`).expect(201);
    await post(member, `/match-applications/${applicationId}/withdraw`).expect(201);
    await post(host, `/matches/${id}/cancel`).expect(201);
    await post(host, `/matches/${id}/reopen`).expect(409);
    await post(member, `/matches/${id}/applications`).expect(409);
    expect(await db.v1Match.findUnique({ where: { id } })).toMatchObject({ status: 'cancelled' });
  });

  it('동시 모집 재개와 취소는 취소를 되돌리거나 이중 재개 로그를 만들지 않는다', async () => {
    const id = await createMatch();
    await post(host, `/matches/${id}/close`).expect(201);
    const results = await Promise.all([
      post(host, `/matches/${id}/reopen`), post(host, `/matches/${id}/reopen`), post(host, `/matches/${id}/cancel`),
    ]);
    expect(results[2].status).toBe(201);
    expect(results.slice(0, 2).filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    for (const result of results) expect([201, 409]).toContain(result.status);
    expect(await db.v1Match.findUnique({ where: { id } })).toMatchObject({ status: 'cancelled' });
    expect(await db.v1StatusChangeLog.count({ where: { targetId: id, toStatus: 'recruiting', fromStatus: 'closed' } })).toBeLessThanOrEqual(1);
  });

  it('수정은 실제 엔티티를 저장하고 같은 버전의 동시 저장 중 하나만 허용한다', async () => {
    const id = await createMatch();
    const original = await db.v1Match.findUniqueOrThrow({ where: { id } });
    await get(outsider, `/matches/${id}/edit`).expect(403);
    await get(host, `/matches/${id}/edit`).expect(200);
    const body = {
      sportId, regionId, title: '수정된 개인 매치', manualPlaceName: '수정 운동장', capacity: 3,
      startsAt: original.startAt.toISOString(), endsAt: original.endAt?.toISOString(), version: original.updatedAt.toISOString(),
    };
    const patch = (user: string, payload = body) => request(app.getHttpServer()).patch(`/api/v1/matches/${id}`).set('x-v1-user-id', user).send(payload);
    await patch(outsider).expect(403);
    const results = await Promise.all([patch(host), patch(host, { ...body, title: '다른 수정' })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!;
    const stored = await db.v1Match.findUniqueOrThrow({ where: { id } });
    expect(stored.updatedAt.toISOString()).toBe(winner.body.data.version);
    expect(['수정된 개인 매치', '다른 수정']).toContain(stored.title);
    expect(stored.placeName).toBe('수정 운동장');
    await patch(host).expect(409);
  });

  it('정원 축소와 동시 승인은 초과 정원을 만들지 않는다', async () => {
    const id = await createMatch();
    await join(id);
    const pending = (await post(outsider, `/matches/${id}/applications`).expect(201)).body.data.applicationId;
    const original = await db.v1Match.findUniqueOrThrow({ where: { id } });
    const results = await Promise.all([
      request(app.getHttpServer()).patch(`/api/v1/matches/${id}`).set('x-v1-user-id', host).send({
        sportId, regionId, title: original.title, manualPlaceName: original.placeName, capacity: 2,
        startsAt: original.startAt.toISOString(), endsAt: original.endAt?.toISOString(), version: original.updatedAt.toISOString(),
      }),
      post(host, `/match-applications/${pending}/approve`),
    ]);
    expect(results.filter((r) => r.status >= 200 && r.status < 300)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    const stored = await db.v1Match.findUniqueOrThrow({ where: { id } });
    const count = await db.v1MatchParticipant.count({ where: { matchId: id, status: 'active' } });
    expect(count).toBeLessThanOrEqual(stored.maxParticipants);
  });

  it('진행을 확정해 시작된 closed 매치는 편집 가능으로 표시하거나 미래 일정으로 되살리지 않는다', async () => {
    const id = await createMatch();
    await join(id);
    await post(host, `/matches/${id}/close`).expect(201);
    await end(id);
    const edit = (await get(host, `/matches/${id}/edit`).expect(200)).body.data;
    expect(edit.editable).toBe(false);
    await request(app.getHttpServer()).patch(`/api/v1/matches/${id}`).set('x-v1-user-id', host).send({
      ...edit.form, version: edit.version,
      startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(),
    }).expect(409);
  });

  it('정원이 차면 남은 신청 승인은 409 FULL 한국어 안내이고, 기존 승인을 취소하면 승인할 수 있다', async () => {
    const id = await createMatch({ capacity: 2 });
    // 정원이 차기 전에 들어온 신청 — 다른 신청을 승인해 2/2 가 된 뒤에도 승인 대기로 남는다.
    const pending = (await post(outsider, `/matches/${id}/applications`).expect(201)).body.data.applicationId;
    const memberApplicationId = await join(id);
    const full = await post(host, `/match-applications/${pending}/approve`).expect(409);
    expect(full.body).toMatchObject({ code: 'FULL', message: '정원이 모두 찼어요. 기존 참가자의 승인을 취소하면 승인할 수 있어요.' });
    const memberParticipant = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId: memberApplicationId } });
    await post(host, `/match-participants/${memberParticipant.id}/cancel-approval`, { reason: '자리 양보' }).expect(201);
    await post(host, `/match-applications/${pending}/approve`).expect(201);
  });

  it('승인하면 매치 채팅방에 승인 시각부터 등록돼, 방을 늦게 열어도 그 사이 메시지가 보인다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const { approvedAt } = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    const room = await db.v1ChatRoom.findUniqueOrThrow({ where: { matchId: id }, include: { participants: true } });
    expect(room.participants.find((p) => p.userId === member)).toMatchObject({ status: 'active', visibleFromAt: approvedAt });
    expect(room.participants.find((p) => p.userId === host)).toMatchObject({ status: 'active', visibleFromAt: room.createdAt });

    // 참가자가 아직 방을 열기 전에 주최자가 보낸 메시지 — 채팅 목록에 미읽음으로 뜨고, 열면 보인다.
    await post(host, `/chat/rooms/${room.id}/messages`, { content: '토요일에 봬요' }).expect(201);
    const listed = (await get(member, '/chat/rooms?roomType=match').expect(200)).body.data.items;
    expect(listed.find((r: { roomId: string }) => r.roomId === room.id)).toMatchObject({ unreadCount: 1 });
    const items = (await get(member, `/chat/rooms/${room.id}/messages`).expect(200)).body.data.items;
    expect(items.map((m: { content: string }) => m.content)).toEqual(expect.arrayContaining(['토요일에 봬요', expect.stringContaining('들어왔어요')]));

    // '들어왔어요'는 방을 연 때가 아니라 승인 순간 한 번 — 주최자에게도 보인다(방 생성 시각 = 승인 시각).
    expect(room.createdAt).toEqual(approvedAt);
    const joinedLines = await db.v1ChatMessage.findMany({ where: { chatRoomId: room.id, systemEventType: 'joined' } });
    expect(joinedLines.map((line) => [line.senderUserId, line.sentAt])).toEqual([[member, approvedAt]]);
    const hostItems = (await get(host, `/chat/rooms/${room.id}/messages`).expect(200)).body.data.items;
    expect(hostItems.some((m: { systemEventType: string | null }) => m.systemEventType === 'joined')).toBe(true);
  });

  it('참가를 취소했다가 다시 승인되면 이번 승인 시각부터 보인다 — 취소돼 있던 동안의 대화는 안 보인다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    await join(id, outsider); // 취소 기간에도 방에 확정 참가자가 남아 대화가 오간다
    const room = await db.v1ChatRoom.findUniqueOrThrow({ where: { matchId: id } });
    await post(member, `/chat/rooms/${room.id}/messages`, { content: '참가할게요' }).expect(201);
    await post(member, `/match-applications/${applicationId}/withdraw`).expect(201);
    await post(host, `/chat/rooms/${room.id}/messages`, { content: '취소 기간 대화' }).expect(201);

    await post(member, `/matches/${id}/applications`).expect(201);
    await post(host, `/match-applications/${applicationId}/approve`).expect(201);
    const { approvedAt } = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    expect(await db.v1ChatRoomParticipant.findUnique({ where: { chatRoomId_userId: { chatRoomId: room.id, userId: member } } })).toMatchObject({ status: 'active', visibleFromAt: approvedAt });
    await post(host, `/chat/rooms/${room.id}/messages`, { content: '다시 환영해요' }).expect(201);
    const contents = (await get(member, `/chat/rooms/${room.id}/messages`).expect(200)).body.data.items.map((m: { content: string }) => m.content);
    expect(contents).toContain('다시 환영해요');
    expect(contents).not.toContain('취소 기간 대화');
  });

  it('이 규칙 이전에 승인된 참가자도(방 미등록·입장 시각으로 늦게 잡힘) 승인 이후 메시지를 본다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    const { approvedAt } = await db.v1MatchParticipant.findUniqueOrThrow({ where: { applicationId } });
    const room = await db.v1ChatRoom.findUniqueOrThrow({ where: { matchId: id } });
    await post(host, `/chat/rooms/${room.id}/messages`, { content: '승인 뒤 첫 안내' }).expect(201);
    // 옛 경로 재현: 승인 때 채팅 참여자로 등록되지도, '들어왔어요'가 남지도 않았던 참가자가 나중에 매치 상세에서 방을 연다.
    await db.v1ChatRoomParticipant.delete({ where: { chatRoomId_userId: { chatRoomId: room.id, userId: member } } });
    await db.v1ChatMessage.deleteMany({ where: { chatRoomId: room.id, senderUserId: member, systemEventType: 'joined' } });
    const { lastMessageAt } = await db.v1ChatRoom.findUniqueOrThrow({ where: { id: room.id } });
    await post(member, '/chat/rooms/resolve', { targetType: 'match', targetId: id }).expect(201);
    const items = (await get(member, `/chat/rooms/${room.id}/messages`).expect(200)).body.data.items;
    expect(items.map((m: { content: string }) => m.content)).toContain('승인 뒤 첫 안내');
    expect(await db.v1ChatRoomParticipant.findUnique({ where: { chatRoomId_userId: { chatRoomId: room.id, userId: member } } })).toMatchObject({ visibleFromAt: approvedAt });
    // '들어왔어요'도 방을 연 지금이 아니라 승인 시각에 한 번 — 방 목록 정렬(lastMessageAt)은 뒤로 가지 않는다.
    const joinedLines = await db.v1ChatMessage.findMany({ where: { chatRoomId: room.id, senderUserId: member, systemEventType: 'joined' } });
    expect(joinedLines.map((line) => line.sentAt)).toEqual([approvedAt]);
    expect((await db.v1ChatRoom.findUniqueOrThrow({ where: { id: room.id } })).lastMessageAt).toEqual(lastMessageAt);

    // 주최자도 입장 시각으로 늦게 잡혀 있었다면 방 생성 시각으로 당긴다 — 참가자가 먼저 보낸 메시지가 보인다.
    await post(member, `/chat/rooms/${room.id}/messages`, { content: '저도 갈게요' }).expect(201);
    await db.v1ChatRoomParticipant.update({ where: { chatRoomId_userId: { chatRoomId: room.id, userId: host } }, data: { visibleFromAt: new Date() } });
    const hostItems = (await get(host, `/chat/rooms/${room.id}/messages`).expect(200)).body.data.items;
    expect(hostItems.map((m: { content: string }) => m.content)).toEqual(expect.arrayContaining(['승인 뒤 첫 안내', '저도 갈게요']));
  });

  it('목록 기본 정렬은 경기일 순 — 시작 전 경기를 가까운 날부터, 지난 경기는 그 뒤에 이어 페이지를 넘긴다', async () => {
    // 이 테스트만의 종목으로 걸러 다른 테스트가 만든 매치와 섞이지 않게 한다. 등록 순서는 경기일과 엇갈리게 둔다.
    const ownSportId = (await db.v1Sport.create({ data: { code: `order-${randomUUID()}`, name: '풋살' } })).id;
    const at = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
    const far = await createMatch({ sportId: ownSportId, title: '다음 주 경기', startsAt: at(24 * 7), endsAt: at(24 * 7 + 2) });
    const ended = await createMatch({ sportId: ownSportId, title: '어제 경기' });
    await db.v1Match.update({ where: { id: ended }, data: { startAt: new Date(at(-26)), endAt: new Date(at(-24)) } });
    const near = await createMatch({ sportId: ownSportId, title: '내일 경기', startsAt: at(24), endsAt: at(26) });

    const page1 = (await get(outsider, `/matches?sportId=${ownSportId}&limit=2`).expect(200)).body.data;
    expect(page1.items.map((m: { matchId: string }) => m.matchId)).toEqual([near, far]);
    expect(page1.pageInfo).toEqual({ nextCursor: expect.stringMatching(new RegExp(`^upcoming:${far}@\\d+$`)), hasNext: true });

    const page2 = (await get(outsider, `/matches?sportId=${ownSportId}&limit=2&cursor=${page1.pageInfo.nextCursor}`).expect(200)).body.data;
    expect(page2.items.map((m: { matchId: string }) => m.matchId)).toEqual([ended]);
    expect(page2.pageInfo).toEqual({ nextCursor: null, hasNext: false });

    const latest = (await get(outsider, `/matches?sportId=${ownSportId}&sort=latest`).expect(200)).body.data;
    expect(latest.items.map((m: { matchId: string }) => m.matchId)).toEqual([near, ended, far]);
  });

  it('목록을 넘기는 사이 1페이지의 마지막 경기가 시작해도 다음 경기를 건너뛰지 않는다', async () => {
    const ownSportId = (await db.v1Sport.create({ data: { code: `cursor-${randomUUID()}`, name: '풋살' } })).id;
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    const hour = 3600000;
    // 가장 가까운 A 를 마지막에 만든다 -- 1페이지를 읽을 때까지 A 가 시작하지 않아야 한다.
    const b = await createMatch({ sportId: ownSportId, title: '두 번째 경기', startsAt: at(2 * hour), endsAt: at(3 * hour) });
    const c = await createMatch({ sportId: ownSportId, title: '세 번째 경기', startsAt: at(3 * hour), endsAt: at(4 * hour) });
    const aStartsAt = Date.now() + 4000;
    const a = await createMatch({ sportId: ownSportId, title: '첫 번째 경기', startsAt: new Date(aStartsAt).toISOString(), endsAt: at(hour) });

    const page1 = (await get(outsider, `/matches?sportId=${ownSportId}&limit=1`).expect(200)).body.data;
    expect(Date.now()).toBeLessThan(aStartsAt);
    expect(page1.items.map((m: { matchId: string }) => m.matchId)).toEqual([a]);

    // A 가 시작한 뒤에 나머지 페이지를 읽는다. A 는 종료 전이라 계속 공개 목록에 남는다.
    await new Promise((resolve) => setTimeout(resolve, aStartsAt - Date.now() + 200));

    const seen = [a];
    let cursor: string | null = page1.pageInfo.nextCursor;
    while (cursor) {
      const page = (await get(outsider, `/matches?sportId=${ownSportId}&limit=1&cursor=${encodeURIComponent(cursor)}`).expect(200)).body.data;
      seen.push(...page.items.map((m: { matchId: string }) => m.matchId));
      cursor = page.pageInfo.nextCursor;
    }
    expect(seen).toEqual([a, b, c]);
  }, 30000);

  it('참가자가 모두 철회된 보류 매치는 완료하지 않고 참여 이력을 늘리지 않는다', async () => {
    const id = await createMatch();
    const applicationId = await join(id);
    await post(member, `/match-applications/${applicationId}/withdraw`).expect(201);
    await end(id);
    await post(host, `/matches/${id}/complete`, await completionBody(id)).expect(409);
    expect(await db.v1MatchParticipant.findUnique({ where: { matchId_userId: { matchId: id, userId: member } } })).toMatchObject({ status: 'cancelled', completedAt: null });
    const review = await get(member, `/reviews/sources/match/${id}`).expect(409);
    expect(review.body.code).toBe('SOURCE_NOT_COMPLETED');
  });
});
