/**
 * F64 — 팀매치 채팅방은 참가자 전원이 방 생성 시각부터 본다(팀 컨택 방과 같은 불변식).
 * 개인 매치 방은 참가 승인 시각부터(주최자는 방 생성 시각부터) 본다. 팀 방은 입장 시점부터만(대조군).
 *
 * 조회 조건(sentAt >= visibleFromAt 등)을 직접 평가하는 in-memory fake 위에서 resolve → messages → rooms
 * 를 실제로 밟는다 — mock 이 인자를 무시하면 "나중에 들어온 사람이 못 본다"를 잡을 수 없다.
 */
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService } from './chat.service';

type Row = Record<string, any>;

const userA = { id: 'user-a', email: 'a@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const userB = { id: 'user-b', email: 'b@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const ROOM_CREATED_AT = new Date('2026-09-30T09:00:00.000Z');
const minutesAfterCreation = (minutes: number) => new Date(ROOM_CREATED_AT.getTime() + minutes * 60_000);

// 차단·권한 필터는 이 스펙의 관심사가 아니라 평가하지 않는다. 그 밖의 모르는 조건은 조용히 통과시키지 않고 던진다.
const UNEVALUATED_KEYS = new Set(['OR', 'AND', 'senderUser', 'user']);

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (UNEVALUATED_KEYS.has(key)) return true;
    const value = row[key];
    if (condition === null) return value === null;
    if (condition instanceof Date) return value?.getTime() === condition.getTime();
    if (typeof condition === 'object') {
      return Object.entries(condition as Row).every(([operator, argument]) => {
        if (operator === 'gte') return value >= argument;
        if (operator === 'gt') return value > argument;
        if (operator === 'not') return value !== argument;
        throw new Error(`fake prisma: unsupported operator ${key}.${operator}`);
      });
    }
    return value === condition;
  });
}

type RoomKind = 'team_match' | 'match' | 'team';

function chatWorld(kind: RoomKind) {
  const link = { matchId: null, teamId: null, teamMatchId: null, teamContactId: null, [`${kind === 'team_match' ? 'teamMatch' : kind}Id`]: 'target-1' };
  const room: Row = { id: 'room-1', ...link, status: 'active', createdAt: ROOM_CREATED_AT, lastMessageAt: null };
  const participants: Row[] = [];
  const messages: Row[] = [];
  const approvals = new Map<string, Date>();
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const profileOf = (userId: string) => ({ nickname: userId === userA.id ? 'Alice' : 'Bob', displayName: null, profileImageUrl: null });
  const withUser = (participant: Row) => ({ ...participant, user: { id: participant.userId, profile: profileOf(participant.userId) } });
  const withSender = (message: Row) => ({ ...message, senderUser: { id: message.senderUserId, profile: profileOf(message.senderUserId) } });
  const roomShape = (participantRows: Row[]) => ({
    ...room,
    match: room.matchId ? { id: 'target-1', title: '개인 매치' } : null,
    team: room.teamId ? { id: 'target-1', name: '팀' } : null,
    teamMatch: room.teamMatchId ? { id: 'target-1', title: '팀 매치', hostTeamId: 'team-h', approvedApplicantTeamId: 'team-a' } : null,
    teamContact: null,
    participants: participantRows,
    messages: [...messages].sort((a, b) => b.sentAt - a.sentAt).slice(0, 1),
  });

  const prisma: Row = {
    v1ChatRoom: {
      findUnique: jest.fn(async () => room),
      create: jest.fn(async () => room),
      findFirst: jest.fn(async ({ where }: { where: Row }) => (matches(room, where)
        ? roomShape(participants.filter((row) => row.userId === currentUserId).map(withUser))
        : null)),
      findMany: jest.fn(async () => [roomShape(participants.map(withUser))]),
      update: jest.fn(async ({ data }: { data: Row }) => Object.assign(room, data)),
      updateMany: jest.fn(async ({ data }: { data: Row }) => { Object.assign(room, data); return { count: 1 }; }),
    },
    v1ChatRoomParticipant: {
      findUnique: jest.fn(async ({ where }: { where: Row }) => participants.find((row) => (where.id
        ? row.id === where.id
        : row.chatRoomId === where.chatRoomId_userId.chatRoomId && row.userId === where.chatRoomId_userId.userId)) ?? null),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: nextId('participant'), lastReadMessageId: null, pinnedAt: null, mutedUntil: null, leftAt: null, ...data };
        participants.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => Object.assign(participants.find((row) => row.id === where.id) as Row, data)),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = participants.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      findMany: jest.fn(async ({ where }: { where: Row }) => participants.filter((row) => matches(row, where)).map((row) => ({
        ...row,
        lastReadMessage: messages.find((message) => message.id === row.lastReadMessageId) ?? null,
        user: { chatBlocksMade: [], chatBlocksReceived: [] },
      }))),
    },
    v1ChatMessage: {
      findMany: jest.fn(async ({ where, take }: { where: Row; take: number }) => messages
        .filter((row) => matches(row, where))
        .sort((a, b) => b.sentAt - a.sentAt)
        .slice(0, take)
        .map(withSender)),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: nextId('message'), sentAt: new Date(), messageType: 'text', systemEventType: null, ...data };
        messages.push(row);
        return row;
      }),
      count: jest.fn(async ({ where }: { where: Row }) => messages.filter((row) => matches(row, where)).length),
      findUnique: jest.fn(async ({ where }: { where: Row }) => messages.find((row) => row.id === where.id) ?? null),
    },
    // 참여 자격(assertCurrentRoomEntitlement)은 통과시킨다 — 이 스펙은 열람 경계만 본다.
    v1Match: {
      // 개인 매치 열람 시작(matchChatHistoryFrom) — 묻는 사용자의 참가 승인 시각.
      findUnique: jest.fn(async ({ select }: { select: Row }) => {
        const approvedAt = approvals.get(select.participants.where.userId);
        return { hostUserId: 'host-user', participants: approvedAt ? [{ approvedAt }] : [] };
      }),
      findFirst: jest.fn(async () => ({
        hostUserId: 'host-user',
        participants: [userA, userB].map((user) => ({ userId: user.id, role: 'participant' })),
      })),
    },
    v1TeamMatch: { findFirst: jest.fn(async () => ({ hostTeamId: 'team-h', approvedApplicantTeamId: 'team-a' })) },
    v1TeamMembership: { findFirst: jest.fn(async () => ({ id: 'membership-1' })) },
    v1TeamContact: { updateMany: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };

  // getRoomParticipant 는 호출자의 참가자 행만 실어 오므로 fake 도 "지금 누가 묻는가"를 알아야 한다.
  let currentUserId = userA.id;
  return {
    prisma,
    room,
    participants,
    messages,
    as: (userId: string) => { currentUserId = userId; },
    /** 개인 매치 참가 승인 시각을 심는다. */
    approve: (userId: string, approvedAt: Date) => { approvals.set(userId, approvedAt); },
    /** 상대가 방에 이미 있었다는 전제 — 입장 절차를 거치지 않고 행을 심는다. */
    seedText: (senderUserId: string, body: string, sentAt: Date) => {
      messages.push({ id: nextId('message'), chatRoomId: room.id, senderUserId, body, status: 'sent', messageType: 'text', systemEventType: null, sentAt });
    },
    seedParticipant: (userId: string, visibleFromAt: Date | null) => {
      participants.push({ id: nextId('participant'), chatRoomId: room.id, userId, status: 'active', visibleFromAt, lastReadMessageId: null, pinnedAt: null, mutedUntil: null, leftAt: null });
    },
  };
}

