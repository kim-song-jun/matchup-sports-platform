import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService } from './chat.service';

const userA = { id: 'user-a', email: 'a@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const userB = { id: 'user-b', email: 'b@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function makeRoom(visibleFromAt: Date | null = new Date('1970-01-01T00:00:00.000Z')) {
  return {
    id: 'room-1',
    matchId: 'match-1',
    teamId: null,
    teamMatchId: null,
    status: 'active',
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    match: { id: 'match-1', title: 'Test match' },
    team: null,
    teamMatch: null,
    participants: [
      {
        id: 'participant-a',
        chatRoomId: 'room-1',
        userId: userA.id,
        status: 'active',
        pinnedAt: null,
        mutedUntil: null,
        leftAt: null,
        lastReadMessageId: null,
        visibleFromAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: userA.id, profile: { nickname: 'Alice', displayName: null, profileImageUrl: null } },
      },
    ],
    messages: [],
  };
}

describe('ChatService room polish', () => {
  let service: ChatService;
  let prisma: {
    v1ChatRoom: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    v1Match: { findFirst: jest.Mock; findUnique: jest.Mock };
    v1MatchParticipant: { findFirst: jest.Mock };
    v1ChatMessage: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    v1ChatRoomParticipant: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    v1Notification: { createMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  let realtime: { emitToUser: jest.Mock };

  beforeEach(async () => {
    realtime = { emitToUser: jest.fn() };
    prisma = {
      v1ChatRoom: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      v1Match: {
        // 열람 시작(matchChatHistoryFrom) — 승인 시각이 없는 참가자: 예전처럼 입장 시각부터 보인다.
        findUnique: jest.fn().mockResolvedValue({ hostUserId: 'host-user', participants: [] }),
        findFirst: jest.fn().mockResolvedValue({
          hostUserId: 'host-user',
          participants: [{ userId: userA.id, role: 'participant' }],
        }),
      },
      v1MatchParticipant: { findFirst: jest.fn().mockResolvedValue({ id: 'match-participant-a' }) },
      v1ChatMessage: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
      v1ChatRoomParticipant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      v1Notification: { createMany: jest.fn() },
      v1StatusChangeLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const p = prisma;
    prisma.$transaction.mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtime },
        { provide: WebPushService, useValue: { sendToUser: jest.fn().mockResolvedValue(undefined) } },
        { provide: getLoggerToken(ChatService.name), useValue: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  it('creates a joined system notice when a participant first enters the room', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom(null));
    prisma.v1ChatMessage.create.mockResolvedValue({
      id: 'join-1',
      chatRoomId: 'room-1',
      senderUserId: userA.id,
      body: 'Alice joined',
      status: 'sent',
      messageType: 'system',
      systemEventType: 'joined',
      sentAt: new Date('2026-06-21T10:01:00Z'),
    });
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue({ visibleFromAt: new Date('2026-06-21T10:01:00Z') });
    prisma.v1ChatMessage.findMany.mockResolvedValue([]);
    prisma.v1ChatRoom.findUnique.mockResolvedValue({
      id: 'room-1', matchId: 'match-1', teamId: null, teamMatchId: null, teamMatch: null, teamContactId: null, teamContact: null,
    });
    // 입장 줄 전달 대상 조회(보낸 사람 제외)에는 B 가 남아 있고, 목록용 참여자 조회는 비어 있다.
    prisma.v1ChatRoomParticipant.findMany.mockImplementation(async ({ where }: { where: { userId?: { not: string } } }) =>
      where.userId?.not === userA.id ? [{ userId: userB.id }] : [],
    );

    await service.messages(userA, 'room-1', { limit: 30 });
    await new Promise(setImmediate);

    expect(prisma.v1ChatRoomParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'participant-a', visibleFromAt: null },
        data: { visibleFromAt: expect.any(Date) },
      }),
    );
    expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chatRoomId: 'room-1',
          senderUserId: userA.id,
          messageType: 'system',
          systemEventType: 'joined',
          sentAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.v1ChatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ chatRoomId: 'room-1', sentAt: { gte: expect.any(Date) } }),
      }),
    );
    // 저장한 입장 줄이 방의 다른 참여자에게 chat:message 로 뜬다 — 들어온 본인은 받지 않는다.
    expect(realtime.emitToUser.mock.calls).toEqual([
      [userB.id, 'chat:message', expect.objectContaining({ messageId: 'join-1', roomId: 'room-1', messageType: 'system', systemEventType: 'joined' })],
    ]);
  });

  it('returns visible messages with Kakao-style unread counts', async () => {
    const visibleFromAt = new Date('2026-06-21T09:00:00Z');
    const messageSentAt = new Date('2026-06-21T10:00:00Z');
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom(visibleFromAt));
    prisma.v1ChatMessage.findMany.mockResolvedValue([
      {
        id: 'message-1',
        chatRoomId: 'room-1',
        senderUserId: userA.id,
        body: 'ping',
        status: 'sent',
        messageType: 'text',
        systemEventType: null,
        sentAt: messageSentAt,
        senderUser: { id: userA.id, profile: { nickname: 'Alice', displayName: null, profileImageUrl: null } },
      },
      {
        id: 'join-1',
        chatRoomId: 'room-1',
        senderUserId: userB.id,
        body: 'Bob joined',
        status: 'sent',
        messageType: 'system',
        systemEventType: 'joined',
        sentAt: new Date('2026-06-21T09:30:00Z'),
        senderUser: { id: userB.id, profile: { nickname: 'Bob', displayName: null, profileImageUrl: null } },
      },
    ]);
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([
      { userId: userA.id, visibleFromAt, lastReadMessage: { sentAt: messageSentAt } },
      { userId: userB.id, visibleFromAt, lastReadMessage: null },
    ]);

    const result = await service.messages(userA, 'room-1', { limit: 30 });

    expect(prisma.v1ChatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ chatRoomId: 'room-1', sentAt: { gte: visibleFromAt } }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({ messageId: 'message-1', messageType: 'text', unreadCount: 1 }),
      expect.objectContaining({ messageId: 'join-1', messageType: 'system', systemEventType: 'joined', unreadCount: 0 }),
    ]);
  });

  it('사진 메시지는 imageUrl 을 싣고 읽지 않은 수에 들어간다 — 숨김 메시지는 사진도 내리지 않는다', async () => {
    const visibleFromAt = new Date('2026-06-21T09:00:00Z');
    const sentAt = new Date('2026-06-21T10:00:00Z');
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom(visibleFromAt));
    const imageMessage = (id: string, status: string) => ({
      id,
      chatRoomId: 'room-1',
      senderUserId: userA.id,
      body: '사진',
      status,
      messageType: 'image',
      systemEventType: null,
      sentAt,
      attachmentAsset: { url: `/uploads/2026/10/${id}.jpg` },
      senderUser: { id: userA.id, profile: { nickname: 'Alice', displayName: null, profileImageUrl: null } },
    });
    prisma.v1ChatMessage.findMany.mockResolvedValue([imageMessage('photo-1', 'sent'), imageMessage('photo-2', 'hidden')]);
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([
      { userId: userA.id, visibleFromAt, lastReadMessage: { sentAt } },
      { userId: userB.id, visibleFromAt, lastReadMessage: null },
    ]);

    const result = await service.messages(userA, 'room-1', { limit: 30 });

    expect(prisma.v1ChatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ attachmentAsset: { select: expect.objectContaining({ url: true }) } }) }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({ messageId: 'photo-1', messageType: 'image', content: '사진', imageUrl: '/uploads/2026/10/photo-1.jpg', unreadCount: 1 }),
      expect.objectContaining({ messageId: 'photo-2', content: null, imageUrl: null }),
    ]);
  });

  it('공유 메시지는 shareCard 를 싣는다 — 숨김 메시지는 카드도 내리지 않는다', async () => {
    const visibleFromAt = new Date('2026-06-21T09:00:00Z');
    const sentAt = new Date('2026-06-21T10:00:00Z');
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom(visibleFromAt));
    const card = { kind: 'match', targetId: 'm-1', title: '토요일 풋살', startAt: '2026-06-27T10:00:00.000Z', place: '잠실', sub: null, route: '/matches/m-1' };
    const shareMessage = (id: string, status: string) => ({
      id, chatRoomId: 'room-1', senderUserId: userA.id, body: '[매치] 토요일 풋살', status, messageType: 'share',
      systemEventType: null, sentAt, attachmentAsset: null, shareCard: card,
      senderUser: { id: userA.id, profile: { nickname: 'Alice', displayName: null, profileImageUrl: null } },
    });
    prisma.v1ChatMessage.findMany.mockResolvedValue([shareMessage('share-1', 'sent'), shareMessage('share-2', 'hidden')]);
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([
      { userId: userA.id, visibleFromAt, lastReadMessage: { sentAt } },
      { userId: userB.id, visibleFromAt, lastReadMessage: null },
    ]);

    const result = await service.messages(userA, 'room-1', { limit: 30 });

    expect(result.items).toEqual([
      expect.objectContaining({ messageId: 'share-1', messageType: 'share', shareCard: card, unreadCount: 1 }),
      expect.objectContaining({ messageId: 'share-2', content: null, shareCard: null }),
    ]);
  });

  it('rejects read markers before the participant visible window', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom(new Date('2026-06-21T09:00:00Z')));
    prisma.v1ChatMessage.findUnique.mockResolvedValue({
      id: 'old-message',
      chatRoomId: 'room-1',
      sentAt: new Date('2026-06-21T08:59:00Z'),
    });

    await expect(service.updateMe(userA, 'room-1', { lastReadMessageId: 'old-message' })).rejects.toThrow(BadRequestException);
    expect(prisma.v1ChatRoomParticipant.update).not.toHaveBeenCalled();
  });
});
