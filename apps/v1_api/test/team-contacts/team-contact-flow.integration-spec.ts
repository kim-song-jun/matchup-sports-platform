import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// 이 파일이 jest.config.ts 의 integration testMatch 에 등록되지 않으면
// 디스크에 있어도 CI 가 절대 실행하지 않는다. 같은 실수가 이 레포에서 4회 반복됐다
// (team-schedules/team-match-series/team-lineups/team-matches — jest.config.ts 주석 참고).
//
// 실 DB(격리된 클론) 로 "팀 컨택의 채팅 흡수" 흐름을 한 번에 왕복한다:
// 발신(=방·참가자·첫 메시지 생성) → 상대 목록 노출 → 수락 전 전송 차단 → 중복 거부 →
// 수락(시스템 메시지·알림 딥링크) → 전송 허용 → 비참여자 거부.
// 유닛 스펙(mock Prisma) 은 트랜잭션 안에서 네 테이블이 함께 쓰이는지와
// 채팅 자격 where 가 실제 Postgres 에서 먹는지를 증명하지 못한다.

const ids = {
  ownerA: '68880000-0000-4000-8000-000000000001',
  ownerB: '68880000-0000-4000-8000-000000000002',
  outsider: '68880000-0000-4000-8000-000000000003',
  region: '68880000-0000-4000-8000-000000000011',
  teamA: '68880000-0000-4000-8000-000000000020',
  teamB: '68880000-0000-4000-8000-000000000021',
} as const;

