import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TeamContactsService } from './team-contacts.service';

// 이 레포의 유닛 테스트 관례: Prisma 는 전체 jest.fn() mock. 실 DB 를 쓰지 않는다.
function makePrisma() {
  const prisma: any = {
    v1TeamMembership: { findFirst: jest.fn() },
    v1TeamContact: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn().mockImplementation((cb: any) => cb(prisma));
  return prisma;
}

const actor = { id: 'u1', email: 'u1@t.example.test', accountStatus: 'active', onboardingStatus: 'completed' } as any;
const dto = { fromTeamId: 'A', message: '주말 경기 가능하실까요?' };

describe('TeamContactsService.create', () => {
  it('보내는 팀의 owner/manager 가 아니면 PERMISSION_DENIED 로 거부한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    // 권한이 없으면 생성 시도조차 하지 않는다
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('자기 팀에는 보낼 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'A', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_SELF_NOT_ALLOWED' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('같은 팀쌍에 이미 진행 중인 컨택이 있으면 새로 만들지 않고 기존 건을 알려준다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'existing', status: 'accepted' });
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toBeInstanceOf(ConflictException);

    // 양방향으로 조회했는지 — where 에 OR 두 방향이 다 들어있어야 한다
    const where = prisma.v1TeamContact.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromTeamId: 'A', toTeamId: 'B' }),
        expect.objectContaining({ fromTeamId: 'B', toTeamId: 'A' }),
      ]),
    );
    expect(where.status).toEqual({ in: ['requested', 'accepted'] });
  });

  it('24시간 내 발송이 한도에 닿으면 거부한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(10);
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('한도 직전(9건)이면 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(9);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested' });
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
  });

  it('생성 전에 팀쌍 advisory lock 을 먼저 잡는다 — 순서가 뒤바뀌면 동시 요청이 둘 다 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested' });
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

    await service.create(actor, 'zzz', { fromTeamId: 'aaa', message: 'hi there' });
    const forward = JSON.stringify(prisma.$executeRaw.mock.calls[0]);
    prisma.$executeRaw.mockClear();

    await service.create(actor, 'aaa', { fromTeamId: 'zzz', message: 'hi there' });
    const backward = JSON.stringify(prisma.$executeRaw.mock.calls[0]);

    expect(forward).toBe(backward);
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
    const service = new TeamContactsService(prisma);

    const result = await service.accept(actor, 'c1');
    expect(result.contact.status).toBe('accepted');
    expect(result.alreadyProcessed).toBe(false);
  });

  it('이미 수락된 컨택을 다시 수락하면 멱등하게 통과하고 다시 쓰지 않는다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({ ...contact, status: 'accepted' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    const result = await service.accept(actor, 'c1');
    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.v1TeamContact.updateMany).not.toHaveBeenCalled();
  });

  it('거절된 컨택은 수락할 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({ ...contact, status: 'declined' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT' },
    });
  });

  it('보낸 팀 운영진은 수락할 수 없다 — 수락 권한은 받는 팀에만 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    // 'B'(받는 팀) 멤버십 조회는 실패해야 한다
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

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
    const service = new TeamContactsService(prisma);

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT', details: { currentStatus: 'declined' } },
    });
  });
});

describe('TeamContactsService.listForTeam', () => {
  it('inbound 는 받은 것만, outbound 는 보낸 것만 조회한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findMany.mockResolvedValue([]);
    const service = new TeamContactsService(prisma);

    await service.listForTeam(actor, 'B', { direction: 'inbound' });
    expect(prisma.v1TeamContact.findMany.mock.calls[0][0].where).toMatchObject({ toTeamId: 'B' });

    prisma.v1TeamContact.findMany.mockClear();
    await service.listForTeam(actor, 'B', { direction: 'outbound' });
    expect(prisma.v1TeamContact.findMany.mock.calls[0][0].where).toMatchObject({ fromTeamId: 'B' });
  });

  it('limit+1 을 가져와 hasNext 를 판정하고 초과분은 잘라낸다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`, status: 'requested', expiresAt: new Date(Date.now() + 86_400_000),
      fromTeamId: 'A', toTeamId: 'B', message: 'hi', createdAt: new Date(),
    }));
    prisma.v1TeamContact.findMany.mockResolvedValue(rows);
    const service = new TeamContactsService(prisma);

    const result = await service.listForTeam(actor, 'B', { direction: 'inbound', limit: 2 });
    expect(prisma.v1TeamContact.findMany.mock.calls[0][0].take).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo.hasNext).toBe(true);
    expect(result.pageInfo.nextCursor).toBe('c1');
  });

  it('만료 시각이 지난 requested 항목은 목록에서도 expired 로 보인다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findMany.mockResolvedValue([{
      id: 'c1', status: 'requested', expiresAt: new Date(Date.now() - 1000),
      fromTeamId: 'A', toTeamId: 'B', message: 'hi', createdAt: new Date(),
    }]);
    const service = new TeamContactsService(prisma);

    const result = await service.listForTeam(actor, 'B', { direction: 'inbound' });
    expect(result.items[0].status).toBe('expired');
  });

  it('상세는 보낸 팀 운영진도 볼 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000), message: 'hi', createdAt: new Date(),
    });
    // 받는 팀('B') 조회는 실패, 보낸 팀('A') 조회는 성공
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.detail(actor, 'c1')).resolves.toMatchObject({ id: 'c1' });
  });

  it('양쪽 어디에도 속하지 않으면 상세를 볼 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000), message: 'hi', createdAt: new Date(),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma);

    await expect(service.detail(actor, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
