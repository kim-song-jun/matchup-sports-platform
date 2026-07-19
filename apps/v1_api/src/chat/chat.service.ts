import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { V1AuthUser } from '../auth/v1-auth-user';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { currentChatEntitlementWhere, currentChatRecipientEntitlementWhere } from './chat-entitlement';
import {
  ChatMessagesQueryDto,
  ChatRoomsQueryDto,
  LeaveChatRoomDto,
  ResolveChatRoomDto,
  SendChatMessageDto,
  UpdateMyChatRoomDto,
} from './dto/chat.dto';

type RoomWithRelations = Prisma.V1ChatRoomGetPayload<{
  include: {
    match: { select: { id: true; title: true } };
    team: { select: { id: true; name: true } };
    teamMatch: { select: { id: true; title: true; hostTeamId: true; approvedApplicantTeamId: true } };
    participants: {
      include: {
        user: { select: { id: true; profile: { select: { nickname: true; displayName: true; profileImageUrl: true } } } };
      };
    };
    messages: true;
  };
}>;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly webPushService: WebPushService,
    @InjectPinoLogger(ChatService.name) private readonly logger: PinoLogger,
  ) {}

  async rooms(user: V1AuthUser, query: ChatRoomsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const rooms = await this.prisma.v1ChatRoom.findMany({
      where: {
        status: query.status ?? 'active',
        ...(query.roomType === 'match' ? { matchId: { not: null } } : {}),
        ...(query.roomType === 'team' ? { teamId: { not: null } } : {}),
        ...(query.roomType === 'team_match' ? { teamMatchId: { not: null } } : {}),
        participants: { some: { userId: user.id, status: 'active' } },
        AND: [currentChatEntitlementWhere(user.id)],
      },
      include: this.roomInclude(user.id),
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = rooms.slice(0, limit);
    const hasNext = rooms.length > limit;

    return {
      items: await Promise.all(pageItems.map((room) => this.toRoomListItem(room, user.id))),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async resolve(user: V1AuthUser, dto: ResolveChatRoomDto) {
    if (dto.targetType === 'match') {
      await this.assertCanUseMatchChat(user.id, dto.targetId);
      return this.resolveMatchRoom(user.id, dto.targetId);
    }
    if (dto.targetType === 'team') {
      await this.assertCanUseTeamChat(user.id, dto.targetId);
      return this.resolveTeamRoom(user.id, dto.targetId);
    }
    await this.assertCanUseTeamMatchChat(user.id, dto.targetId);
    return this.resolveTeamMatchRoom(user.id, dto.targetId);
  }

  async detail(user: V1AuthUser, roomId: string) {
    const room = await this.ensureEntered(user.id, await this.getActiveParticipantRoom(user.id, roomId));
    return {
      roomId: room.id,
      roomType: getRoomType(room),
      status: room.status,
      title: getRoomTitle(room),
      linkedTarget: getLinkedTarget(room),
      me: this.toMe(room, user.id),
      participants: room.participants.slice(0, 20).map((participant) => ({
        userId: participant.userId,
        displayName: participant.user.profile?.nickname ?? participant.user.profile?.displayName ?? '참여자',
        role: participant.userId === user.id ? 'participant' : 'viewer',
      })),
    };
  }

  async messages(user: V1AuthUser, roomId: string, query: ChatMessagesQueryDto) {
    const room = await this.ensureEntered(user.id, await this.getActiveParticipantRoom(user.id, roomId));
    const me = room.participants[0];
    const visibleFromAt = me.visibleFromAt ?? new Date(0);
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const direction = query.direction ?? 'before';
    const messages = await this.prisma.v1ChatMessage.findMany({
      where: { chatRoomId: roomId, sentAt: { gte: visibleFromAt } },
      include: {
        senderUser: {
          select: {
            id: true,
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
          },
        },
      },
      orderBy: { sentAt: direction === 'after' ? 'asc' : 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = messages.slice(0, limit);
    const hasNext = messages.length > limit;
    const participants = await this.prisma.v1ChatRoomParticipant.findMany({
      where: { chatRoomId: roomId, status: 'active', visibleFromAt: { not: null } },
      include: {
        lastReadMessage: { select: { id: true, sentAt: true } },
      },
    });

    return {
      items: pageItems.map((message) => ({
        messageId: message.id,
        sender: {
          userId: message.senderUser.id,
          displayName: message.senderUser.profile?.nickname ?? message.senderUser.profile?.displayName ?? '사용자',
          profileImageUrl: message.senderUser.profile?.profileImageUrl ?? null,
        },
        messageType: message.messageType,
        systemEventType: message.systemEventType ?? null,
        content: message.status === 'sent' ? message.body : null,
        status: message.status,
        sentAt: message.sentAt,
        mine: message.senderUserId === user.id,
        unreadCount: this.unreadCountForMessage(message, participants),
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async sendMessage(user: V1AuthUser, roomId: string, dto: SendChatMessageDto) {
    const content = dto.content.trim();
    if (!content) throw validationError('content is required', 'content');
    const room = await this.getActiveParticipantRoom(user.id, roomId);
    if (room.status !== 'active') throw stateConflict('Chat room is not active');

    const { message, recipientUserIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1ChatMessage.create({
        data: { chatRoomId: room.id, senderUserId: user.id, body: content, status: 'sent' },
      });
      await tx.v1ChatRoom.update({
        where: { id: room.id },
        data: { lastMessageAt: created.sentAt },
      });
      const recipients = await tx.v1ChatRoomParticipant.findMany({
        where: {
          chatRoomId: room.id,
          status: 'active',
          userId: { not: user.id },
          OR: [{ mutedUntil: null }, { mutedUntil: { lte: new Date() } }],
          AND: [currentChatRecipientEntitlementWhere(room)],
        },
        select: { userId: true },
      });
      if (recipients.length > 0) {
        await tx.v1Notification.createMany({
          data: recipients.map((participant) => ({
            recipientUserId: participant.userId,
            targetType: 'chat',
            targetId: room.id,
            title: getRoomTitle(room),
            body: content.slice(0, 120),
            deepLink: `/chat/${room.id}`,
          })),
        });
      }
      return { message: created, recipientUserIds: recipients.map((participant) => participant.userId) };
    });

    const chatMessagePayload = {
      messageId: message.id,
      roomId: room.id,
      content: message.body,
      status: message.status,
      sentAt: message.sentAt,
      senderUserId: user.id,
    };
    const pushEnabledRecipientIds = await this.chatPushEnabledRecipientIds(recipientUserIds);
    const roomTitle = getRoomTitle(room);
    // Fire-and-forget, matching NotificationsService's emitNotificationFireAndForget:
    // the message + notifications already committed above, so a realtime-emit or
    // web-push failure must never surface as an error response for a request that
    // already succeeded.
    for (const recipientUserId of recipientUserIds) {
      try {
        this.realtimeGateway.emitToUser(recipientUserId, 'chat:message', chatMessagePayload);
        this.realtimeGateway.emitToUser(recipientUserId, 'notification:new', {
          targetType: 'chat',
          targetId: room.id,
        });
      } catch (err) {
        this.logger.warn(
          {
            recipientUserId,
            roomId: room.id,
            error: err instanceof Error ? err.message : String(err),
          },
          '실시간 채팅 알림 전송 실패',
        );
      }
      if (!pushEnabledRecipientIds.has(recipientUserId)) continue;
      try {
        await this.webPushService.sendToUser(recipientUserId, {
          title: roomTitle,
          body: content.slice(0, 120),
          url: `/chat/${room.id}`,
        });
      } catch (err) {
        this.logger.warn(
          {
            recipientUserId,
            roomId: room.id,
            error: err instanceof Error ? err.message : String(err),
          },
          '채팅 웹 푸시 발송 실패',
        );
      }
    }

    return chatMessagePayload;
  }

  /**
   * Recipients with chatEnabled=false in V1NotificationPreference are excluded from
   * web push (no preference row → default enabled, matching NotificationsService's
   * createNotificationWithPrefCheck convention).
   */
  private async chatPushEnabledRecipientIds(recipientUserIds: string[]): Promise<Set<string>> {
    if (recipientUserIds.length === 0) return new Set();
    const preferences = await this.prisma.v1NotificationPreference.findMany({
      where: { userId: { in: recipientUserIds } },
      select: { userId: true, chatEnabled: true },
    });
    const disabledUserIds = new Set(
      preferences.filter((preference) => !preference.chatEnabled).map((preference) => preference.userId),
    );
    return new Set(recipientUserIds.filter((userId) => !disabledUserIds.has(userId)));
  }

  async updateMe(user: V1AuthUser, roomId: string, dto: UpdateMyChatRoomDto) {
    const room = await this.ensureEntered(user.id, await this.getActiveParticipantRoom(user.id, roomId));
    if (dto.lastReadMessageId) {
      const visibleFromAt = room.participants[0].visibleFromAt ?? new Date(0);
      const readMessage = await this.prisma.v1ChatMessage.findUnique({
        where: { id: dto.lastReadMessageId },
        select: { id: true, chatRoomId: true, sentAt: true },
      });
      if (!readMessage || readMessage.chatRoomId !== roomId || readMessage.sentAt < visibleFromAt) {
        throw validationError('lastReadMessageId must reference a visible message in this chat room', 'lastReadMessageId');
      }
    }
    const updated = await this.prisma.v1ChatRoomParticipant.update({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId: user.id } },
      data: {
        ...(dto.pinned === undefined ? {} : { pinnedAt: dto.pinned ? new Date() : null }),
        ...(dto.lastReadMessageId === undefined ? {} : { lastReadMessageId: dto.lastReadMessageId }),
        ...(dto.mutedUntil === undefined ? {} : { mutedUntil: dto.mutedUntil ? new Date(dto.mutedUntil) : null }),
      },
    });

    return {
      roomId,
      pinned: Boolean(updated.pinnedAt),
      mutedUntil: updated.mutedUntil,
      lastReadMessageId: updated.lastReadMessageId,
      status: updated.status,
    };
  }

  async leave(user: V1AuthUser, roomId: string, dto: LeaveChatRoomDto) {
    const room = await this.getRoomParticipant(user.id, roomId);
    const participant = room.participants[0];
    if (participant.status === 'left') {
      throw new ConflictException({ code: 'ALREADY_PROCESSED', message: 'Already left this chat room' });
    }
    const leftAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.v1ChatRoomParticipant.update({
        where: { chatRoomId_userId: { chatRoomId: roomId, userId: user.id } },
        data: { status: 'left', leftAt },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'chat_room_participant',
          targetId: next.id,
          fromStatus: participant.status,
          toStatus: 'left',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'chat_room_left',
        },
      });
      return next;
    });
    return { roomId, status: updated.status, leftAt };
  }

  private async resolveMatchRoom(userId: string, matchId: string) {
    const existing = await this.prisma.v1ChatRoom.findUnique({ where: { matchId } });
    const room = existing ?? (await this.prisma.v1ChatRoom.create({ data: { matchId, status: 'active' } }));
    await this.ensureResolvedParticipant(room.id, userId);
    return { roomId: room.id, roomType: 'match', created: !existing, route: chatRoomRoute(room.id) };
  }

  private async resolveTeamRoom(userId: string, teamId: string) {
    const existing = await this.prisma.v1ChatRoom.findUnique({ where: { teamId } });
    const room = existing ?? (await this.prisma.v1ChatRoom.create({ data: { teamId, status: 'active' } }));
    await this.ensureResolvedParticipant(room.id, userId);
    return { roomId: room.id, roomType: 'team', created: !existing, route: chatRoomRoute(room.id) };
  }

  private async resolveTeamMatchRoom(userId: string, teamMatchId: string) {
    const existing = await this.prisma.v1ChatRoom.findUnique({ where: { teamMatchId } });
    const room = existing ?? (await this.prisma.v1ChatRoom.create({ data: { teamMatchId, status: 'active' } }));
    await this.ensureResolvedParticipant(room.id, userId);
    return { roomId: room.id, roomType: 'team_match', created: !existing, route: chatRoomRoute(room.id) };
  }

  private async assertCanUseMatchChat(userId: string, matchId: string) {
    const participant = await this.prisma.v1MatchParticipant.findFirst({
      where: { matchId, userId, status: 'active', match: { deletedAt: null } },
      select: { id: true },
    });
    if (!participant) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Match chat requires active participation' });
  }

  private async assertCanUseTeamChat(userId: string, teamId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        team: { status: 'active', deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Team chat requires active team membership' });
  }

  private async assertCanUseTeamMatchChat(userId: string, teamMatchId: string) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, status: 'matched', deletedAt: null },
      select: { hostTeamId: true, approvedApplicantTeamId: true },
    });
    if (!teamMatch?.approvedApplicantTeamId) throw stateConflict('Team match chat is available after matching');
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        teamId: { in: [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId] },
      },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Team match chat requires team owner or manager role' });
  }

  private async getActiveParticipantRoom(userId: string, roomId: string) {
    const room = await this.getRoomParticipant(userId, roomId);
    if (room.participants[0].status !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Chat room participant is not active' });
    }
    await this.assertCurrentRoomEntitlement(userId, room);
    return room;
  }

  private async assertCurrentRoomEntitlement(
    userId: string,
    room: { matchId: string | null; teamId: string | null; teamMatchId: string | null },
  ) {
    if (room.matchId) return this.assertCanUseMatchChat(userId, room.matchId);
    if (room.teamId) return this.assertCanUseTeamChat(userId, room.teamId);
    if (room.teamMatchId) return this.assertCanUseTeamMatchChat(userId, room.teamMatchId);
    throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Chat room is not linked to an active target' });
  }

  private async getRoomParticipant(userId: string, roomId: string) {
    const room = await this.prisma.v1ChatRoom.findFirst({
      where: { id: roomId },
      include: {
        ...this.roomInclude(userId),
        participants: {
          where: { userId },
          include: {
            user: { select: { id: true, profile: { select: { nickname: true, displayName: true, profileImageUrl: true } } } },
          },
        },
      },
    });
    if (!room) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Chat room was not found' });
    if (room.participants.length === 0) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Chat room access is denied' });
    }
    return room;
  }

  private async ensureResolvedParticipant(roomId: string, userId: string) {
    const existing = await this.prisma.v1ChatRoomParticipant.findUnique({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
    });
    if (!existing) {
      await this.prisma.v1ChatRoomParticipant.create({
        data: { chatRoomId: roomId, userId, status: 'active', visibleFromAt: null },
      });
      return;
    }
    if (existing.status === 'left') {
      await this.prisma.v1ChatRoomParticipant.update({
        where: { id: existing.id },
        data: { status: 'active', leftAt: null, lastReadMessageId: null, visibleFromAt: null },
      });
    }
  }

  private async ensureEntered(userId: string, room: Awaited<ReturnType<ChatService['getActiveParticipantRoom']>>) {
    const participant = room.participants[0];
    if (participant.visibleFromAt) return room;

    const enteredAt = new Date();
    const displayName = participant.user.profile?.nickname ?? participant.user.profile?.displayName ?? '참여자';
    await this.prisma.$transaction(async (tx) => {
      const entered = await tx.v1ChatRoomParticipant.updateMany({
        where: { id: participant.id, visibleFromAt: null },
        data: { visibleFromAt: enteredAt },
      });
      if (entered.count === 0) return;
      const notice = await tx.v1ChatMessage.create({
        data: {
          chatRoomId: room.id,
          senderUserId: userId,
          body: `${displayName}님이 들어왔습니다`,
          status: 'sent',
          messageType: 'system',
          systemEventType: 'joined',
          sentAt: enteredAt,
        },
      });
      await tx.v1ChatRoom.update({
        where: { id: room.id },
        data: { lastMessageAt: notice.sentAt },
      });
    });

    const current = await this.prisma.v1ChatRoomParticipant.findUnique({
      where: { id: participant.id },
      select: { visibleFromAt: true },
    });
    participant.visibleFromAt = current?.visibleFromAt ?? enteredAt;
    return room;
  }

  private unreadCountForMessage(
    message: {
      senderUserId: string;
      sentAt: Date;
      messageType: string;
    },
    participants: Array<{
      userId: string;
      visibleFromAt: Date | null;
      lastReadMessage: { sentAt: Date } | null;
    }>,
  ) {
    if (message.messageType !== 'text') return 0;
    return participants.filter((participant) => {
      if (participant.userId === message.senderUserId) return false;
      if (!participant.visibleFromAt || participant.visibleFromAt > message.sentAt) return false;
      return !participant.lastReadMessage || participant.lastReadMessage.sentAt < message.sentAt;
    }).length;
  }

  private roomInclude(_userId: string) {
    return {
      match: { select: { id: true, title: true } },
      team: { select: { id: true, name: true } },
      teamMatch: { select: { id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true } },
      participants: {
        include: {
          user: { select: { id: true, profile: { select: { nickname: true, displayName: true, profileImageUrl: true } } } },
        },
      },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
    } satisfies Prisma.V1ChatRoomInclude;
  }

  private async toRoomListItem(room: RoomWithRelations, userId: string) {
    const me = room.participants.find((participant) => participant.userId === userId);
    const visibleFromAt = me?.visibleFromAt ?? null;
    const lastMessage = visibleFromAt
      ? (room.messages.find((message) => message.sentAt >= visibleFromAt) ?? null)
      : null;
    const lastReadMessage = me?.lastReadMessageId
      ? await this.prisma.v1ChatMessage.findUnique({ where: { id: me.lastReadMessageId }, select: { sentAt: true } })
      : null;
    const unreadCount = await this.prisma.v1ChatMessage.count({
      where: {
        chatRoomId: room.id,
        status: 'sent',
        messageType: 'text',
        senderUserId: { not: userId },
        ...(visibleFromAt ? { sentAt: { gte: visibleFromAt, ...(lastReadMessage ? { gt: lastReadMessage.sentAt } : {}) } } : { id: '__never__' }),
      },
    });
    return {
      roomId: room.id,
      roomType: getRoomType(room),
      title: getRoomTitle(room),
      status: room.status,
      linkedTarget: getLinkedTarget(room),
      lastMessage: lastMessage
        ? { messageId: lastMessage.id, contentPreview: lastMessage.body.slice(0, 80), sentAt: lastMessage.sentAt }
        : null,
      unreadCount,
      pinned: Boolean(me?.pinnedAt),
      muted: Boolean(me?.mutedUntil && me.mutedUntil.getTime() > Date.now()),
    };
  }

  private toMe(room: RoomWithRelations, userId: string) {
    const me = room.participants.find((participant) => participant.userId === userId);
    return {
      participantId: me?.id ?? null,
      status: me?.status ?? 'left',
      pinned: Boolean(me?.pinnedAt),
      mutedUntil: me?.mutedUntil ?? null,
      lastReadMessageId: me?.lastReadMessageId ?? null,
      visibleFromAt: me?.visibleFromAt ?? null,
    };
  }
}

