/**
 * chat.service.team-contact.spec.ts
 *
 * "팀 컨택의 채팅 흡수" §3.3, §3.5, §3.6 계약 테스트:
 *   - sendMessage: 컨택이 requested(미만료)면 409 TEAM_CONTACT_NOT_ACCEPTED 로 막는다
 *   - sendMessage: 컨택이 accepted 면 통과한다
 *   - sendMessage: requested 인데 만료 시각이 지났으면 expired 로 계산해 막는다
 *   - resolve(team_contact): 나중에 들어오는 운영진의 참가자 visibleFromAt = room.createdAt
 *   - rooms(): 목록 항목에 teamContact 블록 + mySide 가 실린다
 *
 * Each test asserts REAL behavior (error codes, mutation payloads, return shapes).
 */
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService } from './chat.service';

const userU1 = { id: 'u1', email: 'u1@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const userU2 = { id: 'u2', email: 'u2@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

/** team_contact 채팅방 fixture — chat.service.spec.ts 의 makeRoom() 패턴을 따른다. */
function makeRoom(status: string, expiresAt = new Date(Date.now() + 86400000), toTeamMemberships: Array<{ id: string }> = []) {
  return {
    id: 'room-1', status: 'active', matchId: null, teamId: null, teamMatchId: null, teamContactId: 'c1',
    match: null, team: null, teamMatch: null,
    teamContact: { id: 'c1', fromTeamId: 'A', toTeamId: 'B', status, expiresAt, declineReason: null, fromTeam: { id: 'A', name: '가팀' }, toTeam: { id: 'B', name: '나팀', memberships: toTeamMemberships } },
    participants: [{ id: 'p1', userId: 'u1', status: 'active', visibleFromAt: new Date(0), pinnedAt: null, mutedUntil: null, lastReadMessageId: null, user: { id: 'u1', profile: null } }],
    messages: [],
  };
}

describe('ChatService — team_contact', () => {
  let service: ChatService;
  const realtimeGateway = {} as unknown as RealtimeGateway;
  const webPushService = {} as unknown as WebPushService;
  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

  let prisma: {
    v1ChatRoom: { findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    v1ChatMessage: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    v1ChatRoomParticipant: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    v1Notification: { createMany: jest.Mock };
    v1NotificationPreference: { findMany: jest.Mock };
    v1TeamContact: { findFirst: jest.Mock; updateMany: jest.Mock };
    v1TeamMembership: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1ChatRoom: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1ChatMessage: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      v1ChatRoomParticipant: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn() },
      v1Notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1NotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      v1TeamContact: { findFirst: jest.fn().mockResolvedValue({ fromTeamId: 'A', toTeamId: 'B' }), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TeamMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
      $transaction: jest.fn(),
    };
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

  it('컨택이 requested 면 전송을 409 TEAM_CONTACT_NOT_ACCEPTED 로 막는다', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom('requested'));

    await expect(service.sendMessage(userU1, 'room-1', { content: '안녕하세요' })).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTED' },
    });
    await expect(service.sendMessage(userU1, 'room-1', { content: '안녕하세요' })).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('컨택이 accepted 면 전송이 통과한다', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom('accepted'));
    prisma.v1ChatMessage.create.mockResolvedValue({
      id: 'msg-1', chatRoomId: 'room-1', senderUserId: userU1.id, body: '안녕하세요', status: 'sent', sentAt: new Date(),
    });

    const result = await service.sendMessage(userU1, 'room-1', { content: '안녕하세요' });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toMatchObject({ roomId: 'room-1', content: '안녕하세요' });
  });

  it('requested 인데 만료 시각이 지났으면 expired 로 계산해 막는다', async () => {
    prisma.v1ChatRoom.findFirst.mockResolvedValue(makeRoom('requested', new Date(Date.now() - 1000)));

    await expect(service.sendMessage(userU1, 'room-1', { content: '안녕하세요' })).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTED' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('resolve 로 나중에 들어오는 운영진은 visibleFromAt 이 방 생성 시각이다', async () => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1', teamContactId: 'c1', status: 'active', createdAt });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue(null);
    prisma.v1ChatRoomParticipant.create.mockResolvedValue({});

    await service.resolve(userU2, { targetType: 'team_contact', targetId: 'c1' });

    expect(prisma.v1ChatRoomParticipant.create).toHaveBeenCalledWith({
      data: { chatRoomId: 'room-1', userId: userU2.id, status: 'active', visibleFromAt: createdAt },
    });
  });

  it.each([
    ['null', null],
    ['방 생성 시각보다 늦은 값', new Date('2026-08-05T00:00:00.000Z')],
  ])('이미 active 인 참가자의 visibleFromAt 이 %s 이면 방 생성 시각으로 당긴다', async (_label, visibleFromAt) => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1', teamContactId: 'c1', status: 'active', createdAt });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue({ id: 'p2', status: 'active', visibleFromAt });

    await service.resolve(userU2, { targetType: 'team_contact', targetId: 'c1' });

    expect(prisma.v1ChatRoomParticipant.create).not.toHaveBeenCalled();
    expect(prisma.v1ChatRoomParticipant.update).toHaveBeenCalledWith({ where: { id: 'p2' }, data: { visibleFromAt: createdAt } });
  });

  it('이미 active 이고 visibleFromAt 이 방 생성 시각 이하면 건드리지 않는다', async () => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1', teamContactId: 'c1', status: 'active', createdAt });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue({ id: 'p2', status: 'active', visibleFromAt: createdAt });

    await service.resolve(userU2, { targetType: 'team_contact', targetId: 'c1' });

    expect(prisma.v1ChatRoomParticipant.update).not.toHaveBeenCalled();
  });

  it('방 목록 항목에 teamContact 블록과 mySide 가 실린다 — 방마다 멤버십을 따로 조회하지 않는다', async () => {
    // u1 은 fromTeam(A) 의 owner 지 toTeam(B) 소속이 아니므로(include 된 toTeam.memberships 가 빈 배열) mySide 는 'from'.
    prisma.v1ChatRoom.findMany.mockResolvedValue([makeRoom('accepted')]);

    const result = await service.rooms(userU1, {});

    expect(result.items[0].teamContact).toMatchObject({
      contactId: 'c1',
      status: 'accepted',
      declineReason: null,
      mySide: 'from',
      fromTeam: { id: 'A', name: '가팀' },
      toTeam: { id: 'B', name: '나팀' },
    });
    expect(result.items[0].linkedTarget).toMatchObject({ type: 'team_contact', route: '/teams/B' });
    expect(result.items[0].teamContact?.toTeam).toEqual({ id: 'B', name: '나팀' });
    // N+1 방지: 목록 조회 include 가 호출자 기준 멤버십을 실어 오므로 별도 findFirst 가 없다.
    expect(prisma.v1TeamMembership.findFirst).not.toHaveBeenCalled();
    const include = prisma.v1ChatRoom.findMany.mock.calls[0][0].include;
    expect(include.teamContact.select.toTeam.select.memberships.where).toMatchObject({ userId: 'u1', status: 'active' });
  });

  it('목록을 읽기 전에 내 컨택 방의 만료를 반영하고 끝난 방을 보관한다', async () => {
    prisma.v1ChatRoom.findMany.mockResolvedValue([]);

    await service.rooms(userU1, {});

    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'requested', chatRoom: { participants: { some: { userId: 'u1' } } } }),
        data: { status: 'expired' },
      }),
    );
    expect(prisma.v1ChatRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', teamContact: { is: expect.objectContaining({ status: { in: ['declined', 'withdrawn', 'expired'] } }) } }),
        data: { status: 'archived' },
      }),
    );
    // 정리는 목록 조회보다 앞선다
    const order = [prisma.v1TeamContact.updateMany, prisma.v1ChatRoom.updateMany, prisma.v1ChatRoom.findMany].map((m) => m.mock.invocationCallOrder[0]);
    expect(order[0]).toBeLessThan(order[2]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('받는 팀 운영진이면 mySide 가 to 다', async () => {
    prisma.v1ChatRoom.findMany.mockResolvedValue([makeRoom('requested', undefined, [{ id: 'm-to' }])]);

    const result = await service.rooms(userU1, {});

    expect(result.items[0].teamContact).toMatchObject({ mySide: 'to' });
    expect(result.items[0].linkedTarget).toMatchObject({ route: '/teams/A' });
  });
});
