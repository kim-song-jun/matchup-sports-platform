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
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

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
        leftAt: null,
        lastReadMessageId: null,
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
        leftAt: null,
        lastReadMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: userId, profile: { nickname: '닉네임', displayName: null, profileImageUrl: null } },
      },
    ],
  };
}

// ─── test suite ────────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;
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
      findMany: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
    v1Notification: { createMany: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1MatchParticipant: { findFirst: jest.Mock };
    v1TeamMembership: { findFirst: jest.Mock };
    v1TeamMatch: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

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
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      v1Notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      v1MatchParticipant: { findFirst: jest.fn() },
      v1TeamMembership: { findFirst: jest.fn() },
      v1TeamMatch: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };

    // Default $transaction: pass-through (runs the callback with the same prisma stub)
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
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
        { id: 'part-a', chatRoomId: 'room-1', userId: userA.id, status: 'active', pinnedAt: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userA.id, profile: { nickname: 'A', displayName: null, profileImageUrl: null } } },
        { id: 'part-b', chatRoomId: 'room-1', userId: userB.id, status: 'active', pinnedAt: null, leftAt: null, lastReadMessageId: null, createdAt: new Date(), updatedAt: new Date(), user: { id: userB.id, profile: { nickname: 'B', displayName: null, profileImageUrl: null } } },
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

  it('resolve(match): 첫 호출 시 created=true, 두 번째 호출 시 created=false (멱등성)', async () => {
    // Simulate user being an active match participant
    prisma.v1MatchParticipant.findFirst.mockResolvedValue({ id: 'match-part-1' });

    // First call: no existing room → create
    const newRoom = { id: 'room-new', matchId: 'match-1', status: 'active', createdAt: new Date(), updatedAt: new Date() };
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoom.create.mockResolvedValueOnce(newRoom);
    prisma.v1ChatRoomParticipant.upsert.mockResolvedValue({});

    const first = await service.resolve(userA, { targetType: 'match', targetId: 'match-1' });
    expect(first).toMatchObject({ roomId: 'room-new', roomType: 'match', created: true, route: '/chat/room-new' });

    // Second call: room already exists → return existing, created=false
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(newRoom);
    prisma.v1ChatRoomParticipant.upsert.mockResolvedValue({});

    const second = await service.resolve(userA, { targetType: 'match', targetId: 'match-1' });
    expect(second).toMatchObject({ roomId: 'room-new', roomType: 'match', created: false, route: '/chat/room-new' });

    // Room should only be created ONCE
    expect(prisma.v1ChatRoom.create).toHaveBeenCalledTimes(1);
  });

  it('resolve(team): returns the v1 web chat page route for active team members', async () => {
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'team-member-1' });
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null);
    prisma.v1ChatRoom.create.mockResolvedValueOnce({ id: 'team-room-1', teamId: 'team-1', status: 'active' });
    prisma.v1ChatRoomParticipant.upsert.mockResolvedValue({});

    const result = await service.resolve(userA, { targetType: 'team', targetId: 'team-1' });

    expect(result).toMatchObject({
      roomId: 'team-room-1',
      roomType: 'team',
      created: true,
      route: '/chat/team-room-1',
    });
  });

  // ─── 8. resolve(match): 비-참가자 → 403 PERMISSION_DENIED ──────────────────

  it('resolve(match): 매치 비-참가자 사용자 → 403 PERMISSION_DENIED', async () => {
    // No active match participation found
    prisma.v1MatchParticipant.findFirst.mockResolvedValue(null);

    await expect(service.resolve(userB, { targetType: 'match', targetId: 'match-1' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    await expect(service.resolve(userB, { targetType: 'match', targetId: 'match-1' })).rejects.toThrow(ForbiddenException);

    // No room should be resolved/created
    expect(prisma.v1ChatRoom.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1ChatRoom.create).not.toHaveBeenCalled();
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