function getRoomType(room: { matchId: string | null; teamId: string | null; teamMatchId: string | null }) {
  if (room.matchId) return 'match';
  if (room.teamId) return 'team';
  return 'team_match';
}

function getRoomTitle(room: { match: { title: string } | null; team: { name: string } | null; teamMatch: { title: string } | null }) {
  return room.match?.title ?? room.team?.name ?? room.teamMatch?.title ?? '채팅';
}

function getLinkedTarget(room: {
  matchId: string | null;
  teamId: string | null;
  teamMatchId: string | null;
  match: { id: string; title: string } | null;
  team: { id: string; name: string } | null;
  teamMatch: { id: string; title: string } | null;
}) {
  if (room.match) return { type: 'match', id: room.match.id, title: room.match.title, route: `/matches/${room.match.id}` };
  if (room.team) return { type: 'team', id: room.team.id, title: room.team.name, route: `/teams/${room.team.id}` };
  if (room.teamMatch) return { type: 'team_match', id: room.teamMatch.id, title: room.teamMatch.title, route: `/team-matches/${room.teamMatch.id}` };
  return { type: null, id: null, title: '채팅', route: null };
}

function validationError(message: string, field: string) {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message, details: { field } });
}

function stateConflict(message: string, code = 'STATE_CONFLICT') {
  return new ConflictException({ code, message });
}

function chatRoomRoute(roomId: string) {
  return `/chat/${roomId}`;
}