async function makeService(prisma: Row) {
  const module = await Test.createTestingModule({
    providers: [
      ChatService,
      { provide: PrismaService, useValue: prisma },
      { provide: RealtimeGateway, useValue: { emitToUser: jest.fn() } },
      { provide: WebPushService, useValue: { sendToUser: jest.fn().mockResolvedValue(undefined) } },
      { provide: getLoggerToken(ChatService.name), useValue: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } },
    ],
  }).compile();
  return module.get(ChatService);
}

// 시각(Date)만 고정한다 — 다른 타이머까지 가짜로 만들면 Nest 모듈 컴파일이 멈춘다.
const freezeClock = (now: Date) => jest.useFakeTimers({
  now,
  doNotFake: [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
    'setTimeout', 'clearTimeout',
  ],
});

const resolveDto = (kind: RoomKind) => ({ targetType: kind, targetId: 'target-1' });
const textOf = (items: Array<{ content: string | null; messageType: string }>) =>
  items.filter((item) => item.messageType === 'text').map((item) => item.content);

describe('ChatService — 팀매치 방 열람 경계 (F64)', () => {
  afterEach(() => jest.useRealTimers());

  it('A 가 먼저 보낸 메시지를 나중에 입장한 B 가 목록과 미읽음에서 본다', async () => {
    freezeClock(minutesAfterCreation(1));
    const world = chatWorld('team_match');
    const service = await makeService(world.prisma);

    world.as(userA.id);
    await service.resolve(userA, resolveDto('team_match'));
    await service.messages(userA, 'room-1', { limit: 30 });
    world.seedText(userA.id, '킥오프 30분 전에 모여요', minutesAfterCreation(2));

    jest.setSystemTime(minutesAfterCreation(5));
    world.as(userB.id);
    await service.resolve(userB, resolveDto('team_match'));
    const forB = await service.messages(userB, 'room-1', { limit: 30 });

    const hello = forB.items.find((item) => item.content === '킥오프 30분 전에 모여요');
    expect(hello).toBeDefined();
    // 미읽음 수: B 는 아직 읽지 않았으므로 이 메시지의 안 읽은 사람에 포함된다.
    expect(hello?.unreadCount).toBe(1);
    const rooms = await service.rooms(userB, { roomType: 'team_match' });
    expect(rooms.items[0].unreadCount).toBe(1);
    expect(world.participants.find((row) => row.userId === userB.id)?.visibleFromAt).toEqual(ROOM_CREATED_AT);

    // 입장 시스템 메시지는 그대로 남는다 — 열람 경계만 바뀌었다.
    world.as(userA.id);
    const forA = await service.messages(userA, 'room-1', { limit: 30 });
    const joined = forA.items.filter((item) => item.systemEventType === 'joined' && item.content === 'Bob님이 들어왔어요');
    expect(joined).toHaveLength(1);
    expect(joined[0].sentAt).toEqual(minutesAfterCreation(5));
  });

  it('이미 입장 시각으로 잡혀 있던 팀매치 참가자는 접근하면 방 생성 시각으로 당겨진다', async () => {
    freezeClock(minutesAfterCreation(10));
    const world = chatWorld('team_match');
    const service = await makeService(world.prisma);
    world.seedParticipant(userA.id, minutesAfterCreation(1));
    world.seedParticipant(userB.id, minutesAfterCreation(5)); // 이전 규칙: 입장 시각부터
    world.seedText(userA.id, '입장 전에 보낸 메시지', minutesAfterCreation(2));

    world.as(userB.id);
    const forB = await service.messages(userB, 'room-1', { limit: 30 });

    expect(textOf(forB.items)).toEqual(['입장 전에 보낸 메시지']);
    expect(world.participants.find((row) => row.userId === userB.id)?.visibleFromAt).toEqual(ROOM_CREATED_AT);
    // 대조군: 이미 경계 이하인 참가자는 건드리지 않는다.
    expect(world.participants.find((row) => row.userId === userA.id)?.visibleFromAt).toEqual(minutesAfterCreation(1));
  });

  it('개인 매치 방은 참가 승인 시각부터 보인다 — 승인 전 메시지는 안 보이고, 승인 뒤 늦게 열어도 그 사이 메시지는 보인다', async () => {
    freezeClock(minutesAfterCreation(1));
    const world = chatWorld('match');
    const service = await makeService(world.prisma);
    world.approve(userA.id, ROOM_CREATED_AT);
    world.approve(userB.id, minutesAfterCreation(3));

    world.as(userA.id);
    await service.resolve(userA, resolveDto('match'));
    await service.messages(userA, 'room-1', { limit: 30 });
    world.seedText(userA.id, '승인 전 메시지', minutesAfterCreation(2));
    world.seedText(userA.id, '승인 뒤 메시지', minutesAfterCreation(4));

    jest.setSystemTime(minutesAfterCreation(10));
    world.as(userB.id);
    await service.resolve(userB, resolveDto('match'));
    const forB = await service.messages(userB, 'room-1', { limit: 30 });

    expect(textOf(forB.items)).toEqual(['승인 뒤 메시지']);
    expect(world.participants.find((row) => row.userId === userB.id)?.visibleFromAt).toEqual(minutesAfterCreation(3));
  });

  it('이미 입장 시각으로 늦게 잡혀 있던 개인 매치 참가자는 접근하면 승인 시각으로 당겨진다', async () => {
    freezeClock(minutesAfterCreation(10));
    const world = chatWorld('match');
    const service = await makeService(world.prisma);
    world.approve(userB.id, minutesAfterCreation(1));
    world.seedParticipant(userA.id, minutesAfterCreation(1));
    world.seedParticipant(userB.id, minutesAfterCreation(5)); // 이전 규칙: 입장 시각부터
    world.seedText(userA.id, '승인 뒤 입장 전 메시지', minutesAfterCreation(2));

    world.as(userB.id);
    const forB = await service.messages(userB, 'room-1', { limit: 30 });

    expect(textOf(forB.items)).toEqual(['승인 뒤 입장 전 메시지']);
    expect(world.participants.find((row) => row.userId === userB.id)?.visibleFromAt).toEqual(minutesAfterCreation(1));
  });

  it('team 방은 여전히 입장 이후 메시지만 보인다', async () => {
    const kind: RoomKind = 'team';
    freezeClock(minutesAfterCreation(1));
    const world = chatWorld(kind);
    const service = await makeService(world.prisma);

    world.as(userA.id);
    await service.resolve(userA, resolveDto(kind));
    await service.messages(userA, 'room-1', { limit: 30 });
    world.seedText(userA.id, '입장 전 메시지', minutesAfterCreation(2));

    jest.setSystemTime(minutesAfterCreation(5));
    world.as(userB.id);
    await service.resolve(userB, resolveDto(kind));
    world.seedText(userA.id, '입장 후 메시지', minutesAfterCreation(6));
    const forB = await service.messages(userB, 'room-1', { limit: 30 });

    expect(textOf(forB.items)).toEqual(['입장 후 메시지']);
    expect(world.participants.find((row) => row.userId === userB.id)?.visibleFromAt).toEqual(minutesAfterCreation(5));
  });
});
