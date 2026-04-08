import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { PostMessageDto } from './dto/post-message.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UserBlocksService } from '../user-blocks/user-blocks.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
    private readonly userBlocksService: UserBlocksService,
  ) {}

  /** List rooms the user participates in, cursor-paginated by lastMessageAt desc. */
  async listRooms(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(limit, 100);
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        participants: { some: { userId } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
      include: {
        participants: {
          include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, type: true, createdAt: true, senderId: true },
        },
      },
    });

    const hasMore = rooms.length > take;
    const data = hasMore ? rooms.slice(0, take) : rooms;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  /** Get a single room with last 30 messages. Asserts user is a participant. */
  async getRoom(roomId: string, userId: string) {
    await this.assertParticipant(roomId, userId);

    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            sender: { select: { id: true, nickname: true, profileImageUrl: true } },
          },
        },
      },
    });

    if (room) {
      room.messages = room.messages.map((m) => this.applyDeletion(m));
    }

    return room;
  }

  /** List messages for a room with cursor pagination. */
  async listMessages(roomId: string, userId: string, before?: string, limit = 30) {
    await this.assertParticipant(roomId, userId);

    const take = Math.min(limit, 100);
    const messages = await this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(before
        ? { skip: 1, cursor: { id: before } }
        : {}),
      include: {
        sender: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
    });

    const hasMore = messages.length > take;
    const raw = hasMore ? messages.slice(0, take) : messages;
    const data = raw.map((m) => this.applyDeletion(m));
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  /**
   * Persist a message, update room.lastMessageAt, and broadcast to the room via Socket.IO.
   * Single source of truth — RealtimeGateway calls this; REST controller calls this.
   */
  async postMessage(roomId: string, userId: string, dto: PostMessageDto) {
    await this.assertParticipant(roomId, userId);

    if (!dto.content && !dto.imageUrl) {
      throw new BadRequestException({ code: 'CHAT_EMPTY_MESSAGE', message: '내용 또는 이미지가 필요합니다.' });
    }

    // Block check: if any other participant has blocked the sender, reject the message
    const otherParticipants = await this.prisma.chatRoomParticipant.findMany({
      where: { roomId, userId: { not: userId } },
      select: { userId: true },
    });
    for (const { userId: otherId } of otherParticipants) {
      if (await this.userBlocksService.isBlocked(otherId, userId)) {
        throw new ForbiddenException({ code: 'CHAT_BLOCKED', message: '차단된 사용자에게 메시지를 보낼 수 없습니다.' });
      }
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          roomId,
          senderId: userId,
          content: dto.content ?? '',
          ...(dto.imageUrl ? { imageUrl: dto.imageUrl } : {}),
        },
        include: {
          sender: { select: { id: true, nickname: true, profileImageUrl: true } },
        },
      }),
      this.prisma.chatRoom.update({
        where: { id: roomId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    this.realtimeGateway.emitToRoom(roomId, 'chat:message', {
      id: message.id,
      senderId: message.senderId,
      sender: (message as unknown as { sender: unknown }).sender,
      roomId,
      content: message.content,
      imageUrl: message.imageUrl ?? null,
      type: message.type,
      createdAt: message.createdAt,
    });

    return message;
  }

  /**
   * Soft-delete a message. Only the sender may delete their own message.
   * Broadcasts chat:message-deleted to all room participants.
   */
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException({ code: 'CHAT_MESSAGE_NOT_FOUND', message: '메시지를 찾을 수 없습니다.' });
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException({ code: 'CHAT_FORBIDDEN', message: '본인 메시지만 삭제할 수 있습니다.' });
    }

    if (message.deletedAt) {
      // Already deleted — idempotent, no-op
      return { id: messageId, deletedAt: message.deletedAt };
    }

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    this.realtimeGateway.emitToRoom(message.roomId, 'chat:message-deleted', {
      messageId,
      roomId: message.roomId,
      deletedAt: updated.deletedAt,
    });

    return { id: messageId, deletedAt: updated.deletedAt };
  }

  /** Create a new chat room (get-or-create for team_match type). */
  async createRoom(userId: string, dto: CreateRoomDto) {
    if (dto.type === 'team_match') {
      if (!dto.teamMatchId) {
        throw new Error('teamMatchId is required for team_match room type');
      }

      // Return existing room if already created for this match (idempotent)
      const existing = await this.prisma.chatRoom.findUnique({
        where: { teamMatchId: dto.teamMatchId },
        include: {
          participants: {
            include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
          },
        },
      });
      if (existing) return existing;

      // Derive participants server-side from TeamMatch
      const match = await this.prisma.teamMatch.findUnique({
        where: { id: dto.teamMatchId },
        include: {
          hostTeam: { select: { ownerId: true } },
          applications: {
            where: { status: 'approved' },
            include: { applicantTeam: { select: { ownerId: true } } },
          },
        },
      });

      if (!match) {
        throw new NotFoundException('팀 매치를 찾을 수 없습니다.');
      }

      const participantIds = Array.from(new Set([
        match.hostTeam.ownerId,
        ...match.applications.map((a) => a.applicantTeam.ownerId),
      ]));

      return this.prisma.chatRoom.create({
        data: {
          type: dto.type,
          teamMatchId: dto.teamMatchId,
          participants: {
            create: participantIds.map((pid) => ({ userId: pid })),
          },
        },
        include: {
          participants: {
            include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
          },
        },
      });
    }

    // For direct/team types: use client-supplied participantIds
    if (!dto.participantIds || dto.participantIds.length === 0) {
      throw new Error('participantIds is required for non-team_match room types');
    }
    const allParticipantIds = Array.from(new Set([userId, ...dto.participantIds]));

    return this.prisma.chatRoom.create({
      data: {
        type: dto.type,
        participants: {
          create: allParticipantIds.map((pid) => ({ userId: pid })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
        },
      },
    });
  }

  /** Mark the user's read position up to messageId. */
  async markRead(roomId: string, userId: string, messageId: string) {
    await this.assertParticipant(roomId, userId);

    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.roomId !== roomId) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }

    return this.prisma.chatRoomParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: message.createdAt },
    });
  }

  /**
   * Masks deleted message content for API consumers while preserving the DB row for audit.
   * Works with any message-shaped object returned from Prisma includes.
   */
  private applyDeletion<T extends { deletedAt: Date | null; content: string; imageUrl?: string | null }>(
    message: T,
  ): T {
    if (!message.deletedAt) return message;
    return { ...message, content: '삭제된 메시지입니다', imageUrl: null };
  }

  /** Asserts that userId is a participant of roomId. Throws 403 CHAT_FORBIDDEN otherwise. */
  async assertParticipant(roomId: string, userId: string) {
    const participant = await this.prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!participant) {
      throw new ForbiddenException({ code: 'CHAT_FORBIDDEN', message: '채팅방 접근 권한이 없습니다.' });
    }

    return participant;
  }
}
