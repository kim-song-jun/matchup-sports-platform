import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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
  },
  chatRoomParticipant: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  teamMatch: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRealtimeGateway = {
  emitToRoom: jest.fn(),
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtimeGateway },
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
      const messages = [{ id: 'm1', content: 'hi' }, { id: 'm2', content: 'hello' }];
      mockPrisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.listMessages('r1', 'u1');

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('postMessage', () => {
    it('throws CHAT_FORBIDDEN when user is not a participant', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(service.postMessage('r1', 'stranger', { content: 'hi' })).rejects.toThrow(ForbiddenException);
    });

    it('persists message, updates lastMessageAt via transaction, and broadcasts via realtime', async () => {
      mockPrisma.chatRoomParticipant.findUnique.mockResolvedValue({ roomId: 'r1', userId: 'u1' });
      const savedMessage = { id: 'm1', content: 'hi', senderId: 'u1', createdAt: new Date(), type: 'text', sender: { id: 'u1', nickname: 'User1' } };
      mockPrisma.$transaction.mockResolvedValue([savedMessage, {}]);

      const result = await service.postMessage('r1', 'u1', { content: 'hi' });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockRealtimeGateway.emitToRoom).toHaveBeenCalledWith('r1', 'chat:message', expect.objectContaining({ id: 'm1', roomId: 'r1' }));
      expect(result).toEqual(savedMessage);
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
