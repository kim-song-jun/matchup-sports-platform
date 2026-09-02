import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeamContactsService } from './team-contacts.service';

// 이 레포의 유닛 테스트 관례: Prisma 는 전체 jest.fn() mock. 실 DB 를 쓰지 않는다.
function makePrisma() {
  const prisma: any = {
    v1TeamMembership: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1TeamContact: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    // Task 2: 발신 가드(차단 + 수신정책)가 추가되면서 필요해진 mock.
    // 기본값은 "차단 없음 + 정책 open" — 기존 30개 테스트가 이 가드를 통과해야 하므로.
    v1TeamContactBlock: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    v1Team: {
      findFirst: jest.fn().mockResolvedValue({ contactPolicy: 'open' }),
      update: jest.fn(),
    },
    v1TeamMatch: { findFirst: jest.fn() },
    // Task 1: 컨택 생성이 채팅방·참가자·첫 메시지를 함께 만든다 — 스펙 §3.2.
    v1ChatRoom: { create: jest.fn().mockResolvedValue({ id: 'room-1' }), update: jest.fn(), findUnique: jest.fn() },
    v1ChatRoomParticipant: { createMany: jest.fn() },
    v1ChatMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1', sentAt: new Date() }) },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn().mockImplementation((cb: any) => cb(prisma));
  return prisma;
}

// Task 8: TeamContactsService 생성자가 NotificationsService 를 받게 되면서 추가된 헬퍼.
// emitToManyDeferred/emitNotification 만 스텁하면 되므로 실제 클래스를 만들지 않는다.
function makeNotifications() {
  return { emitToManyDeferred: jest.fn(), emitNotification: jest.fn() } as any;
}

const actor = { id: 'u1', email: 'u1@t.example.test', accountStatus: 'active', onboardingStatus: 'completed' } as any;
const dto = { fromTeamId: 'A', message: '주말 경기 가능하실까요?' };

describe('TeamContactsService.create', () => {
  it('보내는 팀의 owner/manager 가 아니면 PERMISSION_DENIED 로 거부한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    // 권한이 없으면 생성 시도조차 하지 않는다
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('자기 팀에는 보낼 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'A', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_SELF_NOT_ALLOWED' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('같은 팀쌍에 이미 진행 중인 컨택이 있으면 새로 만들지 않고 기존 건을 알려준다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'existing', status: 'accepted' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: {
        code: 'TEAM_CONTACT_ALREADY_ACTIVE',
        details: { existingContactId: 'existing', existingStatus: 'accepted' },
      },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('중복 확인은 방향과 무관하게 본다 — 상대가 우리에게 보낸 건이 있어도 막는다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'inbound', status: 'requested' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).rejects.toBeInstanceOf(ConflictException);

    // 양방향 OR 과 만료 인지 상태 OR 이 AND 로 함께 들어있어야 한다 —
    // 만료된 requested 는 활성으로 치지 않아야 재발송을 막지 않는다.
    const where = prisma.v1TeamContact.findFirst.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ fromTeamId: 'A', toTeamId: 'B' }),
            expect.objectContaining({ fromTeamId: 'B', toTeamId: 'A' }),
          ]),
        }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ status: 'accepted' }),
            expect.objectContaining({
              status: 'requested',
              expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
            }),
          ]),
        }),
      ]),
    );
  });

  it('만료된 대기 건은 재발송을 막지 않는다 — 같은 트랜잭션 안에서 정리 후 생성한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    // 정리 후 재조회하면 활성 건이 없다(만료된 requested 는 활성이 아니므로)
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested', fromTeamId: 'A', toTeamId: 'B' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });

    // 만료된 대기 건 정리 updateMany 가 이 팀쌍을 대상으로 호출됐는지
    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'requested',
          expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: { status: 'expired' },
      }),
    );
    expect(prisma.v1TeamContact.create).toHaveBeenCalled();
  });

  it('아직 만료 전인 대기 건은 여전히 재발송을 막는다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'still-active', status: 'requested' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_ALREADY_ACTIVE' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('24시간 내 발송이 한도에 닿으면 거부한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(10);
    const service = new TeamContactsService(prisma, makeNotifications());

    // 레이트 리밋은 409(상태 충돌)가 아니라 429 여야 한다 — 스펙 §8(a) 와 프론트가 그렇게 가정한다.
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      status: 429,
      response: { code: 'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('한도 직전(9건)이면 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(9);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested', fromTeamId: 'A', toTeamId: 'B' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
  });

  it('생성 전에 팀쌍 advisory lock 을 먼저 잡는다 — 순서가 뒤바뀌면 동시 요청이 둘 다 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested', fromTeamId: 'A', toTeamId: 'B' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const order: string[] = [];
    prisma.$executeRaw.mockImplementation(() => { order.push('lock'); return Promise.resolve(1); });
    prisma.v1TeamContact.findFirst.mockImplementation(() => { order.push('dupCheck'); return Promise.resolve(null); });

    await service.create(actor, 'B', dto);
    expect(order[0]).toBe('lock');
    expect(order).toContain('dupCheck');
  });

  it('락 키는 팀 id 를 정렬해서 만든다 — A→B 와 B→A 가 같은 락을 잡아야 한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await service.create(actor, 'zzz', { fromTeamId: 'aaa', message: 'hi there' });
    const forward = JSON.stringify(prisma.$executeRaw.mock.calls[0]);
    prisma.$executeRaw.mockClear();

    await service.create(actor, 'aaa', { fromTeamId: 'zzz', message: 'hi there' });
    const backward = JSON.stringify(prisma.$executeRaw.mock.calls[0]);

    expect(forward).toBe(backward);
  });

  it('생성 트랜잭션 안에서 채팅방·양 팀 운영진 참가자·첫 메시지를 함께 만든다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamMembership.findMany.mockResolvedValue([
      { userId: 'u1' }, { userId: 'u2' }, { userId: 'u2' }, // 중복 1개
    ]);
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested' });
    prisma.v1ChatRoom.create.mockResolvedValue({ id: 'room-1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const result = await service.create(actor, 'B', dto);

    expect(result).toMatchObject({ id: 'c1', chatRoomId: 'room-1', route: '/chat/room-1' });
    expect(prisma.v1ChatRoom.create).toHaveBeenCalledWith({ data: { teamContactId: 'c1', status: 'active' } });
    const participantRows = prisma.v1ChatRoomParticipant.createMany.mock.calls[0][0].data;
    expect(participantRows.map((row: any) => row.userId).sort()).toEqual(['u1', 'u2']);
    expect(participantRows.every((row: any) => row.visibleFromAt instanceof Date)).toBe(true);
    expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chatRoomId: 'room-1', senderUserId: 'u1', body: dto.message, messageType: 'text' }),
      }),
    );
    expect(prisma.v1ChatRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'room-1' }, data: { lastMessageAt: expect.any(Date) } }),
    );
    // 알림은 roomId 로 간다 (딥링크가 /chat/{roomId})
    expect(service['notifications'].emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function), 'team_contact_received', 'room-1', undefined,
    );
  });

  it('진행 중인 컨택이 있으면 그 방 id 도 함께 알려준다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'existing', status: 'requested', chatRoom: { id: 'room-9' } });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_ALREADY_ACTIVE', details: { existingContactId: 'existing', existingChatRoomId: 'room-9' } },
    });
  });
});

