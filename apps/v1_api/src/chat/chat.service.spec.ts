/**
 * chat.service.spec.ts
 *
 * Real contract tests for ChatService:
 *   - 비-참가자(non-participant) send/read → 403 PERMISSION_DENIED
 *   - 이미 나간(left) 참가자 sendMessage → 403 PERMISSION_DENIED
 *   - 비활성 채팅방에 메시지 전송 → 409 STATE_CONFLICT
 *   - sendMessage: 공백-only content → 400 VALIDATION_FAILED
 *   - sendMessage: 정상 전송 후 v1ChatRoom.lastMessageAt 업데이트 + 알림 생성
 *   - leave: 이미 나간 참가자 재퇴장 시도 → 409 ALREADY_PROCESSED (멱등성)
 *   - resolve(match): 채팅방 없을 때 새로 생성(created=true), 두 번 호출 시 created=false
 *   - assertCanUseMatchChat: 비-참가자 → 403
 *
 * Each test asserts REAL behavior (error codes, return shapes, side-effect calls).
 * No test merely verifies that a mock returned what we told it to return.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService, parseShareCard } from './chat.service';

// ─── shared test fixtures ──────────────────────────────────────────────────────

const userA = { id: 'user-a', email: 'a@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const userB = { id: 'user-b', email: 'b@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

/** Minimal V1ChatRoom row that roomInclude() expands. */
function makeRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: 'room-1',
    matchId: 'match-1',
    teamId: null,
    teamMatchId: null,
    status: 'active',
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    match: { id: 'match-1', title: '테스트 매치' },
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
        visibleFromAt: new Date('1970-01-01T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: userA.id, profile: { nickname: 'A닉', displayName: null, profileImageUrl: null } },
      },
    ],
    messages: [],
    ...overrides,
  };
}

/** Participant row inside getRoomParticipant (participants filtered by userId). */
function makeRoomForParticipant(userId: string, participantStatus = 'active', roomStatus = 'active') {
  return {
    ...makeRoom({ status: roomStatus }),
    participants: [
      {
        id: `participant-${userId}`,
        chatRoomId: 'room-1',
        userId,
        status: participantStatus,
        pinnedAt: null,
        mutedUntil: null,
        leftAt: null,
        lastReadMessageId: null,
        visibleFromAt: new Date('1970-01-01T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: userId, profile: { nickname: '닉네임', displayName: null, profileImageUrl: null } },
      },
    ],
  };
}

/** Room with sender userA + two other active recipients (user-2, user-3), for push/notification fan-out tests. */
function roomWithTwoRecipients() {
  return {
    ...makeRoom(),
    participants: [
      { id: 'part-a', chatRoomId: 'room-1', userId: userA.id, status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userA.id, profile: { nickname: 'A', displayName: null, profileImageUrl: null } } },
      { id: 'part-b', chatRoomId: 'room-1', userId: 'user-2', status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: 'user-2', profile: { nickname: 'B', displayName: null, profileImageUrl: null } } },
      { id: 'part-c', chatRoomId: 'room-1', userId: 'user-3', status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: 'user-3', profile: { nickname: 'C', displayName: null, profileImageUrl: null } } },
    ],
  };
}

