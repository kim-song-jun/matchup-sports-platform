// Prevent the lodash/_getRawTag resolution failure that occurs in the full dep chain
// (RealtimeGateway → NotificationsService → WebPushService → @nestjs/config → lodash)
jest.mock('../realtime/realtime.gateway');

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UserBlocksService } from '../user-blocks/user-blocks.service';

const mockPrisma = {
  chatRoom: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  chatMessage: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  chatRoomParticipant: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  teamMatch: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockRealtimeGateway = {
  emitToRoom: jest.fn(),
};

const mockUserBlocksService = {
  isBlocked: jest.fn().mockResolvedValue(false),
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtimeGateway },
        { provide: UserBlocksService, useValue: mockUserBlocksService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    jest.clearAllMocks();
    mockRealtimeGateway.emitToRoom.mockReset();
  });

  describe('listRooms', () => {
    it('returns paginated rooms for the user', async () => {
      const rooms = [{ id: 'r1' }, { id: 'r2' }];
      mockPrisma.chatRoom.findMany.mockResolvedValue(rooms);

      const result = await service.listRooms('user1');

      expect(mockPrisma.chatRoom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { participants: { some: { userId: 'user1' } } },
        }),
      );
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('sets hasMore and nextCursor when more results exist', async () => {
      // take + 1 items returned means hasMore
      const rooms = Array.from({ length: 21 }, (_, i) => ({ id: `r${i}` }));
      mockPrisma.chatRoom.findMany.mockResolvedValue(rooms);

      const result = await service.listRooms('user1', undefined, 20);

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('r19');
      expect(result.data).toHaveLength(20);
    });
  });

  describe('getRoom', () => {
    it('throws CHAT_FORBIDDEN when user is not a participant', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.getRoom('r1', 'stranger')).rejects.toThrow(ForbiddenException);
    });

    it('returns room with messages when user is participant', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      const room = { id: 'r1', messages: [] };
      mockPrisma.chatRoom.findUnique.mockResolvedValue(room);

      const result = await service.getRoom('r1', 'u1');

      expect(result).toEqual(room);
    });
  });

  describe('listMessages', () => {
    it('throws CHAT_FORBIDDEN when user is not a participant', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.listMessages('r1', 'stranger')).rejects.toThrow(ForbiddenException);
    });

    it('returns cursor-paginated messages', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      const messages = [
        { id: 'm1', content: 'hi', imageUrl: null, deletedAt: null },
        { id: 'm2', content: 'hello', imageUrl: null, deletedAt: null },
      ];
      mockPrisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.listMessages('r1', 'u1');

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('replaces content with "삭제된 메시지입니다" and nulls imageUrl for deleted messages', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      const messages = [
        {
          id: 'm1', content: 'secret text', imageUrl: 'https://cdn.example.com/img.jpg',
          deletedAt: new Date(), senderId: 'u2',
        },
        { id: 'm2', content: 'visible', imageUrl: null, deletedAt: null, senderId: 'u1' },
      ];
      mockPrisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.listMessages('r1', 'u1');

      expect(result.data[0].content).toBe('삭제된 메시지입니다');
      expect(result.data[0].imageUrl).toBeNull();
      expect(result.data[1].content).toBe('visible');
    });
  });

  describe('postMessage', () => {
    it('throws CHAT_FORBIDDEN when user is not a participant', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.postMessage('r1', 'stranger', { content: 'hi' })).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when both content and imageUrl are absent', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });

      await expect(service.postMessage('r1', 'u1', { content: '' })).rejects.toThrow('내용 또는 이미지가 필요합니다.');
    });

    it('persists message, updates lastMessageAt via transaction, and broadcasts via realtime', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      const savedMessage = {
        id: 'm1', content: 'hi', senderId: 'u1', createdAt: new Date(),
        type: 'text', imageUrl: null, sender: { id: 'u1', nickname: 'User1' },
      };
      mockPrisma.$transaction.mockResolvedValue([savedMessage, {}]);

      const result = await service.postMessage('r1', 'u1', { content: 'hi' });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockRealtimeGateway.emitToRoom).toHaveBeenCalledWith(
        'r1',
        'chat:message',
        expect.objectContaining({ id: 'm1', roomId: 'r1', imageUrl: null }),
      );
      expect(result).toEqual(savedMessage);
    });

    it('persists image-only message with empty content and broadcasts imageUrl', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      const imageUrl = 'https://cdn.example.com/photo.jpg';
      const savedMessage = {
        id: 'm2', content: '', senderId: 'u1', createdAt: new Date(),
        type: 'text', imageUrl, sender: { id: 'u1', nickname: 'User1' },
      };
      mockPrisma.$transaction.mockResolvedValue([savedMessage, {}]);

      const result = await service.postMessage('r1', 'u1', { content: '', imageUrl });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockRealtimeGateway.emitToRoom).toHaveBeenCalledWith(
        'r1',
        'chat:message',
        expect.objectContaining({ imageUrl }),
      );
      expect(result.imageUrl).toBe(imageUrl);
    });
  });

  describe('deleteMessage', () => {
    it('throws NotFoundException when message does not exist', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue(null);

      await expect(service.deleteMessage('m-missing', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('throws CHAT_FORBIDDEN when user is not the sender', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue({
        id: 'm1', senderId: 'owner', roomId: 'r1', deletedAt: null,
      });

      await expect(service.deleteMessage('m1', 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('soft-deletes message and broadcasts chat:message-deleted', async () => {
      const deletedAt = new Date();
      mockPrisma.chatMessage.findUnique.mockResolvedValue({
        id: 'm1', senderId: 'u1', roomId: 'r1', deletedAt: null,
      });
      mockPrisma.chatMessage.update.mockResolvedValue({ id: 'm1', deletedAt });

      const result = await service.deleteMessage('m1', 'u1');

      expect(mockPrisma.chatMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1' }, data: { deletedAt: expect.any(Date) } }),
      );
      expect(mockRealtimeGateway.emitToRoom).toHaveBeenCalledWith(
        'r1',
        'chat:message-deleted',
        expect.objectContaining({ messageId: 'm1', roomId: 'r1' }),
      );
      expect(result.deletedAt).toBe(deletedAt);
    });

    it('is idempotent — returns existing deletedAt without re-updating when already deleted', async () => {
      const deletedAt = new Date('2024-01-01');
      mockPrisma.chatMessage.findUnique.mockResolvedValue({
        id: 'm1', senderId: 'u1', roomId: 'r1', deletedAt,
      });

      const result = await service.deleteMessage('m1', 'u1');

      expect(mockPrisma.chatMessage.update).not.toHaveBeenCalled();
      expect(result.deletedAt).toBe(deletedAt);
    });
  });

  describe('createRoom', () => {
    it('creates direct room with deduped participant list (creator always included)', async () => {
      const room = { id: 'r1', participants: [] };
      mockPrisma.chatRoom.create.mockResolvedValue(room);

      const result = await service.createRoom('creator', {
        type: 'direct' as never,
        participantIds: ['creator', 'user2'],
      });

      expect(mockPrisma.chatRoom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            participants: {
              create: [{ userId: 'creator' }, { userId: 'user2' }],
            },
          }),
        }),
      );
      expect(result).toEqual(room);
    });

    it('returns existing room for team_match type (get-or-create idempotent)', async () => {
      const existing = { id: 'r-existing', teamMatchId: 'tm-1', participants: [] };
      mockPrisma.chatRoom.findUnique.mockResolvedValue(existing);

      const result = await service.createRoom('host', {
        type: 'team_match' as never,
        teamMatchId: 'tm-1',
      });

      expect(mockPrisma.chatRoom.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teamMatchId: 'tm-1' } }),
      );
      expect(mockPrisma.chatRoom.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('creates team_match room with server-derived participants when no existing room', async () => {
      mockPrisma.chatRoom.findUnique.mockResolvedValue(null);
      mockPrisma.teamMatch.findUnique.mockResolvedValue({
        id: 'tm-1',
        hostTeam: { ownerId: 'host-owner' },
        applications: [
          { applicantTeam: { ownerId: 'guest-owner' }, status: 'approved' },
        ],
      });
      const newRoom = { id: 'r-new', teamMatchId: 'tm-1', participants: [] };
      mockPrisma.chatRoom.create.mockResolvedValue(newRoom);

      const result = await service.createRoom('host-owner', {
        type: 'team_match' as never,
        teamMatchId: 'tm-1',
      });

      expect(mockPrisma.chatRoom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamMatchId: 'tm-1',
            participants: {
              create: expect.arrayContaining([{ userId: 'host-owner' }, { userId: 'guest-owner' }]),
            },
          }),
        }),
      );
      expect(result).toEqual(newRoom);
    });

    it('throws NotFoundException when teamMatchId does not exist', async () => {
      mockPrisma.chatRoom.findUnique.mockResolvedValue(null);
      mockPrisma.teamMatch.findUnique.mockResolvedValue(null);

      await expect(
        service.createRoom('host', { type: 'team_match' as never, teamMatchId: 'missing-tm' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUnreadCount', () => {
    it('returns 0 when user participates in no rooms (raw query returns 0)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ total: 0n }]);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(0);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      // Prisma per-room count must NOT be called — N+1 guard
      expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
    });

    it('sums unread messages across all rooms via single raw query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ total: 5n }]);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(5);
      // Exactly one DB round-trip regardless of room count
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
    });

    it('excludes messages sent by the user themselves (senderId != userId)', async () => {
      // The raw query embeds the senderId filter; service result reflects DB result
      mockPrisma.$queryRaw.mockResolvedValue([{ total: 2n }]);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(2);
      // Verify $queryRaw was invoked — the SQL contains senderId != userId filter
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when raw query returns empty rows (no participations)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(0);
    });

    it('counts all messages as unread when lastReadAt is null (raw query handles NULL)', async () => {
      // DB handles the NULL last_read_at case inside the SQL; service just sums result
      mockPrisma.$queryRaw.mockResolvedValue([{ total: 7n }]);

      const result = await service.getUnreadCount('u1');

      expect(result).toBe(7);
    });
  });

  describe('markRead', () => {
    it('throws CHAT_FORBIDDEN when user is not a participant', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.markRead('r1', 'stranger', 'm1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when message is not in room', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      mockPrisma.chatMessage.findUnique.mockResolvedValue({ id: 'm1', roomId: 'other-room' });

      await expect(service.markRead('r1', 'u1', 'm1')).rejects.toThrow(NotFoundException);
    });

    it('updates lastReadAt to message createdAt', async () => {
      const createdAt = new Date();
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      mockPrisma.chatMessage.findUnique.mockResolvedValue({ id: 'm1', roomId: 'r1', createdAt });
      mockPrisma.chatRoomParticipant.update.mockResolvedValue({ lastReadAt: createdAt });

      const result = await service.markRead('r1', 'u1', 'm1');

      expect(mockPrisma.chatRoomParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { lastReadAt: createdAt },
        }),
      );
      expect(result).toEqual({ lastReadAt: createdAt });
    });
  });
});