describe('TeamContactsService 응답 처리', () => {
  const contact = {
    id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it('받는 팀 운영진이 수락하면 accepted 로 바뀐다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...contact, status: 'accepted' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const result = await service.accept(actor, 'c1');
    expect(result.contact.status).toBe('accepted');
    expect(result.alreadyProcessed).toBe(false);
  });

  it('이미 수락된 컨택을 다시 수락하면 멱등하게 통과하고 다시 쓰지 않는다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({ ...contact, status: 'accepted' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const result = await service.accept(actor, 'c1');
    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.v1TeamContact.updateMany).not.toHaveBeenCalled();
  });

  it('거절된 컨택은 수락할 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({ ...contact, status: 'declined' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT' },
    });
  });

  it('보낸 팀 운영진은 수락할 수 없다 — 수락 권한은 받는 팀에만 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    // 'B'(받는 팀) 멤버십 조회는 실패해야 한다
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.accept(actor, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    const where = prisma.v1TeamMembership.findFirst.mock.calls[0][0].where;
    expect(where.teamId).toBe('B');
  });

  it('철회는 보낸 팀 운영진만 할 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...contact, status: 'withdrawn' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const result = await service.withdraw(actor, 'c1');
    expect(result.contact.status).toBe('withdrawn');
    // 보낸 팀('A') 기준으로 권한을 봤는지
    expect(prisma.v1TeamMembership.findFirst.mock.calls[0][0].where.teamId).toBe('A');
  });

  // 만료: 이 레포에는 cron 인프라(@nestjs/schedule)가 0건이므로 배치가 아니라 읽기 시점에 처리한다
  it('만료 시각이 지난 requested 컨택은 수락할 수 없고 expired 로 간주한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      ...contact,
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT' },
    });
  });

  it('만료된 컨택을 읽으면 DB 상태도 expired 로 정리한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      ...contact,
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await service.accept(actor, 'c1').catch(() => undefined);
    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'c1', status: 'requested' }),
        data: { status: 'expired' },
      }),
    );
  });

  // 동시 응답 경쟁: 스펙상 응답자가 팀장+운영진 전원이라 여러 명이 동시에 누를 수 있다.
  // 마지막 write 가 findUnique 로 읽은 상태만 믿고 가드 없이 update 하면, 두 응답자가
  // 동시에 서로 다른 상태로 전이시킬 때 나중에 쓴 쪽이 조용히 이긴다 — updateMany +
  // status 가드로 막는다.
  it('응답 write 는 status=requested 가드를 건 updateMany 를 쓴다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...contact, status: 'accepted' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await service.accept(actor, 'c1');

    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'c1', status: 'requested' }),
      }),
    );
  });

  it('선점당했지만 결과가 같으면(동시에 같은 응답) 멱등하게 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    // 우리가 requested 를 읽은 뒤, 우리가 쓰기 전에 다른 응답자가 먼저 같은 상태로 전이시켰다
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 0 });
    prisma.v1TeamContact.findUnique.mockResolvedValueOnce(contact)
      .mockResolvedValueOnce({ ...contact, status: 'accepted' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const result = await service.accept(actor, 'c1');
    expect(result.alreadyProcessed).toBe(true);
    expect(result.contact.status).toBe('accepted');
  });

  it('선점당했고 결과가 다르면(먼저 거절됨) 충돌로 던진다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 0 });
    // 최초 findUnique 는 requested 를 보여줬지만, 쓰기 직전에 다른 응답자가 declined 로 전이시켰다
    prisma.v1TeamContact.findUnique.mockResolvedValueOnce(contact)
      .mockResolvedValueOnce({ ...contact, status: 'declined' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT', details: { currentStatus: 'declined' } },
    });
  });

  // Task 2: 응답이 방에 시스템 메시지를 남기고 알림이 채팅방(roomId)으로 간다 — 스펙 §3.4·§6.
  it('수락하면 방에 시스템 메시지를 남기고 lastMessageAt 을 갱신하며 roomId 로 알림을 보낸다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const contact = { id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested', expiresAt: new Date(Date.now() + 86400000) };
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...contact, status: 'accepted' });
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1' });
    const notifications = makeNotifications();
    const service = new TeamContactsService(prisma, notifications);

    const result = await service.accept(actor, 'c1');

    expect(result).toMatchObject({ alreadyProcessed: false, chatRoomId: 'room-1' });
    expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ chatRoomId: 'room-1', messageType: 'system', body: '컨택을 수락했어요' }) }),
    );
    expect(prisma.v1ChatRoom.update).toHaveBeenCalled();
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(expect.any(Function), 'team_contact_accepted', 'room-1', undefined);
  });
});