describe('팀 컨택 전체 흐름', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.createMany({
      data: [ids.ownerA, ids.ownerB, ids.outsider].map((id) => ({
        id,
        email: `${id}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        // V1AuthGuard 의 휴대폰 인증 전역 게이트(쓰기 요청 차단)를 피한다 — 이 스펙은
        // POST/PATCH 로 실 HTTP 파이프라인을 태우므로 서비스 유닛 스펙과 달리 필요하다.
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });

    // V1AuthGuard 의 약관 재동의 게이트(TERMS_RECONSENT_REQUIRED) — DB 시드 유저는
    // v1ManagedTermsConsentEvent 가 0건이라 기본값으로는 모든 write 가 막힌다.
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentSignupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentSignupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      [ids.ownerA, ids.ownerB, ids.outsider].map((id) =>
        termsService.acceptSignupTerms(id, requiredDocumentIds),
      ),
    );

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task8-team-contact-football' },
      update: {},
      create: { code: 'task8-team-contact-football', name: 'Task 8 team contact football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK8_TEAM_CONTACT_REGION', name: 'Task 8 team contact region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.teamA, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 8 team A' },
        { id: ids.teamB, ownerUserId: ids.ownerB, sportId: sport.id, regionId: ids.region, name: 'Task 8 team B' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamB, userId: ids.ownerB, role: 'owner', status: 'active' },
      ],
    });
  });

  afterAll(async () => cleanupApp?.());

  let contactId: string;
  let roomId: string;

  it('1) A owner 가 B 로 컨택을 발신하면 requested 컨택과 함께 채팅방·양 팀 운영진 참가자·첫 메시지가 생긴다', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '주말 경기 가능하실까요?' })
      .expect(201);

    expect(res.body.data).toMatchObject({ fromTeamId: ids.teamA, toTeamId: ids.teamB, status: 'requested' });
    contactId = res.body.data.id;
    roomId = res.body.data.chatRoomId;
    expect(typeof roomId).toBe('string');
    expect(res.body.data.route).toBe(`/chat/${roomId}`);

    const room = await prisma.v1ChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.teamContactId).toBe(contactId);
    const participants = await prisma.v1ChatRoomParticipant.findMany({ where: { chatRoomId: roomId } });
    expect(participants.map((p) => p.userId).sort()).toEqual([ids.ownerA, ids.ownerB].sort());
    expect(participants.every((p) => p.visibleFromAt !== null)).toBe(true);
    const messages = await prisma.v1ChatMessage.findMany({ where: { chatRoomId: roomId } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ senderUserId: ids.ownerA, body: '주말 경기 가능하실까요?', messageType: 'text' });
  });

  it('2) B owner 의 채팅 목록에 요청 중인 컨택 방이 미읽음 1 로 보인다', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/chat/rooms')
      .set('x-v1-user-id', ids.ownerB)
      .expect(200);

    const room = res.body.data.items.find((item: { roomId: string }) => item.roomId === roomId);
    expect(room).toBeDefined();
    expect(room.roomType).toBe('team_contact');
    expect(room.unreadCount).toBe(1);
    expect(room.teamContact).toMatchObject({ contactId, status: 'requested', mySide: 'to' });
    expect(room.linkedTarget).toMatchObject({ type: 'team_contact', route: `/teams/${ids.teamA}` });
  });

  it('3) 수락 전에는 B owner 가 답장할 수 없다 — 409 TEAM_CONTACT_NOT_ACCEPTED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/chat/rooms/${roomId}/messages`)
      .set('x-v1-user-id', ids.ownerB)
      .send({ content: '네 가능해요' })
      .expect(409);

    expect(res.body.code).toBe('TEAM_CONTACT_NOT_ACCEPTED');
    const count = await prisma.v1ChatMessage.count({ where: { chatRoomId: roomId } });
    expect(count).toBe(1);
  });

  it('4) 같은 팀쌍에 다시 발신하면 409 TEAM_CONTACT_ALREADY_ACTIVE 이고 기존 방 id 를 알려준다', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '한 번 더 보내볼게요' })
      .expect(409);

    expect(res.body.code).toBe('TEAM_CONTACT_ALREADY_ACTIVE');
    expect(res.body.details).toMatchObject({ existingContactId: contactId, existingChatRoomId: roomId });
    const count = await prisma.v1TeamContact.count({ where: { fromTeamId: ids.teamA, toTeamId: ids.teamB } });
    expect(count).toBe(1);
  });

  it('5) B owner 가 수락하면 시스템 메시지가 남고 A 운영진 알림이 채팅방으로 간다', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/team-contacts/${contactId}/accept`)
      .set('x-v1-user-id', ids.ownerB)
      .expect(200);

    expect(res.body.data).toMatchObject({ alreadyProcessed: false, chatRoomId: roomId });
    expect(res.body.data.contact.status).toBe('accepted');

    const messages = await prisma.v1ChatMessage.findMany({ where: { chatRoomId: roomId }, orderBy: { sentAt: 'asc' } });
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ messageType: 'system', body: '컨택을 수락했어요', senderUserId: ids.ownerB });

    // 알림은 emitToManyDeferred 로 트랜잭션 밖에서 비동기 발송된다 — 잠시 기다린다.
    let notification = null;
    for (let attempt = 0; attempt < 20 && !notification; attempt += 1) {
      notification = await prisma.v1Notification.findFirst({
        where: { recipientUserId: ids.ownerA, targetType: 'chat', targetId: roomId },
      });
      if (!notification) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(notification).not.toBeNull();
    expect(notification?.deepLink).toBe(`/chat/${roomId}`);
  });

  it('6) 수락 뒤에는 A owner 가 전송할 수 있다', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/chat/rooms/${roomId}/messages`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ content: '토요일 오후 어떠세요?' })
      .expect(201);

    expect(res.body.data).toMatchObject({ roomId, content: '토요일 오후 어떠세요?' });
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/chat/rooms/${roomId}`)
      .set('x-v1-user-id', ids.ownerA)
      .expect(200);
    expect(detail.body.data.teamContact).toMatchObject({ contactId, status: 'accepted', mySide: 'from' });
  });

  it('7) 두 팀 어디에도 속하지 않은 사용자는 방을 볼 수 없다 — 403', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/chat/rooms/${roomId}`)
      .set('x-v1-user-id', ids.outsider)
      .expect(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');

    const resolveRes = await request(app.getHttpServer())
      .post('/api/v1/chat/rooms/resolve')
      .set('x-v1-user-id', ids.outsider)
      .send({ targetType: 'team_contact', targetId: contactId })
      .expect(403);
    expect(resolveRes.body.code).toBe('PERMISSION_DENIED');
    const rooms = await prisma.v1ChatRoom.findMany({ where: { teamContactId: contactId } });
    expect(rooms).toHaveLength(1);
  });
});
