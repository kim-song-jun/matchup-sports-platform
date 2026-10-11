/**
 * MD-QA #111 — 팀매치·리그 경기 채팅은 한 팀장이 먼저 열어도 상대 팀 운영진(owner/manager)이 첫 메시지부터
 * 참여자로 등록되어 알림을 받는다. 상대가 'chat' 을 직접 누르기 전에도 방에 들어올 수 있어야 한다.
 *
 * 참여자 등록·알림 수신자 선정은 in-memory fake 위에서 실제 서비스 코드로 밟는다 — mock 이 인자를 무시하면
 * "상대가 등록되지 않는다"를 잡을 수 없다. 대조군: 일반 팀원·무관한 팀 운영진·스스로 나간 운영진은 등록되지 않는다.
 */
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService } from './chat.service';

type Row = Record<string, any>;

const user = (id: string) => ({ id, email: `${id}@teameet.v1`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });
const hostCaptain = user('host-captain');
const awayCaptain = user('away-captain');
const awayManager = user('away-manager');
const awayMember = user('away-member');
const outsiderCaptain = user('outsider-captain');
const ROOM_CREATED_AT = new Date('2026-10-11T00:00:00.000Z');

function teamMatchWorld() {
  const memberships: Row[] = [
    { userId: hostCaptain.id, teamId: 'team-host', role: 'owner', status: 'active' },
    { userId: awayCaptain.id, teamId: 'team-away', role: 'owner', status: 'active' },
    { userId: awayManager.id, teamId: 'team-away', role: 'manager', status: 'active' },
    { userId: awayMember.id, teamId: 'team-away', role: 'member', status: 'active' },
    { userId: outsiderCaptain.id, teamId: 'team-other', role: 'owner', status: 'active' },
  ];
  const match = { id: 'tm-1', hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away', platformManaged: false, createdByUserId: null };
  let room: Row | null = null;
  const participants: Row[] = [];
  const notifications: Row[] = [];
  const messages: Row[] = [];
  let caller = hostCaptain.id;

  const isManager = (userId: string, teamId: string | null) => memberships.some(
    (m) => m.userId === userId && m.teamId === teamId && m.status === 'active' && ['owner', 'manager'].includes(m.role),
  );
  const withUser = (row: Row) => ({ ...row, user: { id: row.userId, profile: { nickname: row.userId, displayName: null, profileImageUrl: null } } });
  const roomShape = () => room && ({
    ...room, match: null, team: null, teamContact: null, messages: [],
    teamMatch: { title: '팀 매치', ...match },
    participants: participants.filter((p) => p.userId === caller).map(withUser),
  });

  const prisma: Row = {
    v1ChatRoom: {
      findUnique: jest.fn(async () => room),
      create: jest.fn(async ({ data }: { data: Row }) => (room = { id: 'room-1', createdAt: ROOM_CREATED_AT, lastMessageAt: null, ...data })),
      findFirst: jest.fn(async () => roomShape()),
      update: jest.fn(async () => room),
    },
    v1ChatRoomParticipant: {
      findUnique: jest.fn(async ({ where }: { where: Row }) => participants.find((p) => (where.id
        ? p.id === where.id
        : p.chatRoomId === where.chatRoomId_userId.chatRoomId && p.userId === where.chatRoomId_userId.userId)) ?? null),
      create: jest.fn(async ({ data }: { data: Row }) => { participants.push({ id: `p-${participants.length}`, ...data }); }),
      createMany: jest.fn(async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates: boolean }) => {
        expect(skipDuplicates).toBe(true);
        for (const row of data) {
          if (!participants.some((p) => p.chatRoomId === row.chatRoomId && p.userId === row.userId)) {
            participants.push({ id: `p-${participants.length}`, mutedUntil: null, ...row });
          }
        }
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const target = participants.find((p) => p.id === where.id && (where.visibleFromAt !== null || p.visibleFromAt === null));
        if (target) Object.assign(target, data);
        return { count: target ? 1 : 0 };
      }),
      // 수신자 선정: 방·상태·발신자 제외만 평가하고, 자격(AND) 쪽은 아래 fake 멤버십으로 대신 판정한다.
      findMany: jest.fn(async ({ where }: { where: Row }) => participants.filter(
        (p) => p.chatRoomId === where.chatRoomId && p.status === where.status && p.userId !== where.userId.not
          && (isManager(p.userId, match.hostTeamId) || isManager(p.userId, match.approvedApplicantTeamId)),
      )),
    },
    v1TeamMatch: {
      // 자격 판정(teamMatchChatEntitlementWhere)은 호출자가 양 팀 중 한 곳의 owner/manager 인지로 대신한다.
      findFirst: jest.fn(async () => (
        isManager(caller, match.hostTeamId) || isManager(caller, match.approvedApplicantTeamId) ? match : null
      )),
    },
    v1TeamMembership: {
      findMany: jest.fn(async ({ where }: { where: Row }) => memberships.filter(
        (m) => where.teamId.in.includes(m.teamId) && where.role.in.includes(m.role) && m.status === where.status,
      )),
    },
    v1AdminUser: { findFirst: jest.fn(async () => null) },
    v1ChatMessage: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const message = { id: `message-${messages.length + 1}`, sentAt: new Date(), messageType: 'text', ...data };
        messages.push(message);
        return message;
      }),
      findFirst: jest.fn(async ({ where }: { where: Row }) => messages.find(
        (m) => m.chatRoomId === where.chatRoomId && m.senderUserId === where.senderUserId && m.systemEventType === where.systemEventType,
      ) ?? null),
    },
    $queryRaw: jest.fn(async () => []),
    v1NotificationPreference: { findMany: jest.fn(async () => []) },
    v1Notification: { createMany: jest.fn(async ({ data }: { data: Row[] }) => { notifications.push(...data); }) },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  return { prisma, participants, notifications, messages, memberships, as: (id: string) => { caller = id; } };
}