describe('TeamContactsService 응답 시스템 메시지 — 세 전이 모두', () => {
  const base = { id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested', expiresAt: new Date(Date.now() + 86400000) };

  it.each([
    ['accepted', (s: TeamContactsService) => s.accept(actor, 'c1'), '컨택을 수락했어요', null],
    ['declined', (s: TeamContactsService) => s.decline(actor, 'c1', { reason: '이번 주는 어려워요' }), '컨택을 거절했어요', '이번 주는 어려워요'],
    ['withdrawn', (s: TeamContactsService) => s.withdraw(actor, 'c1'), '컨택을 철회했어요', null],
  ] as const)('%s → 시스템 메시지 본문이 고정 문구이고 거절 사유는 컨택 행에만 저장된다', async (nextStatus, act, body, declineReason) => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findUnique.mockResolvedValue(base);
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...base, status: nextStatus, declineReason });
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    await act(service);

    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: nextStatus, declineReason }) }),
    );
    const message = prisma.v1ChatMessage.create.mock.calls[0][0].data;
    expect(message).toMatchObject({ chatRoomId: 'room-1', messageType: 'system', systemEventType: null, body });
    // 거절 사유가 시스템 메시지 본문으로 새지 않는다(스펙 결정 7)
    expect(message.body).not.toContain('이번 주는 어려워요');
  });
});

