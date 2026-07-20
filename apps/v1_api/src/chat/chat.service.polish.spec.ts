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
    v1ChatRoom: { findFirst: jest.Mock; update: jest.Mock };
    v1MatchParticipant: { findFirst: jest.Mock };
    v1ChatMessage: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    v1ChatRoomParticipant: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    v1Notification: { createMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1ChatRoom: { findFirst: jest.fn(), update: jest.fn() },
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
        { provide: RealtimeGateway, useValue: { emitToUser: jest.fn() } },
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
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([]);

    await service.messages(userA, 'room-1', { limit: 30 });

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
        where: { chatRoomId: 'room-1', sentAt: { gte: expect.any(Date) } },
      }),
    );
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
        where: { chatRoomId: 'room-1', sentAt: { gte: visibleFromAt } },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({ messageId: 'message-1', messageType: 'text', unreadCount: 1 }),
      expect.objectContaining({ messageId: 'join-1', messageType: 'system', systemEventType: 'joined', unreadCount: 0 }),
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
