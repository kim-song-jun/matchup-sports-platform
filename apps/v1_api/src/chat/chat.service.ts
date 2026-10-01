import { INQUIRY_SLACK_NOTIFICATION_TYPE } from '../inquiries/inquiry-slack-notifier';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1ChatSystemEventType } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { V1AuthUser } from '../auth/v1-auth-user';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { currentChatEntitlementWhere, currentChatRecipientEntitlementWhere } from './chat-entitlement';
import { archiveEndedContactRooms } from '../team-contacts/contact-room-archive';
import {
  CHAT_SHARE_KINDS,
  ChatShareKind,
  ChatShareTargetDto,
  ReportChatMessageDto,
  ChatMessagesQueryDto,
  ChatRoomsQueryDto,
  LeaveChatRoomDto,
  ResolveChatRoomDto,
  SendChatMessageDto,
  UpdateMyChatRoomDto,
} from './dto/chat.dto';

/** 시스템 줄의 chat:message 페이로드 — 텍스트 메시지 페이로드에 종류 두 칸을 더한다. */
export type ChatSystemLine = {
  messageId: string;
  roomId: string;
  content: string;
  status: 'sent';
  sentAt: Date;
  senderUserId: string;
  messageType: 'system';
  systemEventType: V1ChatSystemEventType | null;
};

/** 입장·퇴장 줄은 event 로 본문을 만들고, 그 밖의 줄(컨택 응답 등)은 enum 을 늘리지 않고 event=null + 호출자 본문을 쓴다. */
export type ChatSystemLineInput = { chatRoomId: string; userId: string; at: Date; backdated?: boolean } & (
  | { event: V1ChatSystemEventType; displayName?: string }
  | { event: null; body: string }
);

type ChatRecipientRoom = Parameters<typeof currentChatRecipientEntitlementWhere>[0] & { id: string };

const RECIPIENT_ROOM_SELECT = {
  id: true,
  matchId: true,
  teamId: true,
  teamMatchId: true,
  teamMatch: { select: { hostTeamId: true, approvedApplicantTeamId: true } },
  teamContactId: true,
  teamContact: { select: { fromTeamId: true, toTeamId: true } },
} satisfies Prisma.V1ChatRoomSelect;