describe('TeamContactsService 응답 알림 — 방이 없는 레거시 컨택', () => {
  it('방이 없으면 contactId 로 폴백하지 않고 targetId 없이 알린다 (/chat/{contactId} 는 깨진 링크)', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const contact = { id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested', expiresAt: new Date(Date.now() + 86400000) };
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...contact, status: 'accepted' });
    prisma.v1ChatRoom.findUnique.mockResolvedValue(null);
    const notifications = makeNotifications();
    const service = new TeamContactsService(prisma, notifications);

    const result = await service.accept(actor, 'c1');

    expect(result.chatRoomId).toBeNull();
    expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(expect.any(Function), 'team_contact_accepted', null, undefined);
  });
});

describe('TeamContactsService.summary', () => {
  it('운영 팀 전체의 대기 중 받은 컨택을 팀별로 세고, 세기 전에 만료 건을 정리한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findMany.mockResolvedValue([{ teamId: 'A' }, { teamId: 'B' }]);
    prisma.v1TeamContact.groupBy.mockResolvedValue([{ toTeamId: 'A', _count: { _all: 2 } }]);
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.summary(actor)).resolves.toEqual({
      pendingInbound: 2,
      byTeam: [{ teamId: 'A', pendingInbound: 2 }, { teamId: 'B', pendingInbound: 0 }],
    });
    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ toTeamId: { in: ['A', 'B'] }, status: 'requested' }),
        data: { status: 'expired' },
      }),
    );
  });

  it('운영 팀이 없으면 DB 를 쓰지 않고 0 을 돌려준다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findMany.mockResolvedValue([]);
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.summary(actor)).resolves.toEqual({ pendingInbound: 0, byTeam: [] });
    expect(prisma.v1TeamContact.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1TeamContact.groupBy).not.toHaveBeenCalled();
  });
});

describe('TeamContactsService 알림 발송', () => {
  it('컨택을 보내면 받는 팀 운영진 전원에게 알림을 예약한다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', toTeamId: 'B', fromTeamId: 'A' });
    const service = new TeamContactsService(prisma, notifications);

    await service.create(actor, 'B', dto);

    // Task 1 부터 알림은 컨택 id 가 아니라 채팅방 id 로 간다 (딥링크가 /chat/{roomId}).
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function), 'team_contact_received', 'room-1', undefined,
    );
    // 수신자 해석 함수가 실제로 받는 팀의 owner/manager 를 조회하는지
    const resolveUserIds = notifications.emitToManyDeferred.mock.calls[0][0];
    prisma.v1TeamMembership.findMany = jest.fn().mockResolvedValue([{ userId: 'x' }]);
    await expect(resolveUserIds()).resolves.toEqual(['x']);
    expect(prisma.v1TeamMembership.findMany.mock.calls[0][0].where).toMatchObject({
      teamId: 'B', status: 'active', role: { in: ['owner', 'manager'] },
    });
  });

  it('수락하면 보낸 팀 운영진에게 알린다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    // 브리프 원안은 `.update` 를 목했지만 respond() 는 동시 응답 경쟁을 막기 위해
    // status=requested 가드를 건 `updateMany` 를 쓴다(위 '응답 처리' describe 참고).
    // `.update` 만 목하면 makePrisma() 기본값인 updateMany→{count:0} 때문에 이 콜이
    // 선점당한 것으로 오인돼 STATE_CONFLICT 로 던져버린다 — 실제 성공 경로를 타도록 맞춘다.
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'accepted',
    });
    // 컨택 = 채팅방. 알림 targetId 는 roomId(딥링크 /chat/{roomId}).
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1' });
    const service = new TeamContactsService(prisma, notifications);

    await service.accept(actor, 'c1');
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function), 'team_contact_accepted', 'room-1', undefined,
    );
  });

  it('철회는 알림을 보내지 않는다 — 상대가 아직 반응하지 않았으므로 소음이다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    // 위 accept 테스트와 같은 이유로 updateMany 를 성공 경로로 목한다.
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'withdrawn' });
    const service = new TeamContactsService(prisma, notifications);

    await service.withdraw(actor, 'c1');
    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });

  it('멱등 재수락이면 알림을 다시 보내지 않는다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'accepted',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, notifications);

    await service.accept(actor, 'c1');
    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });
});

