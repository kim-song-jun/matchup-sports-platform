import {
  PrismaClient,
  ChatRoom,
  ChatMessage,
  ChatRoomParticipant,
  ChatRoomType,
  ChatMessageType,
} from '@prisma/client';

export interface ChatRoomWithParticipants {
  room: ChatRoom;
  participants: ChatRoomParticipant[];
}

export interface ChatRoomWithMessages {
  room: ChatRoom;
  participants: ChatRoomParticipant[];
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildChatRoom(
  overrides: Partial<{
    id: string;
    type: ChatRoomType;
    teamMatchId: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
): ChatRoom {
  return {
    id: overrides.id ?? 'room-test-id',
    type: overrides.type ?? ChatRoomType.direct,
    teamMatchId: overrides.teamMatchId ?? null,
    lastMessageAt: overrides.lastMessageAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01'),
  };
}

export function buildChatMessage(
  overrides: Partial<{
    id: string;
    roomId: string;
    senderId: string;
    content: string;
    type: ChatMessageType;
    imageUrl: string | null;
    deletedAt: Date | null;
    createdAt: Date;
  }> = {},
): ChatMessage {
  return {
    id: overrides.id ?? 'msg-test-id',
    roomId: overrides.roomId ?? 'room-test-id',
    senderId: overrides.senderId ?? 'user-test-id',
    content: overrides.content ?? '테스트 메시지입니다.',
    type: overrides.type ?? ChatMessageType.text,
    imageUrl: overrides.imageUrl ?? null,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T10:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a direct (1:1) chat room and adds both users as participants.
 */
export async function createDirectChatRoom(
  prisma: PrismaClient,
  userIdA: string,
  userIdB: string,
): Promise<ChatRoomWithParticipants> {
  const room = await prisma.chatRoom.create({
    data: { type: ChatRoomType.direct },
  });

  const participants = await Promise.all([
    prisma.chatRoomParticipant.create({
      data: { roomId: room.id, userId: userIdA },
    }),
    prisma.chatRoomParticipant.create({
      data: { roomId: room.id, userId: userIdB },
    }),
  ]);

  return { room, participants };
}

/**
 * Creates a team chat room and adds the provided member user IDs.
 */
export async function createTeamChatRoom(
  prisma: PrismaClient,
  memberIds: string[],
): Promise<ChatRoomWithParticipants> {
  const room = await prisma.chatRoom.create({
    data: { type: ChatRoomType.team },
  });

  const participants = await Promise.all(
    memberIds.map((userId) =>
      prisma.chatRoomParticipant.create({
        data: { roomId: room.id, userId },
      }),
    ),
  );

  return { room, participants };
}

/**
 * Creates a team-match chat room linked to the given teamMatchId.
 */
export async function createTeamMatchChatRoom(
  prisma: PrismaClient,
  teamMatchId: string,
  memberIds: string[],
): Promise<ChatRoomWithParticipants> {
  const room = await prisma.chatRoom.create({
    data: { type: ChatRoomType.team_match, teamMatchId },
  });

  const participants = await Promise.all(
    memberIds.map((userId) =>
      prisma.chatRoomParticipant.create({
        data: { roomId: room.id, userId },
      }),
    ),
  );

  return { room, participants };
}

/**
 * Adds N messages to an existing room from the given senderId.
 * Messages are created with increasing timestamps to support cursor pagination tests.
 */
export async function addMessages(
  prisma: PrismaClient,
  roomId: string,
  senderId: string,
  count: number,
  baseDate: Date = new Date('2026-03-01T00:00:00Z'),
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  for (let i = 0; i < count; i++) {
    const createdAt = new Date(baseDate.getTime() + i * 60_000);
    const msg = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId,
        content: `메시지 ${i + 1}`,
        type: ChatMessageType.text,
        createdAt,
      },
    });
    messages.push(msg);
  }

  // Update lastMessageAt on the room
  if (messages.length > 0) {
    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { lastMessageAt: messages[messages.length - 1].createdAt },
    });
  }

  return messages;
}

/**
 * Creates a direct chat room with a given number of messages — useful for
 * cursor pagination integration tests (need 20+ messages in a single room).
 */
export async function createDirectChatRoomWithMessages(
  prisma: PrismaClient,
  userIdA: string,
  userIdB: string,
  messageCount: number = 25,
): Promise<ChatRoomWithMessages> {
  const { room, participants } = await createDirectChatRoom(
    prisma,
    userIdA,
    userIdB,
  );

  const messages = await addMessages(prisma, room.id, userIdA, messageCount);

  return { room, participants, messages };
}