type RoomWithRelations = Prisma.V1ChatRoomGetPayload<{
  include: {
    match: { select: { id: true; title: true } };
    team: { select: { id: true; name: true } };
    teamMatch: { select: { id: true; title: true; hostTeamId: true; approvedApplicantTeamId: true } };
    teamContact: {
      select: {
        id: true;
        fromTeamId: true;
        toTeamId: true;
        status: true;
        expiresAt: true;
        declineReason: true;
        fromTeam: { select: { id: true; name: true } };
        toTeam: { select: { id: true; name: true; memberships: { select: { id: true } } } };
      };
    };
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

  private emitSafetyChanged(userId: string) {
    try { this.realtimeGateway.emitToUser(userId, 'chat:safety-changed', {}); }
    catch (err) { this.logger.warn({ err }, '차단 설정은 저장됐지만 실시간 갱신을 전달하지 못했습니다'); }
  }

  async blockedUsers(user: V1AuthUser) {
    const rows = await this.prisma.v1ChatUserBlock.findMany({
      where: { blockerUserId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { profile: { select: { nickname: true, displayName: true } } } } },
    });
    return { items: rows.map((row) => ({ userId: row.blockedUserId, displayName: row.blocked.profile?.nickname ?? row.blocked.profile?.displayName ?? '사용자' })) };
  }

  async unblockUser(user: V1AuthUser, blockedUserId: string) {
    const removed = await this.prisma.v1ChatUserBlock.deleteMany({ where: { blockerUserId: user.id, blockedUserId } });
    this.emitSafetyChanged(user.id);
    if (removed.count > 0) this.emitSafetyChanged(blockedUserId);
    return { blocked: false };
  }

  private async safetyMessage(user: V1AuthUser, roomId: string, messageId: string) {
    const room = await this.getActiveParticipantRoom(user.id, roomId);
    const visibleFromAt = room.participants[0]?.visibleFromAt;
    if (!visibleFromAt) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '먼저 채팅방에 입장해 주세요.' });
    const message = await this.prisma.v1ChatMessage.findFirst({
      // 사진 메시지도 신고·차단 대상이다 — 사람이 보낸 것 중 입장·퇴장 같은 system 만 뺀다.
      where: { id: messageId, chatRoomId: roomId, messageType: { not: 'system' }, status: 'sent', sentAt: { gte: visibleFromAt }, senderUser: chatVisibleUserWhere(user.id) },
      include: { attachmentAsset: { select: { url: true, originalName: true, kind: true } } },
    });
    if (!message) throw new NotFoundException({ code: 'NOT_FOUND', message: '신고할 메시지를 찾을 수 없어요.' });
    if (message.senderUserId === user.id) throw new BadRequestException({ code: 'INVALID_TARGET', message: '본인의 메시지는 신고하거나 차단할 수 없어요.' });
    return message;
  }

  async blockMessageSender(user: V1AuthUser, roomId: string, messageId: string) {
    const message = await this.safetyMessage(user, roomId, messageId);
    await this.prisma.v1ChatUserBlock.upsert({
      where: { blockerUserId_blockedUserId: { blockerUserId: user.id, blockedUserId: message.senderUserId } },
      create: { blockerUserId: user.id, blockedUserId: message.senderUserId },
      update: {},
    });
    for (const id of [user.id, message.senderUserId]) this.emitSafetyChanged(id);
    return { blocked: true };
  }

  async reportMessage(user: V1AuthUser, roomId: string, messageId: string, dto: ReportChatMessageDto) {
    const message = await this.safetyMessage(user, roomId, messageId);
    const inquiry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1Inquiry.create({ data: {
        userId: user.id, category: 'report', title: '채팅 메시지 신고',
        // Keep the server-owned message snapshot so later edits cannot rewrite the evidence.
        body: `채팅방: ${roomId}\n메시지: ${message.id}\n사유: ${dto.reason}\n내용: ${message.body}${message.attachmentAsset ? ` (${message.attachmentAsset.kind === 'file' ? `파일 ${message.attachmentAsset.originalName ?? ''} · ${message.attachmentAsset.url}` : message.attachmentAsset.url})` : ''}\n추가 설명: ${dto.detail?.trim() ?? ''}`,
        relatedType: 'user', relatedId: message.senderUserId, reportReason: dto.reason,
      } });
      await tx.v1OutboxEvent.create({ data: {
        businessKey: `inquiry:${created.id}:slack-created`, aggregateType: 'INQUIRY', aggregateId: created.id,
        type: INQUIRY_SLACK_NOTIFICATION_TYPE,
        payload: { inquiryId: created.id, category: created.category, title: created.title, relatedType: created.relatedType, relatedId: created.relatedId, createdAt: created.createdAt.toISOString() },
      } });
      return created;
    });
    return { inquiryId: inquiry.id };
  }

  async rooms(user: V1AuthUser, query: ChatRoomsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    // 컨택 만료는 lazy-flip 이라 아무도 건드리지 않은 방은 requested 인 채로 목록에 남는다.
    // 컨택 방이 섞여 나오는 조회(전체 또는 team_contact)에서만, 내가 참여한 컨택 방에 한해 만료를
    // 반영하고 끝난 방을 보관한 뒤 읽는다(스펙 §3.5 세 경로 + 이곳). 다른 roomType 필터엔 쓰기 없음.
    if (!query.roomType || query.roomType === 'team_contact') {
      await this.prisma.v1TeamContact.updateMany({
        where: { status: 'requested', expiresAt: { lt: new Date() }, chatRoom: { participants: { some: { userId: user.id } } } },
        data: { status: 'expired' },
      });
      await archiveEndedContactRooms(this.prisma, { chatRoom: { participants: { some: { userId: user.id } } } });
    }
    const rooms = await this.prisma.v1ChatRoom.findMany({
      where: {
        status: query.status ?? 'active',
        ...(query.roomType === 'match' ? { matchId: { not: null } } : {}),
        ...(query.roomType === 'team' ? { teamId: { not: null } } : {}),
        ...(query.roomType === 'team_match' ? { teamMatchId: { not: null } } : {}),
        ...(query.roomType === 'team_contact' ? { teamContactId: { not: null } } : {}),
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
    if (dto.targetType === 'team_match') {
      await this.assertCanUseTeamMatchChat(user.id, dto.targetId);
      return this.resolveTeamMatchRoom(user.id, dto.targetId);
    }
    if (dto.targetType === 'team_contact') {
      await this.assertCanUseTeamContactChat(user.id, dto.targetId);
      return this.resolveTeamContactRoom(user.id, dto.targetId);
    }
    // DTO 의 @IsIn 이 targetType 을 네 값으로 제한하므로 여기 도달할 일은 없다.
    // 도달했다면 새 방 종류가 이 분기 없이 추가된 것이다 — 조용히 마지막 분기로
    // 새느니 크게 실패한다. assertCurrentRoomEntitlement 와 같은 규약이다.
    throw validationError('Unsupported chat target type', 'targetType');
  }

  async detail(user: V1AuthUser, roomId: string) {
    const room = await this.ensureEntered(user.id, await this.getActiveParticipantRoom(user.id, roomId));
    const teamContact = this.toTeamContactBlock(room);
    return {
      roomId: room.id,
      roomType: getRoomType(room),
      status: room.status,
      title: getRoomTitle(room),
      linkedTarget: getLinkedTarget(room, counterpartTeamId(teamContact)),
      teamContact,
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
      where: { chatRoomId: roomId, sentAt: { gte: visibleFromAt }, senderUser: chatVisibleUserWhere(user.id) },
      include: {
        attachmentAsset: { select: { url: true, originalName: true, byteSize: true, mimeType: true } },
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
        user: { select: {
          chatBlocksMade: { select: { blockedUserId: true } },
          chatBlocksReceived: { select: { blockerUserId: true } },
        } },
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
        // 숨김·삭제 메시지는 본문처럼 사진도 내리지 않는다.
        // 사진 메시지만 공개 URL 을 싣는다 — 파일 업로드의 저장 경로는 응답에 내보내지 않는다.
        imageUrl: message.status === 'sent' && message.messageType === 'image' ? message.attachmentAsset?.url ?? null : null,
        // 파일은 이름·크기만. 받기는 GET /chat/rooms/:roomId/messages/:messageId/file(참여자 인증).
        file:
          message.status === 'sent' && message.messageType === 'file' && message.attachmentAsset
            ? {
                name: message.attachmentAsset.originalName ?? '파일',
                size: Number(message.attachmentAsset.byteSize),
                mimeType: message.attachmentAsset.mimeType,
              }
            : null,
        shareCard: message.status === 'sent' ? parseShareCard(message.shareCard) : null,
        status: message.status,
        sentAt: message.sentAt,
        mine: message.senderUserId === user.id,
        unreadCount: this.unreadCountForMessage(message, participants),
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  /**
   * 공유 대상을 보내는 사람 기준으로 열람 확인하고 카드 스냅숏을 만든다. 못 보면 400(존재를 드러내지 않는다).
   * - 팀 일정: 팀이 살아 있고, 공개 일정이거나 보내는 사람이 활성 팀원(팀 일정 상세의 규칙과 같다).
   *   팀 매치 일정이면 카드는 상대 팀도 열 수 있는 팀 매치 화면으로 연다.
   * - 매치: 지워지지 않은 매치(매치 상세의 규칙과 같다).
   */
  private async resolveShareCard(userId: string, target: ChatShareTargetDto): Promise<ChatShareCard> {
    if (target.kind === 'team_schedule') {
      const schedule = await this.prisma.v1TeamSchedule.findFirst({
        where: { id: target.targetId },
        select: { id: true, teamId: true, teamMatchId: true, title: true, startAt: true, visibility: true, state: true },
      });
      const team = schedule
        ? await this.prisma.v1Team.findFirst({ where: { id: schedule.teamId, status: 'active', deletedAt: null }, select: { name: true } })
        : null;
      const member = schedule && team
        ? await this.prisma.v1TeamMembership.findFirst({ where: { teamId: schedule.teamId, userId, status: 'active' }, select: { id: true } })
        : null;
      if (!schedule || !team || (schedule.visibility !== 'PUBLIC' && !member)) {
        throw validationError('공유할 일정을 찾을 수 없어요.', 'share');
      }
      // 카드는 보낼 때의 스냅숏이라 취소·끝난 일정을 보내면 받는 사람이 진행되는 줄 안다.
      if (schedule.state !== 'SCHEDULED') throw validationError('취소됐거나 끝난 일정은 공유할 수 없어요.', 'share');
      const teamMatch = schedule.teamMatchId
        ? await this.prisma.v1TeamMatch.findFirst({ where: { id: schedule.teamMatchId, deletedAt: null }, select: { placeName: true } })
        : null;
      return {
        kind: 'team_schedule',
        targetId: schedule.id,
        title: schedule.title,
        startAt: schedule.startAt.toISOString(),
        place: teamMatch?.placeName ?? null,
        sub: team.name,
        route: teamMatch && schedule.teamMatchId ? `/team-matches/${schedule.teamMatchId}` : `/teams/${schedule.teamId}/schedules/${schedule.id}`,
      };
    }
    // 종류를 명시적으로 가른다 — 검증을 빠져나온 이상한 값이 매치 분기로 떨어져 `id: undefined` 조회(= 아무 매치)가
    // 되지 않게(#1398 리뷰).
    if (target.kind !== 'match' || !target.targetId) throw validationError('공유할 대상을 알 수 없어요.', 'share');
    const match = await this.prisma.v1Match.findFirst({
      where: { id: target.targetId, deletedAt: null },
      select: { id: true, title: true, startAt: true, placeName: true, status: true },
    });
    if (!match) throw validationError('공유할 매치를 찾을 수 없어요.', 'share');
    if (match.status === 'cancelled' || match.status === 'archived') {
      throw validationError('취소된 매치는 공유할 수 없어요.', 'share');
    }
    return {
      kind: 'match',
      targetId: match.id,
      title: match.title,
      startAt: match.startAt.toISOString(),
      place: match.placeName,
      sub: null,
      route: `/matches/${match.id}`,
    };
  }

  /**
   * 파일 메시지의 저장 위치·이름을 돌려준다(Task 181 ③) — 메시지 목록과 **같은 열람 규칙**(입장한 활성 참여자 ·
   * 보이기 시작한 뒤의 메시지 · 차단 관계 제외 · 숨김/삭제 아님)을 통과해야 한다. 못 보면 404.
   */
  async messageFile(user: V1AuthUser, roomId: string, messageId: string) {
    const room = await this.ensureEntered(user.id, await this.getActiveParticipantRoom(user.id, roomId));
    const visibleFromAt = room.participants[0].visibleFromAt ?? new Date(0);
    const message = await this.prisma.v1ChatMessage.findFirst({
      where: { id: messageId, chatRoomId: roomId, messageType: 'file', status: 'sent', sentAt: { gte: visibleFromAt }, senderUser: chatVisibleUserWhere(user.id) },
      select: { attachmentAsset: { select: { kind: true, storagePath: true, originalName: true, mimeType: true } } },
    });
    const asset = message?.attachmentAsset;
    if (!asset || asset.kind !== 'file') throw new NotFoundException({ code: 'NOT_FOUND', message: '파일을 찾을 수 없어요.' });
    return { storagePath: asset.storagePath, name: asset.originalName ?? 'file', mimeType: asset.mimeType };
  }

  async sendMessage(user: V1AuthUser, roomId: string, dto: SendChatMessageDto) {
    const content = dto.content?.trim() ?? '';
    const imageUrl = dto.imageUrl?.trim() ?? '';
    const sentKinds = [content, imageUrl, dto.share, dto.fileId].filter(Boolean).length;
    if (sentKinds > 1) {
      throw validationError('send exactly one of content, imageUrl, share and fileId', dto.fileId ? 'fileId' : dto.share ? 'share' : 'imageUrl');
    }
    if (sentKinds === 0) throw validationError('content is required', 'content');
    const room = await this.getActiveParticipantRoom(user.id, roomId);
    if (room.teamContact) {
      const status = contactDisplayStatus(room.teamContact.status, room.teamContact.expiresAt);
      if (status !== 'accepted') throw stateConflict('수락한 뒤에 대화할 수 있어요.', 'TEAM_CONTACT_NOT_ACCEPTED');
    }
    if (room.status !== 'active') throw stateConflict('Chat room is not active');

    // 사진은 **보내는 사람이 올린 이미지 업로드**만 싣는다 — 남의 업로드나 임의 URL 을 채팅에 붙이지 못하게.
    const image = imageUrl
      ? await this.prisma.v1UploadAsset.findFirst({
          where: { url: imageUrl, ownerUserId: user.id, kind: 'image' },
          select: { id: true, url: true },
        })
      : null;
    if (imageUrl && !image) throw validationError('사진을 찾을 수 없어요. 다시 올려 주세요.', 'imageUrl');
    // 파일은 **보내는 사람이 올린 file 업로드**만 — 남의 파일을 채팅에 붙이지 못하게.
    const file = dto.fileId
      ? await this.prisma.v1UploadAsset.findFirst({
          where: { id: dto.fileId, ownerUserId: user.id, kind: 'file' },
          select: { id: true, originalName: true, byteSize: true, mimeType: true },
        })
      : null;
    if (dto.fileId && !file) throw validationError('파일을 찾을 수 없어요. 다시 올려 주세요.', 'fileId');
    const fileName = file?.originalName ?? '파일';
    // 공유 카드는 보내는 사람이 볼 수 있는 일정·매치만 — 못 보는 걸 카드로 퍼 나르지 못하게. 보낼 때 스냅숏한다.
    const shareCard = dto.share ? await this.resolveShareCard(user.id, dto.share) : null;
    const shareLabel = shareCard ? CHAT_SHARE_LABEL[shareCard.kind] : null;
    // 사진·공유 메시지의 body 는 읽을 수 있는 대체 문구 — 목록 미리보기·신고 스냅샷·body 만 읽는 옛 경로가 그대로 읽힌다.
    const body = image ? '사진' : file ? `[파일] ${fileName}` : shareCard ? `[${shareLabel}] ${shareCard.title}` : content;
    const notificationText = image
      ? '사진을 보냈어요'
      : file
        ? `파일을 보냈어요 · ${fileName}`.slice(0, 120)
        : shareCard
        ? `${shareLabel}${shareCard.kind === 'team_schedule' ? '을' : '를'} 공유했어요 · ${shareCard.title}`.slice(0, 120)
        : content.slice(0, 120);

    const { message, recipientUserIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1ChatMessage.create({
        data: image
          ? { chatRoomId: room.id, senderUserId: user.id, body, status: 'sent', messageType: 'image', attachmentAssetId: image.id }
          : file
            ? { chatRoomId: room.id, senderUserId: user.id, body, status: 'sent', messageType: 'file', attachmentAssetId: file.id }
            : shareCard
            ? { chatRoomId: room.id, senderUserId: user.id, body, status: 'sent', messageType: 'share', shareCard }
            : { chatRoomId: room.id, senderUserId: user.id, body, status: 'sent' },
      });
      await tx.v1ChatRoom.update({
        where: { id: room.id },
        data: { lastMessageAt: created.sentAt },
      });
      return { message: created, recipientUserIds: await this.messageRecipientIds(tx, room, user.id) };
    });

    const chatMessagePayload = {
      messageId: message.id,
      roomId: room.id,
      messageType: message.messageType,
      content: message.body,
      imageUrl: image?.url ?? null,
      shareCard,
      file: file ? { name: fileName, size: Number(file.byteSize), mimeType: file.mimeType } : null,
      status: message.status,
      sentAt: message.sentAt,
      senderUserId: user.id,
    };
    // 메시지는 이미 위 트랜잭션에서 커밋됐다. 선호도 조회나 알림 부가 작업 실패가
    // 성공한 채팅 전송을 500으로 되돌리면 안 되므로 알림만 건너뛴다.
    let notificationEnabledRecipientIds: Set<string>;
    try {
      notificationEnabledRecipientIds = await this.chatNotificationEnabledRecipientIds(recipientUserIds);
    } catch (err) {
      this.logger.warn(
        { roomId: room.id, err },
        '채팅 알림 선호도 조회 실패 — 이 메시지는 알림함과 푸시 없이 처리됩니다',
      );
      notificationEnabledRecipientIds = new Set();
    }
    const roomTitle = getRoomTitle(room);
    if (notificationEnabledRecipientIds.size > 0) {
      try {
        await this.prisma.v1Notification.createMany({
          data: [...notificationEnabledRecipientIds].map((recipientUserId) => ({
            recipientUserId,
            targetType: 'chat',
            targetId: room.id,
            title: roomTitle,
            body: notificationText,
            deepLink: `/chat/${room.id}`,
          })),
        });
      } catch (err) {
        this.logger.warn({ roomId: room.id, err }, '채팅 알림함 저장 실패');
      }
    }
    // Fire-and-forget, matching NotificationsService's emitNotificationFireAndForget:
    // the message and any notification rows are settled above, so realtime or push
    // delivery failures must never surface as an error for a successful send.
    for (const recipientUserId of recipientUserIds) {
      try {
        this.realtimeGateway.emitToUser(recipientUserId, 'chat:message', chatMessagePayload);
        if (notificationEnabledRecipientIds.has(recipientUserId)) {
          this.realtimeGateway.emitToUser(recipientUserId, 'notification:new', {
            targetType: 'chat',
            targetId: room.id,
          });
        }
      } catch (err) {
        this.logger.warn({ recipientUserId, roomId: room.id, err }, '실시간 채팅 알림 전송 실패');
      }
      if (!notificationEnabledRecipientIds.has(recipientUserId)) continue;
      void this.webPushService
        .sendToUser(recipientUserId, {
          title: roomTitle,
          body: notificationText,
          url: `/chat/${room.id}`,
        })
        .catch((err) => {
          this.logger.warn({ recipientUserId, roomId: room.id, err }, '채팅 웹 푸시 발송 실패');
        });
    }

    return chatMessagePayload;
  }

  /** 보낸 사람의 메시지를 실시간으로 받을 참여자 — 텍스트 메시지와 시스템 줄이 같은 규칙을 쓴다. */
  private async messageRecipientIds(db: Prisma.TransactionClient, room: ChatRecipientRoom, senderUserId: string): Promise<string[]> {
    const recipients = await db.v1ChatRoomParticipant.findMany({
      where: {
        chatRoomId: room.id,
        status: 'active',
        userId: { not: senderUserId },
        OR: [{ mutedUntil: null }, { mutedUntil: { lte: new Date() } }],
        AND: [currentChatRecipientEntitlementWhere(room)],
        user: chatVisibleUserWhere(senderUserId),
      },
      select: { userId: true },
    });
    return recipients.map((participant) => participant.userId);
  }

  /**
   * 시스템 줄을 호출자 트랜잭션 안에서 저장한다 — 멤버십·컨택 상태 변경과 함께 커밋되거나 함께 롤백된다.
   * 커밋 뒤 반환값을 deliverSystemLine 에 넘겨야 방에 실시간으로 뜬다. 내보내기도 'left'(나갔어요)로 쓴다:
   * 팀 채팅은 팀원 모두가 보므로 누가 내보냈는지를 드러내지 않는다(Task 180 H1-left).
   */
  async recordSystemLine(tx: Prisma.TransactionClient, input: ChatSystemLineInput): Promise<ChatSystemLine> {
    let body: string;
    if (input.event === null) {
      body = input.body;
    } else {
      const displayName = input.displayName ?? (await systemLineDisplayName(tx, input.userId));
      body = input.event === 'joined' ? `${displayName}님이 들어왔어요` : `${displayName}님이 나갔어요`;
    }
    const message = await tx.v1ChatMessage.create({
      data: {
        chatRoomId: input.chatRoomId,
        senderUserId: input.userId,
        body,
        status: 'sent',
        messageType: 'system',
        systemEventType: input.event,
        sentAt: input.at,
      },
      select: { id: true, body: true, sentAt: true },
    });
    if (input.backdated) {
      // 지난 시각(참가 승인 시각)에 남기는 줄은 방 목록 정렬을 되돌리지 않게 더 늦을 때만 민다.
      await tx.v1ChatRoom.updateMany({
        where: { id: input.chatRoomId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: message.sentAt } }] },
        data: { lastMessageAt: message.sentAt },
      });
    } else {
      await tx.v1ChatRoom.update({ where: { id: input.chatRoomId }, data: { lastMessageAt: message.sentAt } });
    }
    return {
      messageId: message.id,
      roomId: input.chatRoomId,
      content: message.body,
      status: 'sent',
      sentAt: message.sentAt,
      senderUserId: input.userId,
      messageType: 'system',
      systemEventType: input.event,
    };
  }

  /**
   * 개인매치 참가 승인 — 매치 채팅방을 만들거나 찾아, 승인된 참가자를 **승인 시각부터** 보이게 등록한다.
   * 주최자도 방 생성 시각부터 보이게 함께 등록한다(처음 승인될 때 방이 생긴다). 그래서 둘 다 방을 늦게
   * 열어도 그 사이 메시지가 보이고, 채팅 목록·알림도 승인 순간부터 받는다. 호출자 트랜잭션 안에서 돌고,
   * 커밋 뒤 반환된 '들어왔어요' 줄을 deliverSystemLine 으로 알린다.
   */
  async joinMatchChatOnApproval(
    tx: Prisma.TransactionClient,
    input: { matchId: string; hostUserId: string; userId: string; approvedAt: Date },
  ): Promise<ChatSystemLine> {
    const room = await tx.v1ChatRoom.upsert({
      where: { matchId: input.matchId },
      update: {},
      // 방 생성 시각 = 승인 시각 — 주최자(방 생성 시각부터)가 첫 참가자의 '들어왔어요'(승인 시각)를 몇 ms 차이로 놓치지 않게.
      create: { matchId: input.matchId, status: 'active', createdAt: input.approvedAt },
      select: { id: true, createdAt: true },
    });
    await this.pullMatchChatHost(tx, room.id, input.hostUserId, room.createdAt);
    // 승인은 늘 새 참여다(참가 중엔 다시 신청할 수 없다). 예전 참여의 행이 남아 있어도 이번 승인 시각부터
    // 다시 본다 — 취소돼 있던 동안의 대화가 재승인 뒤에 보이면 안 된다(#1427 리뷰).
    await tx.v1ChatRoomParticipant.upsert({
      where: { chatRoomId_userId: { chatRoomId: room.id, userId: input.userId } },
      update: { status: 'active', leftAt: null, lastReadMessageId: null, visibleFromAt: input.approvedAt },
      create: { chatRoomId: room.id, userId: input.userId, status: 'active', visibleFromAt: input.approvedAt },
    });
    return this.recordSystemLine(tx, { chatRoomId: room.id, userId: input.userId, event: 'joined', at: input.approvedAt });
  }

  /** 주최자를 방 생성 시각부터 보이게 둔다(이미 더 이르면 그대로). 스스로 나간 방엔 다시 넣지 않는다 — 매치 상세에서 다시 열면 돌아온다. */
  private async pullMatchChatHost(tx: Prisma.TransactionClient, chatRoomId: string, userId: string, from: Date) {
    const existing = await tx.v1ChatRoomParticipant.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId } },
      select: { id: true, status: true, visibleFromAt: true },
    });
    if (!existing) {
      await tx.v1ChatRoomParticipant.create({ data: { chatRoomId, userId, status: 'active', visibleFromAt: from } });
    } else if (existing.status === 'active' && (!existing.visibleFromAt || existing.visibleFromAt > from)) {
      await tx.v1ChatRoomParticipant.update({ where: { id: existing.id }, data: { visibleFromAt: from } });
    }
  }

  /** 커밋된 시스템 줄을 방 참여자에게 chat:message 로 알린다. 알림함·푸시는 없고, 실패해도 던지지 않는다. */
  async deliverSystemLine(line: ChatSystemLine): Promise<void> {
    try {
      const room = await this.prisma.v1ChatRoom.findUnique({ where: { id: line.roomId }, select: RECIPIENT_ROOM_SELECT });
      if (!room) return;
      for (const recipientUserId of await this.messageRecipientIds(this.prisma, room, line.senderUserId)) {
        this.realtimeGateway.emitToUser(recipientUserId, 'chat:message', line);
      }
    } catch (err) {
      this.logger.warn({ roomId: line.roomId, messageId: line.messageId, err }, '채팅 시스템 줄 실시간 전달 실패');
    }
  }

  /**
   * Recipients with chatEnabled=false are excluded from both the notification inbox
   * and push. The chat message realtime event still reaches them while the room is open.
   * No preference row means enabled, matching NotificationsService.
   */
  private async chatNotificationEnabledRecipientIds(recipientUserIds: string[]): Promise<Set<string>> {
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

  private async resolveTeamContactRoom(userId: string, teamContactId: string) {
    const existing = await this.prisma.v1ChatRoom.findUnique({ where: { teamContactId } });
    const room = existing ?? (await this.prisma.v1ChatRoom.create({ data: { teamContactId, status: 'active' } }));
    // ensureResolvedParticipant 대신 컨택 전용 분기를 둔다: 나중에 운영진이 된 사람이
    // 들어와도 요청 메시지부터 전부 보여야 한다(§3.3). ensureResolvedParticipant 는
    // visibleFromAt: null(입장 시점부터만 표시)을 쓰는 다른 방 종류에 그대로 남긴다.
    const participant = await this.prisma.v1ChatRoomParticipant.findUnique({
      where: { chatRoomId_userId: { chatRoomId: room.id, userId } },
    });
    if (!participant) {
      await this.prisma.v1ChatRoomParticipant.create({
        data: { chatRoomId: room.id, userId, status: 'active', visibleFromAt: room.createdAt },
      });
    } else if (participant.status === 'left') {
      await this.prisma.v1ChatRoomParticipant.update({
        where: { id: participant.id },
        data: { status: 'active', leftAt: null, lastReadMessageId: null, visibleFromAt: room.createdAt },
      });
    } else if (!participant.visibleFromAt || participant.visibleFromAt > room.createdAt) {
      // 이미 active 인데 열람 경계가 비어 있거나(옛 ensureResolvedParticipant 경로) 방 생성
      // 시각보다 늦으면 같은 불변식으로 당긴다 — 백필 뒤엔 거의 없지만, 있으면 요청 메시지가
      // 안 보이고 미읽음이 0 으로 잡히는 조용한 결함이 된다(PR #977 Copilot 지적).
      await this.prisma.v1ChatRoomParticipant.update({
        where: { id: participant.id },
        data: { visibleFromAt: room.createdAt },
      });
    }
    return { roomId: room.id, roomType: 'team_contact', created: !existing, route: chatRoomRoute(room.id) };
  }

  private async assertCanUseMatchChat(userId: string, matchId: string) {
    const match = await this.prisma.v1Match.findFirst({
      where: { id: matchId, deletedAt: null },
      select: {
        hostUserId: true,
        participants: {
          where: { status: { in: ['active', 'completed'] } },
          select: { userId: true, role: true },
        },
      },
    });
    if (!match) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Match was not found' });
    }

    const isHost = match.hostUserId === userId;
    const hasConfirmedParticipant = match.participants.some((participant) => participant.role === 'participant');
    if (isHost && !hasConfirmedParticipant) {
      throw new ConflictException({
        code: 'MATCH_CHAT_PARTICIPANTS_REQUIRED',
        message: '아직 참여자가 없어 채팅을 시작할 수 없어요. 신청자를 승인한 뒤 이용해 주세요.',
      });
    }
    if (isHost || match.participants.some((participant) => participant.userId === userId)) return;

    throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Match chat requires confirmed participation' });
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
    // chat-entitlement.ts currentChatEntitlementWhere와 같은 이유로 completed도 허용한다:
    // 결과 제출로 status가 matched→completed 로 넘어가는 순간이 채팅 봉쇄 시점이 되면 안 된다
    // (경기 종료 뒤에도 두 팀장이 대화를 이어갈 수 있어야 한다). cancelled/expired/pre-match는
    // 여전히 배제된다.
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, status: { in: ['matched', 'completed'] }, deletedAt: null },
      select: { hostTeamId: true, approvedApplicantTeamId: true },
    });
    if (!teamMatch?.hostTeamId || !teamMatch.approvedApplicantTeamId) throw stateConflict('Team match chat is available after both teams are assigned');
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

  private async assertCanUseTeamContactChat(userId: string, teamContactId: string) {
    // status 로 좁히지 않는다 — 요청 중·거절·철회·만료된 컨택 방도 양 팀 운영진은
    // 열람할 수 있어야 한다("팀 컨택의 채팅 흡수" §3.6). 전송 가능 여부는
    // sendMessage 의 TEAM_CONTACT_NOT_ACCEPTED 게이트가 따로 맡는다.
    const contact = await this.prisma.v1TeamContact.findFirst({
      where: { id: teamContactId },
      select: { fromTeamId: true, toTeamId: true },
    });
    if (!contact) throw new NotFoundException({ code: 'TEAM_CONTACT_NOT_FOUND', message: '컨택을 찾을 수 없어요.' });
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        userId, status: 'active',
        role: { in: ['owner', 'manager'] },
        teamId: { in: [contact.fromTeamId, contact.toTeamId] },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장·매니저만 컨택 대화에 참여할 수 있어요.',
      });
    }
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
    room: {
      matchId: string | null;
      teamId: string | null;
      teamMatchId: string | null;
      teamContactId: string | null;
    },
  ) {
    if (room.matchId) return this.assertCanUseMatchChat(userId, room.matchId);
    if (room.teamId) return this.assertCanUseTeamChat(userId, room.teamId);
    if (room.teamMatchId) return this.assertCanUseTeamMatchChat(userId, room.teamMatchId);
    if (room.teamContactId) return this.assertCanUseTeamContactChat(userId, room.teamContactId);
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
    // 팀매치 방은 참가자 전원이 방 생성 시각부터 본다(팀 컨택 방과 같은 불변식) — 상대 팀장이 먼저
    // 보낸 메시지를 나중에 들어온 사람이 못 보면 안 된다. 개인매치 방은 참가 승인 시각부터(주최자는
    // 방 생성 시각부터) 본다 — 승인 뒤 방을 늦게 열어도 그 사이 메시지가 보여야 한다. 다른 방은 입장
    // 시점부터만 보인다.
    const matchHistory = room.matchId ? await this.matchChatHistory(room.matchId, room.createdAt, userId) : null;
    const sharedHistoryFrom = room.teamMatchId ? room.createdAt : (matchHistory?.from ?? null);
    if (participant.visibleFromAt) {
      if (sharedHistoryFrom && participant.visibleFromAt > sharedHistoryFrom) {
        // 이 규칙 이전에 입장 시각으로 잡힌 참가자 — 백필 없이 접근 시점에 당긴다.
        await this.prisma.v1ChatRoomParticipant.updateMany({
          where: { id: participant.id, visibleFromAt: { gt: sharedHistoryFrom } },
          data: { visibleFromAt: sharedHistoryFrom },
        });
        participant.visibleFromAt = sharedHistoryFrom;
      }
      return room;
    }

    const enteredAt = new Date();
    const visibleFromAt = sharedHistoryFrom ?? enteredAt;
    // 개인매치의 '들어왔어요'는 방을 처음 연 때가 아니라 참가 승인 순간이다. 승인 때 등록되기 전(#1427 이전)에 승인된
    // 참가자도 승인 시각(방이 그보다 늦게 생겼으면 방 생성 시각)에 남긴다. 주최자는 승인이 없어 남기지 않는다.
    const joinedAt = room.matchId ? (matchHistory?.joinedAt ?? null) : enteredAt;
    const displayName = participant.user.profile?.nickname ?? participant.user.profile?.displayName ?? '참여자';
    const joinedLine = await this.prisma.$transaction(async (tx) => {
      const entered = await tx.v1ChatRoomParticipant.updateMany({
        where: { id: participant.id, visibleFromAt: null },
        data: { visibleFromAt },
      });
      if (entered.count === 0 || !joinedAt) return null;
      // 이미 '들어왔어요'가 있으면(방을 나갔다 다시 연 경우) 승인 시각에 또 남기지 않고 지금 남긴다.
      const at = joinedAt === enteredAt
        || (await tx.v1ChatMessage.count({ where: { chatRoomId: room.id, senderUserId: userId, systemEventType: 'joined' } })) === 0
        ? joinedAt
        : enteredAt;
      return this.recordSystemLine(tx, { chatRoomId: room.id, userId, event: 'joined', at, displayName, backdated: at !== enteredAt });
    });
    // 지난 시각에 남긴 줄은 실시간으로 밀어 넣지 않는다 — 열려 있는 방의 맨 아래에 붙어 순서가 어긋난다.
    if (joinedLine && joinedLine.sentAt.getTime() === enteredAt.getTime()) void this.deliverSystemLine(joinedLine);

    const current = await this.prisma.v1ChatRoomParticipant.findUnique({
      where: { id: participant.id },
      select: { visibleFromAt: true },
    });
    participant.visibleFromAt = current?.visibleFromAt ?? visibleFromAt;
    return room;
  }

  /**
   * 개인매치 방의 열람 시작(from)과 '들어왔어요' 시각(joinedAt) — 주최자는 방 생성 시각부터 보고 입장 줄은 없다.
   * 확정 참가자는 참가 승인 시각부터 보고, 입장 줄도 승인 시각(방이 더 늦게 생겼으면 방 생성 시각)이다. 승인 때
   * 등록되기 전(이 규칙 이전)에 승인된 참가자도 열람 경계가 비었거나 입장 시각으로 늦게 잡혀 있을 수 있어 여기서 당긴다.
   */
  private async matchChatHistory(
    matchId: string,
    roomCreatedAt: Date,
    userId: string,
  ): Promise<{ from: Date | null; joinedAt: Date | null }> {
    const match = await this.prisma.v1Match.findUnique({
      where: { id: matchId },
      select: {
        hostUserId: true,
        participants: { where: { userId, status: { in: ['active', 'completed'] } }, select: { approvedAt: true } },
      },
    });
    if (!match) return { from: null, joinedAt: null };
    if (match.hostUserId === userId) return { from: roomCreatedAt, joinedAt: null };
    const approvedAt = match.participants[0]?.approvedAt ?? null;
    return { from: approvedAt, joinedAt: approvedAt && (approvedAt > roomCreatedAt ? approvedAt : roomCreatedAt) };
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
      user?: {
        chatBlocksMade: Array<{ blockedUserId: string }>;
        chatBlocksReceived: Array<{ blockerUserId: string }>;
      };
    }>,
  ) {
    // 입장·퇴장 같은 system 만 뺀다 — 사진도 읽어야 할 메시지다.
    if (message.messageType === 'system') return 0;
    return participants.filter((participant) => {
      if (participant.userId === message.senderUserId) return false;
      if (participant.user?.chatBlocksMade.some((block) => block.blockedUserId === message.senderUserId)
        || participant.user?.chatBlocksReceived.some((block) => block.blockerUserId === message.senderUserId)) return false;
      if (!participant.visibleFromAt || participant.visibleFromAt > message.sentAt) return false;
      return !participant.lastReadMessage || participant.lastReadMessage.sentAt < message.sentAt;
    }).length;
  }

  private roomInclude(userId: string) {
    return {
      match: { select: { id: true, title: true } },
      team: { select: { id: true, name: true } },
      teamMatch: { select: { id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true } },
      teamContact: {
        select: {
          id: true,
          fromTeamId: true,
          toTeamId: true,
          status: true,
          expiresAt: true,
          declineReason: true,
          fromTeam: { select: { id: true, name: true } },
          // 호출자의 받는 팀 운영진 여부(mySide)를 방마다 따로 묻지 않고 같은 조회에 싣는다 —
          // 목록 50개 기준 +50 왕복이 나던 N+1 을 없앤다(PR #977 Copilot 지적).
          toTeam: {
            select: {
              id: true,
              name: true,
              memberships: {
                where: { userId, status: 'active', role: { in: ['owner', 'manager'] } },
                select: { id: true },
              },
            },
          },
        },
      },
      participants: {
        include: {
          user: { select: { id: true, profile: { select: { nickname: true, displayName: true, profileImageUrl: true } } } },
        },
      },
      messages: { where: { senderUser: chatVisibleUserWhere(userId) }, orderBy: { sentAt: 'desc' }, take: 1 },
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
        messageType: { not: 'system' },
        senderUserId: { not: userId },
        senderUser: chatVisibleUserWhere(userId),
        ...(visibleFromAt ? { sentAt: { gte: visibleFromAt, ...(lastReadMessage ? { gt: lastReadMessage.sentAt } : {}) } } : { id: '__never__' }),
      },
    });
    const teamContact = this.toTeamContactBlock(room);
    return {
      roomId: room.id,
      roomType: getRoomType(room),
      title: getRoomTitle(room),
      status: room.status,
      linkedTarget: getLinkedTarget(room, counterpartTeamId(teamContact)),
      teamContact,
      lastMessage: lastMessage
        ? { messageId: lastMessage.id, contentPreview: lastMessage.body.slice(0, 80), sentAt: lastMessage.sentAt }
        : null,
      unreadCount,
      pinned: Boolean(me?.pinnedAt),
      muted: Boolean(me?.mutedUntil && me.mutedUntil.getTime() > Date.now()),
    };
  }

  /**
   * 컨택 방의 상태 블록("팀 컨택의 채팅 흡수" §5). 컨택 방이 아니면 null.
   * mySide 는 받는 팀 운영진이면 'to' — 양쪽 다 운영하는 경우 받는 쪽 액션(수락/거절)이
   * 더 중요하므로 'to' 를 우선한다.
   */
  private toTeamContactBlock(room: RoomWithRelations) {
    const contact = room.teamContact;
    if (!contact) return null;
    // roomInclude 가 호출자 기준으로 좁혀 실어 준 받는 팀 운영진 멤버십(0 또는 1건).
    const toMembership = contact.toTeam.memberships.length > 0;
    return {
      contactId: contact.id,
      status: contactDisplayStatus(contact.status, contact.expiresAt),
      expiresAt: contact.expiresAt,
      declineReason: contact.declineReason,
      mySide: toMembership ? ('to' as const) : ('from' as const),
      fromTeam: contact.fromTeam,
      toTeam: { id: contact.toTeam.id, name: contact.toTeam.name },
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

export function getRoomType(room: {
  matchId: string | null;
  teamId: string | null;
  teamMatchId: string | null;
  teamContactId: string | null;
}) {
  if (room.matchId) return 'match';
  if (room.teamId) return 'team';
  if (room.teamContactId) return 'team_contact';
  return 'team_match';
}

export function getRoomTitle(room: {
  match: { title: string } | null;
  team: { name: string } | null;
  teamMatch: { title: string } | null;
  teamContact: { fromTeam: { name: string }; toTeam: { name: string } } | null;
}) {
  const contactTitle = room.teamContact
    ? `${room.teamContact.fromTeam.name} ↔ ${room.teamContact.toTeam.name}`
    : null;
  return room.match?.title ?? room.team?.name ?? room.teamMatch?.title ?? contactTitle ?? '채팅';
}

/**
 * 컨택 방의 링크는 **상대 팀** 으로 간다(컨택 상세 화면은 채팅방으로 흡수돼 없어졌다).
 * counterpartTeamId 는 호출자의 mySide 로 정해지므로 호출자 문맥이 있는 쪽이 넘긴다;
 * 없으면 받는 팀(toTeam)을 상대로 본다.
 */
export function getLinkedTarget(
  room: {
    matchId: string | null;
    teamId: string | null;
    teamMatchId: string | null;
    teamContactId: string | null;
    match: { id: string; title: string } | null;
    team: { id: string; name: string } | null;
    teamMatch: { id: string; title: string } | null;
    teamContact: { id: string; fromTeam: { id: string; name: string }; toTeam: { id: string; name: string } } | null;
  },
  counterpartTeamId?: string | null,
) {
  if (room.match) return { type: 'match', id: room.match.id, title: room.match.title, route: `/matches/${room.match.id}` };
  if (room.team) return { type: 'team', id: room.team.id, title: room.team.name, route: `/teams/${room.team.id}` };
  if (room.teamMatch) return { type: 'team_match', id: room.teamMatch.id, title: room.teamMatch.title, route: `/team-matches/${room.teamMatch.id}` };
  if (room.teamContact) {
    const counterpart =
      counterpartTeamId === room.teamContact.fromTeam.id ? room.teamContact.fromTeam : room.teamContact.toTeam;
    return {
      type: 'team_contact',
      id: room.teamContact.id,
      title: counterpart.name,
      route: `/teams/${counterpart.id}`,
    };
  }
  return { type: null, id: null, title: '채팅', route: null };
}

/** 컨택 표시 상태 — requested 인데 만료 시각이 지났으면 expired 로 본다(DB 는 lazy-flip). */
export function contactDisplayStatus(status: string, expiresAt: Date) {
  return status === 'requested' && expiresAt <= new Date() ? 'expired' : status;
}

/** mySide 기준 상대 팀 id. 컨택 방이 아니면 null. */
function counterpartTeamId(block: { mySide: 'from' | 'to'; fromTeam: { id: string }; toTeam: { id: string } } | null) {
  if (!block) return null;
  return block.mySide === 'to' ? block.fromTeam.id : block.toTeam.id;
}

/** 공유 카드 스냅숏(`V1ChatMessage.shareCard`). */
export type ChatShareCard = {
  kind: ChatShareKind;
  targetId: string;
  title: string;
  startAt: string | null;
  place: string | null;
  sub: string | null;
  route: string;
};

const CHAT_SHARE_LABEL: Record<ChatShareKind, string> = { team_schedule: '일정', match: '매치' };

/** DB JSON 을 카드 모양으로 — 모양이 어긋난 행은 카드 없이(null) 내보낸다(본문 대체 문구는 그대로 보인다). */
export function parseShareCard(value: Prisma.JsonValue | null): ChatShareCard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const card = value as Record<string, unknown>;
  const text = (key: string) => (typeof card[key] === 'string' ? (card[key] as string) : null);
  const kind = text('kind');
  const targetId = text('targetId');
  const title = text('title');
  const route = text('route');
  if (!kind || !(CHAT_SHARE_KINDS as readonly string[]).includes(kind) || !targetId || !title || !route?.startsWith('/')) return null;
  return { kind: kind as ChatShareKind, targetId, title, startAt: text('startAt'), place: text('place'), sub: text('sub'), route };
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

async function systemLineDisplayName(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const user = await tx.v1User.findUnique({
    where: { id: userId },
    select: { profile: { select: { nickname: true, displayName: true } } },
  });
  return user?.profile?.nickname ?? user?.profile?.displayName ?? '참여자';
}

/** A block is bilateral within chat, including list previews and delivery recipients. */
export function chatVisibleUserWhere(userId: string): Prisma.V1UserWhereInput {
  return {
    chatBlocksMade: { none: { blockedUserId: userId } },
    chatBlocksReceived: { none: { blockerUserId: userId } },
  };
}