describe('발신 가드 — 차단·수신정책', () => {
  function acceptingPrisma() {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue(null);
    prisma.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'open' });
    return prisma;
  }

  it('차단이 없고 정책이 open 이면 발신된다', async () => {
    const prisma = acceptingPrisma();
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
  });

  it('받는 팀이 나를 차단했으면 거부한다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      status: 403,
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTING' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('차단 검사는 양방향이다 — 내가 상대를 차단한 경우도 막는다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await service.create(actor, 'B', dto).catch(() => undefined);
    const where = prisma.v1TeamContactBlock.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamId: 'B', blockedTeamId: 'A' }),
        expect.objectContaining({ teamId: 'A', blockedTeamId: 'B' }),
      ]),
    );
  });

  it("정책이 closed 면 거부한다 — 차단과 **같은** 코드·메시지여야 한다", async () => {
    const prisma = acceptingPrisma();
    prisma.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'closed' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      status: 403,
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTING' },
    });
  });

  it('recruiting_only 인데 모집 중인 팀매치가 없으면 거부한다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'recruiting_only' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTING' },
    });
  });

  it('recruiting_only 이고 host 로 모집 중인 팀매치가 있으면 발신된다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'recruiting_only' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue({ id: 'tm1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
    // '모집 중' = 이 팀이 host 인 recruiting 팀매치 (스펙 §2 확정 결정 5)
    const where = prisma.v1TeamMatch.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ hostTeamId: 'B', status: 'recruiting' });
  });

  it('세 거부 사유가 서로 구분되지 않는다 — 차단 여부를 역추론할 수 없어야 한다', async () => {
    const bodies: unknown[] = [];
    for (const setup of [
      (p: any) => { p.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' }); },
      (p: any) => { p.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'closed' }); },
      (p: any) => {
        p.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'recruiting_only' });
        p.v1TeamMatch.findFirst.mockResolvedValue(null);
      },
    ]) {
      const prisma = acceptingPrisma();
      setup(prisma);
      const service = new TeamContactsService(prisma, makeNotifications());
      const err: any = await service.create(actor, 'B', dto).catch((e) => e);
      bodies.push({ status: err.status, code: err.response.code, message: err.response.message });
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
  });

  // 리뷰 라운드 1 (I1): 응답 본문이 같아도 DB 왕복 횟수가 사유마다 다르면(차단=1,
  // closed=2, recruiting_only=3) 발신자가 응답 지연시간으로 "우리가 차단당했구나"를
  // 역추론할 수 있다. 세 조회를 항상 병렬 실행하도록 고쳤으니, 세 거부 사유 모두
  // block/team/teamMatch 조회가 정확히 같은 횟수(1회씩) 일어나야 한다.
  // 소프트 삭제된 팀이 컨택을 계속 받으면 고아 row 가 생긴다. 같은 파일의 assertCanManageTeam·
  // assertParticipantSide 는 둘 다 status/deletedAt 을 거는데 이 조회만 빠져 있었다.
  // mock 환경에서는 where 절을 직접 단언하는 것이 이 필터를 잠글 유일한 방법이다 —
  // 필터를 지우면 이 단언이 깨진다(구현을 되읊는 게 아니라 계약을 고정한다).
  it('수신 팀 조회가 삭제·비활성 팀을 제외한다', async () => {
    const prisma = acceptingPrisma();
    const service = new TeamContactsService(prisma, makeNotifications());

    await service.create(actor, 'B', dto).catch(() => undefined);

    expect(prisma.v1Team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', deletedAt: null }),
      }),
    );
  });

  it('왕복 횟수가 거부 사유와 무관하게 일정하다 — 타이밍으로 차단 여부를 역추론할 수 없어야 한다', async () => {
    const counts: Array<{ block: number; team: number; teamMatch: number }> = [];
    for (const setup of [
      (p: any) => { p.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' }); },
      (p: any) => { p.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'closed' }); },
      (p: any) => {
        p.v1Team.findFirst.mockResolvedValue({ contactPolicy: 'recruiting_only' });
        p.v1TeamMatch.findFirst.mockResolvedValue(null);
      },
    ]) {
      const prisma = acceptingPrisma();
      setup(prisma);
      const service = new TeamContactsService(prisma, makeNotifications());
      await service.create(actor, 'B', dto).catch(() => undefined);
      counts.push({
        block: prisma.v1TeamContactBlock.findFirst.mock.calls.length,
        team: prisma.v1Team.findFirst.mock.calls.length,
        teamMatch: prisma.v1TeamMatch.findFirst.mock.calls.length,
      });
    }
    expect(counts[0]).toEqual(counts[1]);
    expect(counts[1]).toEqual(counts[2]);
    // 실제로 매 시나리오 1회씩 호출됐는지(0회로 스킵되는 경로가 남아있지 않은지)도 함께 확인.
    expect(counts[0]).toEqual({ block: 1, team: 1, teamMatch: 1 });
  });
});