// ─── test suite ────────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;
  const realtimeGateway = { emitToUser: jest.fn() };
  let prisma: {
    v1ChatRoom: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    v1ChatMessage: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
    v1ChatRoomParticipant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    v1Notification: { createMany: jest.Mock };
    v1NotificationPreference: { findMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1Match: { findFirst: jest.Mock };
    v1MatchParticipant: { findFirst: jest.Mock };
    v1TeamMembership: { findFirst: jest.Mock };
    v1TeamMatch: { findFirst: jest.Mock };
    v1UploadAsset: { findFirst: jest.Mock };
    v1TeamSchedule: { findFirst: jest.Mock };
    v1Team: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

  beforeEach(async () => {
    prisma = {
      v1ChatRoom: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      v1ChatMessage: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      v1ChatRoomParticipant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      v1Notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1NotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      v1Match: {
        findFirst: jest.fn().mockResolvedValue({
          hostUserId: 'host-user',
          participants: [{ userId: userA.id, role: 'participant' }],
        }),
      },
      v1MatchParticipant: { findFirst: jest.fn() },
      v1TeamMembership: { findFirst: jest.fn() },
      v1TeamMatch: { findFirst: jest.fn() },
      v1UploadAsset: { findFirst: jest.fn() },
      v1TeamSchedule: { findFirst: jest.fn() },
      v1Team: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    // Default $transaction: pass-through (runs the callback with the same prisma stub)
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: WebPushService, useValue: webPushService },
        { provide: getLoggerToken(ChatService.name), useValue: logger },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. 비-참가자는 메시지 전송 불가 ─────────────────────────────────────────

  it('sendMessage: 채팅방에 참가하지 않은 사용자 → 403 PERMISSION_DENIED', async () => {
    // getRoomParticipant returns a room, but participants array is empty (user B is not a participant)
    prisma.v1ChatRoom.findFirst.mockResolvedValue({
      ...makeRoom(),
      participants: [], // userB is not in this room
    });

    await expect(service.sendMessage(userB, 'room-1', { content: '안녕하세요' })).rejects.toThrow(ForbiddenException);

    // No message should be created
    expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
  });

  // ─── 2. 이미 나간 참가자는 메시지 전송 불가 ────────────────────────────────────

  it('sendMessage: status=left 참가자 → 403 PERMISSION_DENIED (getActiveParticipantRoom 거부)', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoomForParticipant(userA.id, 'left'));

    await expect(service.sendMessage(userA, 'room-1', { content: '테스트' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
  });

  it('sendMessage: 채팅 참가 행이 active여도 현재 매치 참가 자격이 없으면 403', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoomForParticipant(userA.id));
    prisma.v1Match.findFirst.mockResolvedValue({ hostUserId: 'host-user', participants: [] });

    await expect(service.sendMessage(userA, 'room-1', { content: '권한이 끝난 뒤 메시지' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
  });

  // ─── 3. 비활성 채팅방에 메시지 전송 → 409 STATE_CONFLICT ─────────────────────

  it('sendMessage: room.status=archived → 409 STATE_CONFLICT', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoomForParticipant(userA.id, 'active', 'archived'));

    await expect(service.sendMessage(userA, 'room-1', { content: '메시지' })).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
    expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
  });

  // ─── 4. 공백-only content → 400 VALIDATION_FAILED ───────────────────────────

  it('sendMessage: 공백만 있는 content → 400 VALIDATION_FAILED', async () => {
    // No DB calls should happen — guard fires before room lookup
    await expect(service.sendMessage(userA, 'room-1', { content: '   ' })).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', details: { field: 'content' } },
    });
    await expect(service.sendMessage(userA, 'room-1', { content: '   ' })).rejects.toThrow(BadRequestException);
    expect(prisma.v1ChatRoom.findFirst).not.toHaveBeenCalled();
  });

  // ─── 5. 정상 전송: lastMessageAt 업데이트 + 알림 생성 ─────────────────────────

  it('sendMessage: 정상 전송 시 lastMessageAt 업데이트 + 수신자 알림 생성', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-1', chatRoomId: 'room-1', senderUserId: userA.id, body: '안녕하세요', status: 'sent', sentAt };

    // Room has two active participants: userA (sender) and userB (recipient)
    const roomWithTwoParticipants = {
      ...makeRoom(),
      participants: [
        { id: 'part-a', chatRoomId: 'room-1', userId: userA.id, status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userA.id, profile: { nickname: 'A', displayName: null, profileImageUrl: null } } },
        { id: 'part-b', chatRoomId: 'room-1', userId: userB.id, status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userB.id, profile: { nickname: 'B', displayName: null, profileImageUrl: null } } },
      ],
    };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithTwoParticipants);
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: userB.id }]); // recipients (not sender)
    prisma.v1Notification.createMany.mockResolvedValue({ count: 1 });

    const result = await service.sendMessage(userA, 'room-1', { content: '안녕하세요' });

    // Return shape must include messageId, roomId, content, status, sentAt
    expect(result).toMatchObject({ messageId: 'msg-1', roomId: 'room-1', content: '안녕하세요', status: 'sent' });

    // lastMessageAt must be updated on the room
    expect(prisma.v1ChatRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastMessageAt: sentAt }) }),
    );

    // Notification must be created for the OTHER participant (userB), not the sender
    expect(prisma.v1Notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ recipientUserId: userB.id, targetType: 'chat', targetId: 'room-1' }),
        ]),
      }),
    );
  });

  describe('sendMessage: 사진 (Task 181)', () => {
    const roomWithRecipient = () => ({
      ...makeRoom(),
      participants: [
        { id: 'part-a', chatRoomId: 'room-1', userId: userA.id, status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userA.id, profile: { nickname: 'A', displayName: null, profileImageUrl: null } } },
      ],
    });

    it('자기 이미지 업로드면 image 메시지로 저장하고, 미리보기 body 는 "사진"·알림은 "사진을 보냈어요"', async () => {
      const sentAt = new Date('2026-06-21T10:00:00Z');
      prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithRecipient());
      prisma.v1UploadAsset.findFirst.mockResolvedValue({ id: 'asset-1', url: '/uploads/2026/10/a.jpg' });
      prisma.v1ChatMessage.create.mockResolvedValue({ id: 'msg-img', chatRoomId: 'room-1', senderUserId: userA.id, body: '사진', status: 'sent', messageType: 'image', sentAt });
      prisma.v1ChatRoom.update.mockResolvedValue({});
      prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: userB.id }]);

      const result = await service.sendMessage(userA, 'room-1', { imageUrl: '/uploads/2026/10/a.jpg' });

      // 소유자·종류까지 걸어 찾는다 — 남의 업로드·영상은 못 싣는다.
      expect(prisma.v1UploadAsset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { url: '/uploads/2026/10/a.jpg', ownerUserId: userA.id, kind: 'image' } }),
      );
      expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: '사진', messageType: 'image', attachmentAssetId: 'asset-1' }),
      });
      expect(result).toMatchObject({ messageId: 'msg-img', messageType: 'image', content: '사진', imageUrl: '/uploads/2026/10/a.jpg' });
      expect(prisma.v1Notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ recipientUserId: userB.id, body: '사진을 보냈어요' })] }),
      );
    });

    it('남의 업로드·없는 URL 이면 400 이고 메시지를 만들지 않는다', async () => {
      prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithRecipient());
      prisma.v1UploadAsset.findFirst.mockResolvedValue(null);

      await expect(service.sendMessage(userA, 'room-1', { imageUrl: '/uploads/2026/10/other.jpg' })).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED', details: { field: 'imageUrl' } },
      });
      expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
    });

    it('content 와 imageUrl 을 함께 보내거나 둘 다 없으면 400', async () => {
      await expect(service.sendMessage(userA, 'room-1', { content: '안녕', imageUrl: '/uploads/a.jpg' })).rejects.toThrow(BadRequestException);
      await expect(service.sendMessage(userA, 'room-1', {})).rejects.toThrow(BadRequestException);
      expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage: 일정·매치 공유 (Task 181 ②)', () => {
    const sentAt = new Date('2026-10-01T10:00:00Z');
    const arrangeSend = () => {
      prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom());
      prisma.v1ChatMessage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'msg-share', sentAt, status: 'sent', ...data }));
      prisma.v1ChatRoom.update.mockResolvedValue({});
      prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: userB.id }]);
    };

    it('팀원이 팀 매치 일정을 공유하면 상대 팀도 열 수 있는 팀 매치 화면 카드로 저장한다', async () => {
      arrangeSend();
      prisma.v1TeamSchedule.findFirst.mockResolvedValue({ id: 'sch-1', teamId: 'team-1', teamMatchId: 'tm-1', title: '토요일 친선', startAt: new Date('2026-10-04T10:00:00Z'), visibility: 'TEAM' });
      prisma.v1Team.findFirst.mockResolvedValue({ name: '번개 FC' });
      prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
      prisma.v1TeamMatch.findFirst.mockResolvedValue({ placeName: '잠실 풋살장' });

      const result = await service.sendMessage(userA, 'room-1', { share: { kind: 'team_schedule', targetId: 'sch-1' } });

      const card = { kind: 'team_schedule', targetId: 'sch-1', title: '토요일 친선', startAt: '2026-10-04T10:00:00.000Z', place: '잠실 풋살장', sub: '번개 FC', route: '/team-matches/tm-1' };
      expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ messageType: 'share', body: '[일정] 토요일 친선', shareCard: card }) });
      expect(result).toMatchObject({ messageType: 'share', content: '[일정] 토요일 친선', shareCard: card });
      expect(prisma.v1Notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ body: '일정을 공유했어요 · 토요일 친선' })] }),
      );
    });

    it('팀원이 아니면 비공개 팀 일정을 공유할 수 없다(400, 존재를 드러내지 않음) · 공개 일정은 된다', async () => {
      arrangeSend();
      prisma.v1TeamSchedule.findFirst.mockResolvedValue({ id: 'sch-2', teamId: 'team-2', teamMatchId: null, title: '팀 훈련', startAt: new Date('2026-10-05T10:00:00Z'), visibility: 'TEAM' });
      prisma.v1Team.findFirst.mockResolvedValue({ name: '천둥 FC' });
      prisma.v1TeamMembership.findFirst.mockResolvedValue(null);

      await expect(service.sendMessage(userA, 'room-1', { share: { kind: 'team_schedule', targetId: 'sch-2' } })).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED', details: { field: 'share' } },
      });
      expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();

      prisma.v1TeamSchedule.findFirst.mockResolvedValue({ id: 'sch-2', teamId: 'team-2', teamMatchId: null, title: '공개 연습', startAt: new Date('2026-10-05T10:00:00Z'), visibility: 'PUBLIC' });
      const result = await service.sendMessage(userA, 'room-1', { share: { kind: 'team_schedule', targetId: 'sch-2' } });
      expect(result.shareCard).toMatchObject({ route: '/teams/team-2/schedules/sch-2', place: null, sub: '천둥 FC' });
    });

    it('매치 공유는 매치 화면 카드 · 알림은 "매치를 공유했어요"', async () => {
      arrangeSend();
      const entitlement = await prisma.v1Match.findFirst();
      prisma.v1Match.findFirst.mockImplementation(async (args?: { select?: { placeName?: boolean } }) =>
        args?.select?.placeName ? { id: 'match-9', title: '수요일 저녁 풋살', startAt: new Date('2026-10-08T11:00:00Z'), placeName: '성수 풋살파크' } : entitlement,
      );

      const result = await service.sendMessage(userA, 'room-1', { share: { kind: 'match', targetId: 'match-9' } });

      expect(result.shareCard).toEqual({ kind: 'match', targetId: 'match-9', title: '수요일 저녁 풋살', startAt: '2026-10-08T11:00:00.000Z', place: '성수 풋살파크', sub: null, route: '/matches/match-9' });
      expect(prisma.v1Notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ body: '매치를 공유했어요 · 수요일 저녁 풋살' })] }),
      );
    });

    it('공유와 텍스트·사진을 함께 보내면 400', async () => {
      await expect(service.sendMessage(userA, 'room-1', { content: '이거 봐', share: { kind: 'match', targetId: 'match-9' } })).rejects.toThrow(BadRequestException);
      expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
    });

    it('parseShareCard: 모양이 어긋나거나 경로가 / 로 시작하지 않으면 카드 없이(null)', () => {
      expect(parseShareCard({ kind: 'match', targetId: 'm', title: 't', route: 'https://evil.example' })).toBeNull();
      expect(parseShareCard({ kind: 'nope', targetId: 'm', title: 't', route: '/matches/m' })).toBeNull();
      expect(parseShareCard(null)).toBeNull();
      expect(parseShareCard({ kind: 'match', targetId: 'm', title: 't', route: '/matches/m' })).toEqual({ kind: 'match', targetId: 'm', title: 't', startAt: null, place: null, sub: null, route: '/matches/m' });
    });
  });

  it('sendMessage: muted active participants are excluded from chat notifications', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-muted', chatRoomId: 'room-1', senderUserId: userA.id, body: 'ping', status: 'sent', sentAt };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom());
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([]);

    await service.sendMessage(userA, 'room-1', { content: 'ping' });

    expect(prisma.v1ChatRoomParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chatRoomId: 'room-1',
          status: 'active',
          userId: { not: userA.id },
          OR: [{ mutedUntil: null }, { mutedUntil: { lte: expect.any(Date) } }],
          AND: [
            {
              user: {
                OR: [
                  {
                    matchParticipants: {
                      some: { matchId: 'match-1', status: { in: ['active', 'completed'] }, match: { deletedAt: null } },
                    },
                  },
                  {
                    hostedMatches: {
                      some: {
                        id: 'match-1',
                        deletedAt: null,
                        participants: { some: { role: 'participant', status: { in: ['active', 'completed'] } } },
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
      }),
    );
    expect(prisma.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('updateMe: stores mutedUntil for app notification mute', async () => {
    const mutedUntil = '2026-07-08T00:00:00.000Z';
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoomForParticipant(userA.id));
    prisma.v1ChatRoomParticipant.update.mockResolvedValue({
      id: 'participant-user-a',
      chatRoomId: 'room-1',
      userId: userA.id,
      status: 'active',
      pinnedAt: null,
      mutedUntil: new Date(mutedUntil),
      lastReadMessageId: null,
    });

    const result = await service.updateMe(userA, 'room-1', { mutedUntil });

    expect(prisma.v1ChatRoomParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mutedUntil: new Date(mutedUntil) }),
      }),
    );
    expect(result).toMatchObject({ roomId: 'room-1', mutedUntil: new Date(mutedUntil), status: 'active' });
  });

  // ─── 6. leave 멱등성: 이미 나간 참가자 재퇴장 → 409 ALREADY_PROCESSED ────────

  it('leave: 이미 나간(left) 참가자가 다시 leave → 409 ALREADY_PROCESSED', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoomForParticipant(userA.id, 'left'));

    await expect(service.leave(userA, 'room-1', {})).rejects.toMatchObject({
      response: { code: 'ALREADY_PROCESSED' },
    });
    await expect(service.leave(userA, 'room-1', {})).rejects.toThrow(ConflictException);

    // No update should be attempted on an already-left participant
    expect(prisma.v1ChatRoomParticipant.update).not.toHaveBeenCalled();
  });

  // ─── 7. resolve(match): get-or-create 멱등성 ─────────────────────────────────

  // ─── 10. sendMessage: chat:message + notification:new 실시간 emit ───────────

  it('sendMessage: emits chat:message and notification:new to every other active recipient', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-1', chatRoomId: 'room-1', senderUserId: userA.id, body: 'hello', status: 'sent', sentAt };
    const roomWithThreeParticipants = {
      ...makeRoom(),
      participants: [
        { id: 'part-a', chatRoomId: 'room-1', userId: userA.id, status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userA.id, profile: { nickname: 'A', displayName: null, profileImageUrl: null } } },
        { id: 'part-b', chatRoomId: 'room-1', userId: 'user-2', status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: 'user-2', profile: { nickname: 'B', displayName: null, profileImageUrl: null } } },
        { id: 'part-c', chatRoomId: 'room-1', userId: 'user-3', status: 'active', pinnedAt: null, mutedUntil: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: 'user-3', profile: { nickname: 'C', displayName: null, profileImageUrl: null } } },
      ],
    };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithThreeParticipants);
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }]);
    prisma.v1Notification.createMany.mockResolvedValue({ count: 2 });

    await service.sendMessage(userA, 'room-1', { content: 'hello' });

    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-2',
      'chat:message',
      expect.objectContaining({ roomId: 'room-1', content: 'hello' }),
    );
    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-2',
      'notification:new',
      expect.objectContaining({ targetType: 'chat', targetId: 'room-1' }),
    );
    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-3',
      'chat:message',
      expect.objectContaining({ roomId: 'room-1', content: 'hello' }),
    );
    expect(realtimeGateway.emitToUser).not.toHaveBeenCalledWith(userA.id, expect.anything(), expect.anything());
  });

  // ─── 11. sendMessage: WebPushService.sendToUser 웹 푸시 발송 ────────────────

  it('sendMessage: calls WebPushService.sendToUser for each recipient alongside the realtime emit', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-push', chatRoomId: 'room-1', senderUserId: userA.id, body: 'hello push', status: 'sent', sentAt };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithTwoRecipients());
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }]);
    prisma.v1Notification.createMany.mockResolvedValue({ count: 2 });
    prisma.v1NotificationPreference.findMany.mockResolvedValue([]); // no rows → default enabled for both

    await service.sendMessage(userA, 'room-1', { content: 'hello push' });

    expect(prisma.v1NotificationPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['user-2', 'user-3'] } } }),
    );
    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ title: '테스트 매치', body: 'hello push', url: '/chat/room-1' }),
    );
    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-3',
      expect.objectContaining({ title: '테스트 매치', body: 'hello push', url: '/chat/room-1' }),
    );
    expect(webPushService.sendToUser).not.toHaveBeenCalledWith(userA.id, expect.anything());
  });

  it('sendMessage: WebPushService.sendToUser rejecting does not fail the send (fire-and-forget)', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-push-fail', chatRoomId: 'room-1', senderUserId: userA.id, body: 'ping', status: 'sent', sentAt };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithTwoRecipients());
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }]);
    prisma.v1Notification.createMany.mockResolvedValue({ count: 2 });
    prisma.v1NotificationPreference.findMany.mockResolvedValue([]);
    webPushService.sendToUser.mockRejectedValueOnce(new Error('vapid send failed'));

    await expect(service.sendMessage(userA, 'room-1', { content: 'ping' })).resolves.toMatchObject({
      messageId: 'msg-push-fail',
    });
  });

  it('sendMessage: still succeeds (skipping push for all recipients) when the preference lookup itself rejects', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-pref-lookup-fail', chatRoomId: 'room-1', senderUserId: userA.id, body: 'ping', status: 'sent', sentAt };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithTwoRecipients());
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }]);
    prisma.v1Notification.createMany.mockResolvedValue({ count: 2 });
    // The message is already committed by the time this runs — a rejection here
    // must not turn an already-successful send into a 500.
    prisma.v1NotificationPreference.findMany.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(service.sendMessage(userA, 'room-1', { content: 'ping' })).resolves.toMatchObject({
      messageId: 'msg-pref-lookup-fail',
    });
    expect(prisma.v1Notification.createMany).not.toHaveBeenCalled();
    expect(webPushService.sendToUser).not.toHaveBeenCalled();
  });

  it('sendMessage: chatEnabled=false 수신자는 채팅 메시지만 받고 알림함·배지·푸시는 받지 않는다', async () => {
    const sentAt = new Date('2026-06-21T10:00:00Z');
    const createdMessage = { id: 'msg-muted-pref', chatRoomId: 'room-1', senderUserId: userA.id, body: 'quiet', status: 'sent', sentAt };
    prisma.v1ChatRoom.findFirst.mockResolvedValue(roomWithTwoRecipients());
    prisma.v1ChatMessage.create.mockResolvedValue(createdMessage);
    prisma.v1ChatRoom.update.mockResolvedValue({});
    prisma.v1ChatRoomParticipant.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }]);
    prisma.v1Notification.createMany.mockResolvedValue({ count: 1 });
    // user-2 disabled chat notifications; user-3 has no preference row (default enabled)
    prisma.v1NotificationPreference.findMany.mockResolvedValue([{ userId: 'user-2', chatEnabled: false }]);

    await service.sendMessage(userA, 'room-1', { content: 'quiet' });

    expect(webPushService.sendToUser).not.toHaveBeenCalledWith('user-2', expect.anything());
    expect(webPushService.sendToUser).toHaveBeenCalledWith('user-3', expect.anything());
    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith('user-2', 'chat:message', expect.anything());
    expect(realtimeGateway.emitToUser).not.toHaveBeenCalledWith('user-2', 'notification:new', expect.anything());
    expect(prisma.v1Notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: 'user-3',
          targetType: 'chat',
          targetId: 'room-1',
        }),
      ],
    });
  });

  it('resolve(match): 첫 호출 시 created=true, 두 번째 호출 시 created=false (멱등성)', async () => {
    // First call: no existing room → create
    const newRoom = { id: 'room-new', matchId: 'match-1', status: 'active', createdAt: new Date(), updatedAt: new Date() };
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoom.create.mockResolvedValueOnce(newRoom);
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoomParticipant.create.mockResolvedValueOnce({});

    const first = await service.resolve(userA, { targetType: 'match', targetId: 'match-1' });
    expect(first).toMatchObject({ roomId: 'room-new', roomType: 'match', created: true, route: '/chat/room-new' });
    expect(prisma.v1Match.findFirst).toHaveBeenCalledWith({
      where: { id: 'match-1', deletedAt: null },
      select: {
        hostUserId: true,
        participants: {
          where: { status: { in: ['active', 'completed'] } },
          select: { userId: true, role: true },
        },
      },
    });

    // Second call: room already exists → return existing, created=false
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(newRoom);
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValueOnce({ id: 'participant-a', status: 'active' });

    const second = await service.resolve(userA, { targetType: 'match', targetId: 'match-1' });
    expect(second).toMatchObject({ roomId: 'room-new', roomType: 'match', created: false, route: '/chat/room-new' });

    // Room should only be created ONCE
    expect(prisma.v1ChatRoom.create).toHaveBeenCalledTimes(1);
    expect(prisma.v1ChatRoomParticipant.create).toHaveBeenCalledWith({
      data: { chatRoomId: 'room-new', userId: userA.id, status: 'active', visibleFromAt: null },
    });
  });

  it('resolve(team): returns the v1 web chat page route for active team members', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'team-member-1' });
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoom.create.mockResolvedValueOnce({ id: 'team-room-1', teamId: 'team-1', status: 'active' });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoomParticipant.create.mockResolvedValueOnce({});

    const result = await service.resolve(userA, { targetType: 'team', targetId: 'team-1' });

    expect(result).toMatchObject({
      roomId: 'team-room-1',
      roomType: 'team',
      created: true,
      route: '/chat/team-room-1',
    });
  });

  // 감사 결함 회귀 방지(2026-08-27): 결과 제출로 V1TeamMatch.status가 matched→completed로
  // 넘어간 뒤에도 팀 owner/manager는 채팅을 계속 열 수 있어야 한다. 예전엔
  // assertCanUseTeamMatchChat이 status:'matched'로 exact-match 해서, completed가 된 팀매치의
  // resolve/detail/sendMessage 전부가 409 STATE_CONFLICT('Team match chat is available after
  // matching')로 죽었다 — 버튼은 여전히 활성인데 눌러도 반응이 없는 증상의 원인.
  it('resolve(team_match): completed 상태에서도 팀 owner/manager 는 채팅을 연다', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue({
      hostTeamId: 'team-host', approvedApplicantTeamId: 'team-guest',
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'membership-1' });
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoom.create.mockResolvedValueOnce({ id: 'tm-room-1', teamMatchId: 'tm-1', status: 'active' });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoomParticipant.create.mockResolvedValueOnce({});

    const result = await service.resolve(userA, { targetType: 'team_match', targetId: 'tm-1' });

    expect(result).toMatchObject({ roomId: 'tm-room-1', roomType: 'team_match', created: true, route: '/chat/tm-room-1' });
    // status가 matched/completed 둘 다 통과하도록 findFirst where에 in 조건이 전달됐는지도
    // 함께 고정한다 — 이 단언 없이는 하드코딩된 'matched'로 되돌아가도 이 테스트는 여전히
    // 통과한다(위 mockResolvedValue가 무조건 값을 돌려주므로).
    const where = prisma.v1TeamMatch.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['matched', 'completed'] });
  });

  it('resolve(team_match): 매칭 전(승인된 상대팀 없음) 이면 409 STATE_CONFLICT', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValue(null);

    await expect(service.resolve(userA, { targetType: 'team_match', targetId: 'tm-1' })).rejects.toMatchObject({
      response: { code: 'STATE_CONFLICT' },
    });
  });

  // ─── 8. resolve(match): 비-참가자 → 403 PERMISSION_DENIED ──────────────────

  it('resolve(match): 매치 비-참가자 사용자 → 403 PERMISSION_DENIED', async () => {
    prisma.v1Match.findFirst.mockResolvedValue({ hostUserId: 'host-user', participants: [] });

    await expect(service.resolve(userB, { targetType: 'match', targetId: 'match-1' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    await expect(service.resolve(userB, { targetType: 'match', targetId: 'match-1' })).rejects.toThrow(ForbiddenException);

    // No room should be resolved/created
    expect(prisma.v1ChatRoom.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1ChatRoom.create).not.toHaveBeenCalled();
  });

  it('resolve(match): 참가자가 없는 주최자에게 안내 가능한 409를 반환하고 방을 만들지 않는다', async () => {
    prisma.v1Match.findFirst.mockResolvedValue({ hostUserId: userA.id, participants: [] });

    await expect(service.resolve(userA, { targetType: 'match', targetId: 'match-1' })).rejects.toMatchObject({
      response: {
        code: 'MATCH_CHAT_PARTICIPANTS_REQUIRED',
        message: '아직 참여자가 없어 채팅을 시작할 수 없어요. 신청자를 승인한 뒤 이용해 주세요.',
      },
    });
    expect(prisma.v1ChatRoom.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1ChatRoom.create).not.toHaveBeenCalled();
  });

  it('resolve(match): 본인이 참가하지 않는 주최자도 승인 참가자가 있으면 채팅방에 입장한다', async () => {
    prisma.v1Match.findFirst.mockResolvedValue({
      hostUserId: userA.id,
      participants: [{ userId: userB.id, role: 'participant' }],
    });
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1', matchId: 'match-1', status: 'active' });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue(null);
    prisma.v1ChatRoomParticipant.create.mockResolvedValue({});

    await expect(service.resolve(userA, { targetType: 'match', targetId: 'match-1' })).resolves.toMatchObject({
      roomId: 'room-1',
      roomType: 'match',
      created: false,
    });
    expect(prisma.v1ChatRoomParticipant.create).toHaveBeenCalledWith({
      data: { chatRoomId: 'room-1', userId: userA.id, status: 'active', visibleFromAt: null },
    });
  });

  // ─── 9. detail: 존재하지 않는 방 → 404 NOT_FOUND ───────────────────────────

  it('detail: 존재하지 않는 roomId → 404 NOT_FOUND', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(null);

    await expect(service.detail(userA, 'ghost-room')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    await expect(service.detail(userA, 'ghost-room')).rejects.toThrow(NotFoundException);
  });
});