describe('ChatService — 팀매치 방 참여자 등록 (MD-QA #111)', () => {
  let world: ReturnType<typeof teamMatchWorld>;
  let service: ChatService;
  const realtimeGateway = { emitToUser: jest.fn() };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn() };
  const recipients = () => world.notifications.map((n) => n.recipientUserId).sort();
  const enrolled = () => world.participants.map((p) => p.userId).sort();

  beforeEach(async () => {
    world = teamMatchWorld();
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: world.prisma },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: WebPushService, useValue: webPushService },
        { provide: getLoggerToken(ChatService.name), useValue: logger },
      ],
    }).compile();
    service = module.get(ChatService);
  });
  afterEach(() => jest.clearAllMocks());

  it('호스트 팀장이 채팅을 열면 상대 팀 팀장·매니저도 참여자가 되어 첫 메시지 알림을 받는다', async () => {
    world.as(hostCaptain.id);
    const { roomId } = await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });
    expect(enrolled()).toEqual([awayCaptain.id, awayManager.id, hostCaptain.id].sort());
    expect(world.participants.find((p) => p.userId === awayCaptain.id)).toMatchObject({
      status: 'active', visibleFromAt: ROOM_CREATED_AT,
    });

    await service.sendMessage(hostCaptain, roomId, { content: '안녕하세요' });
    expect(recipients()).toEqual([awayCaptain.id, awayManager.id].sort());
  });

  it('일반 팀원·무관한 팀 운영진은 등록되지 않는다', async () => {
    world.as(hostCaptain.id);
    await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });
    expect(enrolled()).not.toContain(awayMember.id);
    expect(enrolled()).not.toContain(outsiderCaptain.id);
  });

  it('상대가 먼저 연 기존 방에서도 호스트의 첫 메시지가 상대 팀장에게 알림을 보낸다', async () => {
    world.as(hostCaptain.id);
    await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });
    world.participants.splice(0, world.participants.length, ...world.participants.filter((p) => p.userId === hostCaptain.id));
    expect(enrolled()).toEqual([hostCaptain.id]);

    await service.sendMessage(hostCaptain, 'room-1', { content: '먼저 보내요' });
    expect(recipients()).toEqual([awayCaptain.id, awayManager.id].sort());
  });

  it('참여자 행이 없는 상대 팀장이 주소로 바로 들어와도 거부되지 않고 등록된다', async () => {
    world.as(hostCaptain.id);
    await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });
    world.participants.splice(0, world.participants.length, ...world.participants.filter((p) => p.userId === hostCaptain.id));

    world.as(awayCaptain.id);
    await expect(service.sendMessage(awayCaptain, 'room-1', { content: '답장이에요' })).resolves.toMatchObject({ roomId: 'room-1' });
    expect(enrolled()).toContain(awayCaptain.id);
    expect(recipients()).toEqual([awayManager.id, hostCaptain.id].sort());
  });

  it('자격 없는 팀 운영진은 주소로 들어와도 등록되지 않고 403 이다', async () => {
    world.as(hostCaptain.id);
    await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });

    world.as(outsiderCaptain.id);
    await expect(service.sendMessage(outsiderCaptain, 'room-1', { content: '들어갈래요' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(enrolled()).not.toContain(outsiderCaptain.id);
  });

  it('스스로 방을 나간 상대 팀 운영진은 다시 등록되지 않는다', async () => {
    world.as(hostCaptain.id);
    await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });
    world.participants.find((p) => p.userId === awayManager.id)!.status = 'left';

    await service.sendMessage(hostCaptain, 'room-1', { content: '다시 보내요' });
    expect(world.participants.find((p) => p.userId === awayManager.id)!.status).toBe('left');
    expect(recipients()).toEqual([awayCaptain.id]);
  });

  describe('자동 등록된 상대 팀 운영진이 처음 방을 열 때', () => {
    const joinedLines = (userId: string) => world.messages.filter((m) => m.systemEventType === 'joined' && m.senderUserId === userId);

    it('직접 입장한 사람과 똑같이 들어왔어요 줄이 한 번 남는다', async () => {
      world.as(hostCaptain.id);
      await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });
      await service.detail(hostCaptain, 'room-1');
      expect(joinedLines(hostCaptain.id)).toHaveLength(1);
      expect(joinedLines(awayCaptain.id)).toHaveLength(0);

      world.as(awayCaptain.id);
      await service.detail(awayCaptain, 'room-1');
      expect(joinedLines(awayCaptain.id)).toHaveLength(1);
    });

    it('다시 열어도 줄은 하나다', async () => {
      world.as(hostCaptain.id);
      await service.resolve(hostCaptain, { targetType: 'team_match', targetId: 'tm-1' });

      world.as(awayCaptain.id);
      await service.detail(awayCaptain, 'room-1');
      await service.detail(awayCaptain, 'room-1');
      expect(joinedLines(awayCaptain.id)).toHaveLength(1);
    });
  });
});