describe('차단 관리', () => {
  it('차단 목록은 그 팀 운영진만 볼 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.listBlocks(actor, 'B')).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('자기 팀은 차단할 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.createBlock(actor, 'A', { blockedTeamId: 'A' })).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_SELF_BLOCK_NOT_ALLOWED' },
    });
  });

  it('이미 차단한 팀을 다시 차단하면 멱등하게 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1', blockedTeamId: 'B' });
    const service = new TeamContactsService(prisma, makeNotifications());
    const r = await service.createBlock(actor, 'A', { blockedTeamId: 'B' });
    expect(r.alreadyBlocked).toBe(true);
    expect(prisma.v1TeamContactBlock.create).not.toHaveBeenCalled();
  });

  // 리뷰 라운드 1 (I2): 없는 blockedTeamId 를 보내면 create() 시점 FK 위반(P2003)으로
  // raw 500 이 났다. 실재하지 않는 팀은 404 로 명시적으로 거부해야 한다.
  it('없는 팀을 차단 대상으로 지정하면 TEAM_NOT_FOUND 404 를 던진다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1Team.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.createBlock(actor, 'A', { blockedTeamId: 'ghost' })).rejects.toMatchObject({
      status: 404,
      response: { code: 'TEAM_NOT_FOUND' },
    });
    expect(prisma.v1TeamContactBlock.create).not.toHaveBeenCalled();
  });

  // 리뷰 라운드 1 (C1): findFirst 로 사전 확인해도 findFirst 와 create() 사이에 틈이
  // 있다 — 동시 요청(더블클릭·재시도) 두 개가 그 틈을 지나가면 두 번째 create() 가
  // @@unique([teamId, blockedTeamId]) 제약(P2002)에 걸린다. 이 저장소엔 전역 P2002
  // 예외 필터가 없어 잡지 않으면 raw 500 + 영어 메시지가 나간다. 차단은 멱등이 자연스러운
  // 결과이므로 P2002 를 잡아 findFirst 경로와 완전히 같은 응답으로 수렴해야 한다.
  it('findFirst 와 create 사이 경합으로 P2002 가 나면 raw 500 대신 멱등하게 수렴한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1Team.findFirst.mockResolvedValue({ id: 'B', contactPolicy: 'open' });
    // 사전 조회 시점엔 없었지만(findFirst → null), create() 가 경합에 져 P2002 로 실패한다.
    prisma.v1TeamContactBlock.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'b1', blockedTeamId: 'B' }); // P2002 이후 재조회
    prisma.v1TeamContactBlock.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`team_id`,`blocked_team_id`)', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new TeamContactsService(prisma, makeNotifications());

    const r = await service.createBlock(actor, 'A', { blockedTeamId: 'B' });
    expect(r.alreadyBlocked).toBe(true);
    expect(r.block).toMatchObject({ id: 'b1' });
    expect(prisma.v1TeamContactBlock.findFirst).toHaveBeenCalledTimes(2);
  });

  it('P2002 가 아닌 다른 에러는 그대로 다시 던진다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1Team.findFirst.mockResolvedValue({ id: 'B', contactPolicy: 'open' });
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue(null);
    const boom = new Error('connection lost');
    prisma.v1TeamContactBlock.create.mockRejectedValue(boom);
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.createBlock(actor, 'A', { blockedTeamId: 'B' })).rejects.toBe(boom);
  });
});

describe('수신 정책', () => {
  it('그 팀 운영진만 바꿀 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.updateContactPolicy(actor, 'A', { contactPolicy: 'closed' }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('정책을 바꾸면 그 값으로 저장한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1Team.update.mockResolvedValue({ id: 'A', contactPolicy: 'recruiting_only' });
    const service = new TeamContactsService(prisma, makeNotifications());
    const r = await service.updateContactPolicy(actor, 'A', { contactPolicy: 'recruiting_only' });
    expect(r.contactPolicy).toBe('recruiting_only');
    expect(prisma.v1Team.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'A' }, data: { contactPolicy: 'recruiting_only' } }),
    );
  });
});
